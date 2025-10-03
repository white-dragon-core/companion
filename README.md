# TestEZ Companion CLI (TypeScript)

TypeScript 版本的 TestEZ Companion CLI，用于从命令行运行 Roblox 测试。

## 功能特性

- **命令行测试执行**: 从命令行轻松运行 TestEZ 测试
- **多场景支持**: 支持同时运行多个 Roblox Studio 场景的测试
- **项目匹配验证**: 通过项目名称和 Git 哈希确保测试运行在正确的项目上
- **智能端口管理**: 自动检测可用端口 (28900-28902)
- **美观的结果输出**: 彩色输出显示测试结果，支持仅显示失败测试
- **实时日志显示**: 显示来自 Roblox Studio 的日志和输出信息
- **Rojo 集成**: 支持从 Rojo 配置文件读取游戏名称
- **TypeScript 实现**: 完全类型安全的代码实现

## 安装

### 开发环境

```bash
# 安装依赖
pnpm install

# 构建项目
pnpm build

# 运行开发版本
pnpm dev
```

### 生产环境

```bash
# 构建并运行
pnpm build
pnpm start
```

## 使用方法

### 基本使用

1. 确保 `testez-companion.toml` 配置文件存在
2. 在 Roblox Studio 中打开你的项目并安装 TestEZ Companion 插件
3. 运行 CLI

### 命令行参数

```bash
# 基本用法
pnpm dev                              # 开发模式
pnpm start                           # 生产模式 (需要先 build)

# 指定特定游戏名称（避免多场景冲突）
pnpm dev -- -g "MyGameName"         # 只处理指定名称的游戏
pnpm dev -- --game-name "MyGameName"

# 使用 Rojo 配置文件
pnpm dev -- -r "my-project.json"    # 从指定 Rojo 配置读取游戏名称
pnpm dev -- --rojo-config "path/to/config.json"

# 自定义测试路径（覆盖配置文件）
pnpm dev -- -p "game/ServerStorage/Tests" "game/ReplicatedStorage/Tests"
pnpm dev -- --paths "game/ServerStorage/Tests" "game/ReplicatedStorage/Tests"

# 测试名称过滤
pnpm dev -- -n "UserService"        # 只运行名称包含 "UserService" 的测试
pnpm dev -- --test-name "Database"  # 只运行名称包含 "Database" 的测试

# 输出选项
pnpm dev -- --only-print-failures   # 只显示失败的测试

# 组合使用示例
pnpm dev -- -g "MyGame" --only-print-failures
pnpm dev -- -r "production.project.json" --only-print-failures
pnpm dev -- -n "UserService" --only-print-failures
```

### 参数说明

| 参数 | 短参数 | 说明 | 示例 |
|------|--------|------|------|
| `--game-name` | `-g` | 指定要处理的游戏名称 | `-g "MyGame"` |
| `--rojo-config` | `-r` | Rojo 配置文件路径 | `-r "default.project.json"` |
| `--paths` | `-p` | 自定义测试路径（可多个） | `-p "path1" "path2"` |
| `--test-name` | `-n` | 只运行名称包含此模式的测试 | `-n "UserService"` |
| `--only-print-failures` | 无 | 只显示失败的测试 | `--only-print-failures` |

### 注意事项

- `-g` 和 `-r` 参数不能同时使用
- 如果不指定游戏名称，CLI 会在检测到多个场景时提供交互式选择
- 项目匹配基于游戏名称和 Git 哈希值，确保测试运行在正确的项目上
- 测试名称过滤使用 Lua 模式匹配，支持通配符和正则表达式

### 测试名称过滤说明

`-n/--test-name` 参数允许你只运行名称包含指定模式的测试。这对于：
- **开发特定功能时**：只运行相关测试，如 `-n "UserService"`
- **调试特定问题**：只运行失败的测试模块，如 `-n "Database"`
- **快速验证**：运行特定组件的测试，如 `-n "UI"`

