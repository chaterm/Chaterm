# Chaterm 贡献指南

我们非常欢迎您的贡献！本指南将帮助您了解如何有效地为 Chaterm 项目做出贡献。

## 贡献方式

- 🐛 **报告 Bug** - 帮助我们识别和修复问题
- 💬 **讨论代码** - 参与技术讨论
- 🔧 **提交修复** - 修复 Bug 和改进现有功能
- ✨ **提出功能** - 建议新功能
- 📖 **改进文档** - 完善文档和指南
- 🧪 **添加测试** - 提高测试覆盖率

我们使用 GitHub 来托管代码、跟踪问题和功能请求，以及接受 Pull Request。

### 贡献者工作流程

1. Fork 本仓库到您的个人账号
2. 从 `main` 分支创建您的开发分支
3. 在您的 Fork 仓库中进行开发
4. 完成后向原仓库的 `main` 分支提交 Pull Request
5. 在 PR 描述中说明修复的 Issue（如适用）
6. 获得至少一位维护者的批准后，PR 将被合并

## 本地开发环境设置

1. 克隆仓库：

```bash
# 在 GitHub 上 Fork 仓库，然后克隆您的 Fork
git clone https://github.com/YOUR_USERNAME/Chaterm.git
cd Chaterm
```

2. 安装必要的开发工具:
   - 安装 [Node.js](https://nodejs.org/) (推荐使用最新的 LTS 版本)

3. 安装 Electron:
   - 更换npm源为最新淘宝源:
     ```bash
     npm config set registry https://registry.npmmirror.com
     ```
   - 编辑npm 配置文件
     ```bash
     npm config edit
     ```
   - 在打开的配置文件中，添加以下镜像源配置：
     ```bash
     electron_mirror=https://cdn.npmmirror.com/binaries/electron/
     electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/
     ```
   - 保存并关闭配置文件后，在命令行中安装 Electron：
     ```bash
     npm i electron -D
     ```

4. 安装项目依赖：

   ```bash
   node scripts/patch-package-lock.js
   npm install
   ```

5. 启动开发服务器：

```bash
npm run dev
```

## 项目结构

```
Chaterm/
├── src/
│   ├── main/          # Electron 主进程
│   ├── preload/       # 预加载脚本
│   └── renderer/      # Vue.js 前端
├── scripts/           # 构建和开发脚本
├── resources/         # 应用资源（图标等）
├── tests/            # 测试文件
└── docs/             # 文档
```

## 代码质量标准

### 代码风格

- **ESLint**: JavaScript/TypeScript 代码检查
- **Prettier**: 代码格式化
- **TypeScript**: 推荐使用强类型

### 质量检查

```bash
# 格式化代码
npm run format

# 检查代码问题
npm run lint

# 类型检查
npm run typecheck

# 运行测试
npm test

# 构建验证
npm run build
```

## PR 指南

### 什么是优秀的 PR

✅ **明确的目的**

- 单一、专注的更改
- 清晰的标题和描述
- 引用相关问题

✅ **高质量的代码**

- 遵循项目编码标准
- 包含适当的测试
- 注释良好的代码
- 无破坏性更改（除非有意为之）

✅ **文档**

- 更新相关文档
- 包含使用示例
- 记录新功能

✅ **测试**

- 为新功能编写单元测试
- 为复杂功能编写集成测试
- 手动测试验证

### PR 模板

创建 PR 时，请包含：

```markdown
## 描述

简要描述更改内容

## 更改类型

- [ ] Bug 修复
- [ ] 新功能
- [ ] 破坏性更改
- [ ] 文档更新

## 测试

- [ ] 本地测试通过
- [ ] 手动测试完成
- [ ] 截图（UI 更改）

## 检查清单

- [ ] 代码遵循风格指南
- [ ] 自我审查完成
- [ ] 文档已更新
- [ ] 无破坏性更改
```

### 提交信息

使用约定式提交格式：

```
feat: 添加新功能
fix: 修复组件中的 Bug
docs: 更新 README
refactor: 改进代码结构
test: 添加单元测试
```

## 获取帮助

- 📝 **文档**: 首先查看现有文档
- 💬 **讨论**: 使用 GitHub Discussions 提问
- 🐛 **问题**: 通过 issue 报告 Bug，并提供详细信息
- 💡 **想法**: 通过 issue 提出功能建议

## 有问题？

如果您有任何关于贡献的问题，请使用 "question" 标签创建一个 issue。

## 许可证

通过为 Chaterm 做出贡献，您同意您的贡献将按照与项目相同的条款进行许可。
