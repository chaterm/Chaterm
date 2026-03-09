<div align="center">
  中文 / <a href="./README.md">English</a> / <a href="./README_ja.md">日本語</a>
</div>
<br>

<p align="center">
  <a href="https://www.tbench.ai/leaderboard/terminal-bench/1.0"><img src="https://img.shields.io/badge/Terminal--Bench-Ranked_%232-00D94E?style=for-the-badge&logo=github&logoColor=white" alt="Terminal-Bench"></a>
  <a href="https://aws.amazon.com/cn/blogs/china/chaterm-aws-kms-envelope-encryption-for-zero-trust-security-en/"><img src="https://img.shields.io/badge/AWS-Security-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white&labelColor=232F3E" alt="AWS Security"></a>
  <a href="https://landscape.cncf.io/?item=provisioning--automation-configuration--chaterm"><img src="https://img.shields.io/badge/CNCF-Landscape-0086FF?style=for-the-badge&logo=kubernetes&logoColor=white" alt="CNCF Landscape"></a>
  <p align="center">
</p>

<p align="center">
  <a href="https://github.com/chaterm/Chaterm/releases"><img src="https://img.shields.io/github/v/release/chaterm/Chaterm" alt="Releases"></a>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/github/package-json/dependency-version/chaterm/Chaterm/dev/electron" alt="electron-version"></a>
  <a href="https://vitejs.dev/"><img src="https://img.shields.io/github/package-json/dependency-version/chaterm/Chaterm/dev/vite" alt="vite-version"></a>
  <a href="https://vuejs.org/"><img src="https://img.shields.io/github/package-json/dependency-version/chaterm/Chaterm/dev/vue" alt="vue-version"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/github/package-json/dependency-version/chaterm/Chaterm/dev/typescript" alt="typescript-version"></a>
</p>

<p align="center">
  <a href="https://chaterm.ai/download/"><img src="https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="macOS"></a>
  <a href="https://chaterm.ai/download/"><img src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows"></a>
  <a href="https://chaterm.ai/download/"><img src="https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Linux"></a>
  <a href="https://apps.apple.com/us/app/chaterm/id6754307456"><img src="https://img.shields.io/badge/iOS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="iOS"></a>
  <a href="https://play.google.com/store/apps/details?id=com.intsig.chaterm.global"><img src="https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Android"></a>
  <a href="https://aws.amazon.com/marketplace/"><img src="https://img.shields.io/badge/AWS-Marketplace-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white&labelColor=232F3E" alt="AWS Marketplace"></a>
  <p align="center">
</p>

# 产品介绍

Chaterm: 您的下一代AI终端副驾驶!

Chaterm是一款AI原生的智能终端Agent，旨在通过自然语言交互重构传统的命令行操作体验。它的目标是成为您的DevOps智能副驾驶，而非仅仅是一个带对话框的SSH客户端。

通过内置的专家知识库与强大的 Agent 推理能力，Chaterm能够理解您的业务拓扑与操作意图。无需记忆复杂的 Shell 指令、SQL 语法或脚本参数，即可通过自然语言自动完成代码构建、服务部署、故障排查及自动回滚等全链路操作。Chaterm 致力于消除技术栈的认知门槛，让每一位开发者都能即刻拥有资深SRE的运维能力。

![Preview image](resources/hero.webp)

## 核心特性

- 🤖 **AI Agent 助手**

  将复杂运维任务拆解为可执行步骤，通过闭环 AI 执行，实现从日志分析到服务回滚的自动化操作。

- 🧠 **智能命令推荐**

  不仅记录历史命令，还能根据用户习惯、当前基础设施环境和多服务器上下文，实时推荐最合适的操作命令。

- 🎙️ **语音与对话式操作**

  在移动设备上通过语音和对话式交互执行命令，摆脱虚拟键盘限制，特别适合远程运维与紧急故障处理场景。

- 🎨 **现代化终端体验**

  跨设备自动同步主题、配置和语法高亮。支持可视化 Vim 编辑、多语言语法高亮，以及类似 WinSCP 的跨主机文件同步。

- 🧩 **知识库 + Agent Skills**

  支持长期记忆，支持导入技术手册、内部文档和脚本，构建个人知识库。结合 Agent Skills，让 AI 在真实运维场景中更智能、更可靠。

- 🛡️ **零信任安全架构**

  内置企业级安全设计，通过会话级身份认证确保所有操作可审计、可追溯，并符合零信任安全体系。

- 🔌 **插件生态系统**

  通过插件扩展能力，统一管理公有云、网络设备、容器和 K8s。结合 IAM 权限控制，实现基础设施资产的统一授权与集中管理。

![Preview image](resources/features.webp)

## 开发指南

### Install Electron

```sh
1、更换npm源为最新淘宝源
npm config set registry https://registry.npmmirror.com

2、编辑npm 配置文件
npm config edit

3、在打开的配置文件中，添加以下镜像源配置：
electron_mirror=https://cdn.npmmirror.com/binaries/electron/
electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/

4、保存并关闭配置文件后，在命令行中安装 Electron：
npm i electron -D

```

### Install

```bash
node scripts/patch-package-lock.js
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
# For windows
npm run build:win

# For macOS
npm run build:mac

# For Linux
npm run build:linux
```

## Contributors

感谢您为Chaterm做出贡献！请参阅<a href="./CONTRIBUTING_zh.md">贡献指南</a>获取更多信息。

<div align=center style="margin-top: 30px;">
  <a href="https://github.com/chaterm/Chaterm/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=chaterm/Chaterm" />
  </a>
</div>