模式匹配示例：
- `-n "User"` - 匹配所有包含 "User" 的测试（如 "UserService", "UserManager"）
- `-n "^User"` - 匹配以 "User" 开头的测试
- `-n "Test$"` - 匹配以 "Test" 结尾的测试

## 工作流程

### 1. 项目初始化
CLI 启动时会自动执行以下步骤：
- 运行 `scripts/generate-project-info.js` 生成项目信息
- 基于当前 Git 状态计算项目哈希值
- 读取 `testez-companion.toml` 配置文件
- 在端口 28900-28902 中找到可用端口启动服务器

### 2. Studio 连接验证
当 Roblox Studio 尝试连接时：
- **项目匹配检查**: 验证 Studio 中的项目名称和哈希值
- **游戏名称过滤**: 如果指定了 `-g` 参数，只接受匹配的游戏
- **多场景处理**: 支持多个 Studio 实例，但一次只处理一个活动场景

### 3. 测试执行流程
```
CLI 启动 → 生成项目信息 → 启动 HTTP 服务器 → 等待 Studio 连接
    ↓
Studio 轮询 /poll 端点 → 项目验证 → 发送测试配置
    ↓
Studio 执行测试 → 发送日志到 /logs → 发送结果到 /results
    ↓
CLI 显示结果 → 退出 (成功: 0, 失败: 1)
```

### 4. 端点说明
- `GET /poll`: Studio 轮询获取测试配置，包含项目验证逻辑
- `POST /logs`: 接收 Studio 发送的实时日志信息
- `POST /results`: 接收测试结果并显示，然后退出程序

## 配置文件

### testez-companion.toml

在项目根目录创建 `testez-companion.toml` 配置文件：

```toml
# 必需：测试根路径列表
roots = [
    "game/ReplicatedStorage/Tests",
    "game/ServerStorage/Tests", 
    "game/ServerScriptService/Tests"
]

# 可选：额外的测试选项
[test_extra_options]
# 这里可以添加传递给 TestEZ 的额外参数
# 具体选项取决于你的 TestEZ 版本和需求
```

### Rojo 项目配置

CLI 支持从 Rojo 配置文件读取游戏名称。确保你的 `default.project.json`（或其他指定的配置文件）包含 `name` 字段：

```json
{
  "name": "MyAwesomeGame",
  "tree": {
    "$className": "DataModel",
    "ReplicatedStorage": {
      "$className": "ReplicatedStorage",
      "Shared": {
        "$path": "src/shared"
      }
    },
    "ServerScriptService": {
      "$className": "ServerScriptService",
      "Server": {
        "$path": "src/server"
      }
    }
  }
}
```

### 项目信息文件

CLI 会自动生成 `TestService/testez-companion-info.model.json` 文件，包含：
- 项目名称（从 Rojo 配置读取）
- Git 哈希值（基于当前工作区状态）
- 生成时间戳

此文件用于项目匹配验证，确保 Studio 中运行的项目与本地一致。

## 故障排除

### 常见问题

#### 1. 连接超时 "Connection timeout!"
**原因**：CLI 在 30 秒内未收到 Studio 连接

**解决方案**：
- 确保 Roblox Studio 正在运行
- 检查 TestEZ Companion 插件是否已安装并启用
- 确认 Studio 中打开的项目名称与配置匹配
- 检查防火墙是否阻止了端口 28900-28902
- 确保项目在 Git 仓库中且有有效的 project.json 文件

#### 2. 项目匹配失败 "Project mismatch"
**原因**：Studio 中的项目与本地项目信息不匹配

**解决方案**：
- 检查 Studio 中的游戏名称是否与 Rojo 配置中的 `name` 字段一致
- 确保本地代码已保存并提交到 Git（哈希值基于工作区状态）
- 如果使用 `-g` 参数，确保名称完全匹配
- 检查 `TestService/testez-companion-info.model.json` 文件是否存在且有效

