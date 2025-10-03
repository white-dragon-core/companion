const { execSync } = require('child_process');
const { rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// 解析命令行参数
const args = process.argv.slice(2);
const projectFileIndex = args.indexOf('-r');
const projectFilePath = projectFileIndex !== -1 && args[projectFileIndex + 1]
  ? args[projectFileIndex + 1]
  : 'default.project.json';

// 解析输出路径参数
const outputPath = args[0] || 'TestService/testez-companion-info.model.json';

// 1. 在操作系统的临时目录下创建一个唯一的临时文件名
const tempFileName = `git-index-${crypto.randomBytes(6).toString('hex')}`;
const tempFilePath = path.join(os.tmpdir(), tempFileName);

// 2. 使用 try...finally 确保临时文件总能被清理
let projectInfo = {};

try {
  // 检查是否在 Git 仓库中
  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
  } catch (gitError) {
    console.error('错误: 当前目录不是 Git 仓库，请先执行 git init');
    process.exit(1);
  }

  // 读取并解析 project.json 文件
  if (!existsSync(projectFilePath)) {
    console.error(`错误: 找不到项目文件 ${projectFilePath}`);
    process.exit(1);
  }

  const projectContent = readFileSync(projectFilePath, 'utf-8');
  const projectData = JSON.parse(projectContent);

  if (!projectData.name) {
    console.error(`错误: 项目文件 ${projectFilePath} 中缺少 name 属性`);
    process.exit(1);
  }

  projectInfo.name = projectData.name;

  // 准备 execSync 的 options, 关键是注入 GIT_INDEX_FILE 环境变量
  // 我们扩展了 process.env 以确保 git 能找到路径等其他重要变量
  const options = {
    env: {
      ...process.env,
      GIT_INDEX_FILE: tempFilePath,
    },
    stdio: 'pipe', // 抑制子命令的输出,除非出错
  };

  // 3. 执行 git 命令
  // 将所有工作区变更添加到临时索引中
  execSync('git add -A', options);

  // 基于临时索引生成树哈希, 并获取其输出
  const hash = execSync('git write-tree', options).toString().trim();
  projectInfo.hash = hash;

  // 添加生成时间
  projectInfo.date = new Date().toISOString();

  // 4. 构建指定格式的 JSON 结构
  const outputData = {
    "ClassName": "Folder",
    "Properties": {
      "Attributes": {
        "name": {"String": projectInfo.name},
        "hash": {"String": projectInfo.hash},
        "date": {"String": projectInfo.date}
      }
    }
  };

  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // 5. 输出到指定文件
  writeFileSync(outputPath, JSON.stringify(outputData, null, 2));

} catch (error) {
  if (error.stderr) {
    console.error('An error occurred:', error.stderr.toString());
  } else {
    console.error('An error occurred:', error.message || error);
  }
  process.exit(1);
} finally {
  // 5. 无论成功与否, 都清理掉临时索引文件
  if (existsSync(tempFilePath)) {
    rmSync(tempFilePath);
  }
}