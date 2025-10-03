#!/usr/bin/env node

import express from 'express';
import { program } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import net from 'net';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { loadConfig } from './config';
import { AppState, Place, ProjectInfo } from './state';
import { createPollHandler, createLogsHandler, createResultsHandler } from './api';

const AVAILABLE_PORTS = [28900, 28901, 28902];const WAIT_TIMEOUT = 30000; // 增加到 30 秒，给 Studio 更多连接时间
const CHECK_INTERVAL = 100;

async function selectPlace(state: AppState): Promise<string> {
  const places = Array.from(state.getPlaces().entries());

  const choices = places.map(([guid, place]) => ({
    name: `${place.name} (${place.id}) [${guid}]`,
    value: guid
  }));

  const { selectedPlace } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedPlace',
      message: 'Select a place to run tests on:',
      choices
    }
  ]);

  return selectedPlace;
}

async function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(): Promise<number | null> {
  for (const port of AVAILABLE_PORTS) {
    if (await checkPortAvailable(port)) {
      return port;
    }
  }
  return null;
}

async function waitForPlaces(state: AppState, gameName: string | null): Promise<void> {
  const startTime = Date.now();

  console.error(chalk.dim('Waiting for place(s) to check in...'));
  if (gameName) {
    console.error(chalk.yellow(`Looking for game named: "${gameName}"`));
  }

  let lastLogTime = Date.now();
  const LOG_INTERVAL = 5000; // 每 5 秒记录一次状态

  while (Date.now() - startTime < WAIT_TIMEOUT) {
    const places = state.getPlaces();
    const activePlace = state.getActivePlace();

    // 如果已经有 active place，直接返回
    if (activePlace) {
      console.error(chalk.green(`Active place set: ${activePlace}`));
      console.error(chalk.dim(`Waiting for results from place ${activePlace}...`));
      return;
    }

    // 定期输出状态信息
    if (Date.now() - lastLogTime > LOG_INTERVAL) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.error(chalk.dim(`Still waiting for Studio connection... (${elapsed}s elapsed, will timeout at ${WAIT_TIMEOUT / 1000}s)`));
      if (places.size > 0) {
        console.error(chalk.dim(`  Places in waiting list: ${places.size}`));
      }
      lastLogTime = Date.now();
    }

    if (places.size > 0) {
      let placeGuid: string | null = null;

      // If gameName is specified, find matching place
      if (gameName) {
        for (const [guid, place] of places.entries()) {
          if (place.name === gameName) {
            placeGuid = guid;
            break;
          }
        }
        if (!placeGuid) {
          // Wait for the specific game to connect
          await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
          continue;
        }
      } else {
        // No gameName specified, use existing logic
        if (places.size === 1) {
          const firstKey = places.keys().next();
          if (firstKey.done) continue;
          placeGuid = firstKey.value;
        } else {
          placeGuid = await selectPlace(state);
        }
      }

      console.error(chalk.green(`Setting active place: ${placeGuid}`));
      state.setActivePlace(placeGuid);
      console.error(chalk.dim(`Waiting for results from place ${placeGuid}...`));
      return;
    }

    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
  }

  // 超时后的详细错误信息
  console.error(chalk.red('\nConnection timeout!'));
  console.error(chalk.red(`No Studio connection received within ${WAIT_TIMEOUT / 1000} seconds.`));
  console.error(chalk.yellow('\nPossible reasons:'));
  console.error(chalk.yellow('1. Roblox Studio is not running'));
  console.error(chalk.yellow('2. TestEZ plugin is not installed in Studio'));
  console.error(chalk.yellow('3. The game in Studio has a different name than expected'));
  console.error(chalk.yellow('4. Studio is running a different project (name+hash mismatch)'));
  console.error(chalk.yellow('5. Network/firewall is blocking the connection on ports 28900-28902'));
  const acceptedProjects = state.getAcceptedProjects();
  if (acceptedProjects.length > 0) {
    console.error(chalk.yellow(`\n已接受的项目:`));
    acceptedProjects.forEach(project => {
      console.error(chalk.yellow(`  - ${project.name} (hash: ${project.hash})`));
    });
  } else if (state.localProject) {
    console.error(chalk.yellow(`\nExpecting project: ${state.localProject.name} (hash: ${state.localProject.hash})`));
  }
  console.error(chalk.yellow('\nPlease ensure Studio is running with the TestEZ plugin installed and the correct project loaded.'));
  process.exit(1);
}