#### 3. 端口占用 "All ports (28900-28902) are in use"
**原因**：所有可用端口都被占用

**解决方案**：
- 关闭其他正在运行的 TestEZ Companion 实例
- 检查是否有其他程序占用这些端口
- 重启系统释放端口

#### 4. 配置文件错误 "Failed to load config"
**原因**：`testez-companion.toml` 文件不存在或格式错误

**解决方案**：
- 确保配置文件存在于项目根目录
- 检查 TOML 语法是否正确
- 确保 `roots` 数组至少包含一个路径

#### 5. Rojo 配置文件问题
**原因**：指定的 Rojo 配置文件不存在或无效

**解决方案**：
- 使用 `-r` 参数指定正确的配置文件路径
- 确保 JSON 格式正确且包含 `name` 字段
- 检查文件路径是否正确

### 调试信息

CLI 提供详细的调试信息：
- **项目信息**：启动时显示本地项目名称和哈希值
- **连接状态**：显示等待连接的状态和已连接的场景
- **项目验证**：显示项目匹配检查的详细过程
- **端口信息**：显示使用的端口号

### 获取帮助

如果问题仍未解决：
1. 检查控制台输出中的详细错误信息
2. 确认所有依赖项都已正确安装
3. 查看 Studio 输出窗口中的错误信息
4. 确保使用的是兼容版本的 TestEZ 和插件

## API 端点

- `GET /poll` - Studio 轮询获取测试配置，包含项目验证
- `POST /logs` - 接收 Studio 发送的实时日志信息  
- `POST /results` - 接收测试结果并显示输出

## 开发脚本

- `pnpm build` - 构建 TypeScript 代码到 `dist/` 目录
- `pnpm build:plugin` - 安装 rokit 工具并构建 Roblox 插件
- `pnpm dev` - 运行开发版本（使用 ts-node）
- `pnpm start` - 运行生产版本（需要先执行 build）
- `pnpm watch` - 监视文件变化并自动重新构建
- `pnpm typecheck` - 运行 TypeScript 类型检查（不生成文件）
- `pnpm postinstall` - 安装后钩子，自动安装 rokit 工具和更新子模块

## 项目结构

```
├── src/                    # TypeScript 源代码
│   ├── index.ts           # 主程序入口，CLI 参数处理和服务器启动
│   ├── config.ts          # TOML 配置文件加载和解析
│   ├── state.ts           # 应用状态管理，项目匹配逻辑
│   ├── testez.ts          # TestEZ 相关类型定义
│   ├── api/               # HTTP API 端点处理器
│   │   ├── index.ts       # API 导出
│   │   ├── poll.ts        # /poll 端点，处理 Studio 连接和配置
│   │   ├── logs.ts        # /logs 端点，处理日志输出
│   │   └── results.ts     # /results 端点，处理测试结果
│   └── types/             # TypeScript 类型定义
│       └── index.ts       # 通用类型定义
├── scripts/               # 辅助脚本
│   └── generate-project-info.js  # 生成项目信息和 Git 哈希
├── plugin/                # Roblox Studio 插件代码
├── dist/                  # 编译后的 JavaScript 代码
├── TestService/           # 自动生成的测试服务文件
│   └── testez-companion-info.model.json  # 项目信息文件
├── testez-companion.toml  # 主配置文件
├── package.json           # Node.js 依赖和脚本配置
└── tsconfig.json         # TypeScript 编译配置
```

### 核心组件说明

- **index.ts**: 程序入口，负责 CLI 参数解析、项目信息生成、服务器启动和连接管理
- **state.ts**: 管理应用状态，包含项目匹配验证逻辑，支持多场景和多项目
- **api/poll.ts**: 处理 Studio 的轮询请求，执行项目验证和配置分发
- **api/results.ts**: 处理测试结果，提供彩色输出和失败过滤功能
- **scripts/generate-project-info.js**: 基于 Git 状态生成项目哈希，用于项目匹配

## 许可证

MIT