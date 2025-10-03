import { Request, Response } from 'express';
import chalk from 'chalk';
import { AppState } from '../state';
import { ReporterChildNode, ReporterOutput, ReporterStatus } from '../testez';

function printChildren(state: AppState, children: ReporterChildNode[], indent: number = 0): boolean {
  let success = true;

  for (const child of children) {
    // 如果只显示失败测试，跳过非失败测试
    if (state.onlyLogFailures && child.status !== ReporterStatus.Failure) {
      continue;
    }

    // 如果使用了测试名称过滤，跳过被过滤掉的测试（状态为 Skipped）
    if (state.testNamePattern && child.status === ReporterStatus.Skipped) {
      // 但是仍然需要递归处理子节点，因为子节点可能有匹配的测试
      if (!printChildren(state, child.children, indent)) {
        success = false;
      }
      continue;
    }

    let styledPhrase: string;
    switch (child.status) {
      case ReporterStatus.Success:
        styledPhrase = chalk.green(`✓ ${child.planNode.phrase}`);
        break;
      case ReporterStatus.Failure:
        success = false;
        styledPhrase = chalk.red(`X ${child.planNode.phrase}`);
        break;
      case ReporterStatus.Skipped:
        styledPhrase = chalk.blue(`↪ ${child.planNode.phrase}`);
        break;
    }

    console.log(' '.repeat(indent) + styledPhrase);

    for (const error of child.errors) {
      const lines = error.split('\n');
      for (const line of lines) {
        console.log(' '.repeat(indent + 2) + line);
      }
    }

    if (!printChildren(state, child.children, indent + 2)) {
      success = false;
    }
  }

  return success;
}

export function createResultsHandler(state: AppState) {
  return async (req: Request, res: Response) => {
    const output: ReporterOutput = req.body;

    // 如果使用了测试名称过滤，显示提示信息
    if (state.testNamePattern) {
      console.log(chalk.cyan(`\n过滤测试: "${state.testNamePattern}" (已隐藏不匹配的测试)\n`));
    }

    const success = printChildren(state, output.children);

    // 只在测试树为空或没有子节点时打印顶层错误（处理特殊错误，如路径解析错误）
    if (output.errors && output.errors.length > 0 && output.children.length === 0) {
      console.log(chalk.red('\nErrors:'));
      for (const error of output.errors) {
        const lines = error.split('\n');
        for (const line of lines) {
          console.log('  ' + chalk.red(line));
        }
      }
    }

    console.log();
    console.log(chalk.green('✓ Success:'), output.successCount);
    console.log(chalk.red('X Failure:'), output.failureCount);
    console.log(chalk.blue('↪ Skip:'), output.skippedCount);

    res.status(200).send();

    // Exit after a short delay to ensure response is sent
    setTimeout(() => {
      process.exit(success ? 0 : 1);
    }, 100);
  };
}