async function main() {
  program
    .argument('[pattern]', 'Test name pattern to filter tests (same as -n option)')
    .option('-g, --game-name <name>', 'Specify the game name to handle')
    .option('-r, --rojo-config <path>', 'Path to Rojo configuration JSON file', 'default.project.json')
    .option('-p, --paths <paths...>', 'Custom test paths (overrides config file)')
    .option('-n, --test-name <pattern>', 'Only run tests whose names contain this pattern')
    .option('--only-print-failures', 'Only print test failures')
    .parse(process.argv);

  const options = program.opts();
  const [pattern] = program.args;

  // Validate mutual exclusion of -g and -r
  if (options.gameName && options.rojoConfig && options.rojoConfig !== 'default.project.json') {
    console.error(chalk.red('Error: Cannot use both -g and -r options simultaneously.'));
    process.exit(1);
  }

  try {
    // 首先运行 generate-project-info.js 脚本
    let projectInfo: ProjectInfo | null = null;
    try {
      const scriptPath = path.join(__dirname, '..', 'scripts', 'generate-project-info.js');
      // 如果指定了 -r 参数，传递给脚本
      const scriptArgs = options.rojoConfig && options.rojoConfig !== 'default.project.json'
        ? `-r "${options.rojoConfig}"`
        : '';
      execSync(`node "${scriptPath}" ${scriptArgs}`, { stdio: 'pipe' });

      // 读取生成的项目信息文件
      try {
        const projectInfoPath = path.join(process.cwd(), 'TestService', 'testez-companion-info.model.json');
        const projectInfoContent = await fs.readFile(projectInfoPath, 'utf-8');
        const projectData = JSON.parse(projectInfoContent);
        // 从 Roblox model.json 格式中提取信息
        if (projectData.Properties && projectData.Properties.Attributes) {
          const attributes = projectData.Properties.Attributes;
          if (attributes.name?.String && attributes.hash?.String) {
            projectInfo = {
              name: attributes.name.String,
              hash: attributes.hash.String,
              date: attributes.date?.String
            };
          }
        }
      } catch (readError) {
        // 静默处理
      }
    } catch (error) {
      // 即使生成失败，也尝试读取已存在的项目信息文件
      try {
        const projectInfoPath = path.join(process.cwd(), 'TestService', 'testez-companion-info.model.json');
        const projectInfoContent = await fs.readFile(projectInfoPath, 'utf-8');
        const projectData = JSON.parse(projectInfoContent);
        // 从 Roblox model.json 格式中提取信息
        if (projectData.Properties && projectData.Properties.Attributes) {
          const attributes = projectData.Properties.Attributes;
          if (attributes.name?.String && attributes.hash?.String) {
            projectInfo = {
              name: attributes.name.String,
              hash: attributes.hash.String,
              date: attributes.date?.String
            };
          }
        }
      } catch (fallbackError) {
        // 静默处理
      }
    }

    const config = await loadConfig();

    // Override test roots if custom paths are provided
    if (options.paths && options.paths.length > 0) {
      config.roots = options.paths;
    }

    let gameName: string | null = null;

    if (options.gameName) {
      // Use -g option directly
      gameName = options.gameName;
    } else if (options.rojoConfig) {
      // Read name from Rojo config file
      try {
        const rojoConfigPath = path.resolve(options.rojoConfig);
        const rojoConfigContent = await fs.readFile(rojoConfigPath, 'utf-8');
        const rojoConfig = JSON.parse(rojoConfigContent);

        if (rojoConfig.name) {
          gameName = rojoConfig.name;
        }
      } catch (error) {
        if ((error as any).code === 'ENOENT') {
          console.error(chalk.red(`Error: Rojo config file not found: ${options.rojoConfig}`));
          console.error(chalk.yellow('提示: 可以使用 -r <path> 参数指定正确的 Rojo 配置文件路径'));
          process.exit(1);
        } else if (error instanceof SyntaxError) {
          console.error(chalk.red(`Error: Invalid JSON in Rojo config file: ${options.rojoConfig}`));
          process.exit(1);
        } else {
          console.error(chalk.red(`Error reading Rojo config file: ${error}`));
          process.exit(1);
        }
      }
    }

    // 如果没有明确指定 --only-print-failures，则默认只显示失败
    const onlyPrintFailures = options.onlyPrintFailures !== undefined ? options.onlyPrintFailures : true;

    const state = new AppState(config, onlyPrintFailures, projectInfo);
    state.gameName = gameName;
    // 位置参数优先级高于 -n 选项
    state.testNamePattern = pattern || options.testName || null;

    const app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    app.get('/poll', createPollHandler(state));
    app.post('/logs', createLogsHandler());
    app.post('/results', createResultsHandler(state));

    // Find available port
    const port = await findAvailablePort();
    if (!port) {
      console.error(chalk.red('All ports (28900-28902) are in use. Please close other instances.'));
      process.exit(1);
    }

    const server = app.listen(port, '127.0.0.1', () => {
      console.error(chalk.cyan(`\n=== TestEZ Companion CLI Started ===`));
      console.error(chalk.dim(`Server listening on http://127.0.0.1:${port}`));
      if (gameName) {
        console.error(chalk.green(`Handling game: ${gameName}`));
      }
      console.error(chalk.dim(`Waiting for Roblox Studio to connect...\n`));
    });

    // Start checking for places
    setTimeout(() => waitForPlaces(state, gameName), 1000);

  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}

main().catch(error => {
  console.error(chalk.red(`Fatal error: ${error}`));
  process.exit(1);
});