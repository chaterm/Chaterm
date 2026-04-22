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
<p align="center">
<a href="https://scorecard.dev/viewer/?uri=github.com/chaterm/Chaterm">
  <img src="https://api.scorecard.dev/projects/github.com/chaterm/Chaterm/badge" alt="OpenSSF Scorecard">
</a>
<a href="https://www.bestpractices.dev/projects/12617">
  <img src="https://www.bestpractices.dev/projects/12617/badge" alt="OpenSSF Best Practices">
</a>
  <img src="https://img.shields.io/codecov/c/github/chaterm/Chaterm?style=flat&logo=codecov" alt="Coverage">
  <img src="https://img.shields.io/badge/AI-Native-blue?style=flat" alt="AI Native">
  <a href="https://x.com/chaterm_ai"><img src="https://img.shields.io/twitter/follow/chaterm_ai?style=flat&logo=x&logoColor=white&label=Follow" alt="Follow on X"></a>
  <a href="https://discord.gg/AgsYzwRp62"><img src="https://img.shields.io/badge/discord-join-5865F2?logo=discord&logoColor=white" alt="Discord"></a>
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

## 目录

- [产品介绍](#产品介绍)
- [为什么选择 Chaterm](#为什么选择-chaterm)
- [核心特性](#核心特性)
- [开发指南](#开发指南)
  - [Install Electron](#install-electron)
  - [Install](#install)
  - [Development](#development)
  - [Build](#build)
- [Chaterm 参考文档](https://chaterm.cn/docs/)
  - [Achieving Secure and Intelligent Operations for AWS Private Subnets Using Chaterm](https://aws.amazon.com/cn/blogs/china/bastion-using-aws-eice-ec2-instance-connect-endpoint-chaterm-implement-subnet-security-intelligent-en/)
  - [How Chaterm’s Security Architecture Ensures Data Security and Reliability](https://aws.amazon.com/cn/blogs/china/chaterm-aws-kms-envelope-encryption-for-zero-trust-security-en/)
  - [Enhancing DevOps Intelligence with Chaterm Skills and Qwen Models](https://chaterm.ai/blog/posts/agent-skills)
- [Gold Sponsors](#gold-sponsors)
- [Contributors](#contributors)

# 产品介绍

Chaterm 是一款专为基础设施和云资源管理而构建的 AI 原生终端。它使工程师能够使用自然语言执行部署服务、故障排除和解决问题等复杂任务。

凭借其内置的专家级知识库和强大的代理推理能力，Chaterm 能够理解您的业务拓扑和运维目标。无需记忆复杂的命令、语法或参数，只需用自然语言描述您的任务目标，Chaterm 即可自主规划并执行跨多个主机或集群的复杂操作，包括代码构建、服务部署、故障诊断和自动回滚等关键流程。

Chaterm 依靠长期记忆和团队知识库，学习团队知识和用户习惯。它的目标是成为您智能的 DevOps 副驾驶，通过可重用的代理技能，帮助工程师更高效地完成日常任务。Chaterm 旨在降低不同技术栈带来的认知障碍，使每位开发人员都能快速获得高级 SRE 的运维经验和执行能力。

![Preview image](resources/hero.webp)

![Preview image](resources/hero2.webp)

## 为什么选择 Chaterm

Chaterm 不仅仅是一个更智能的终端，它是一个基础设施代理。
有句话说，每个 Agent 都会时常失败，但 Chaterm 帮助你修复它。

- 🤖 从命令到执行 - 描述任务，让 AI 规划并执行

- 🌐 专为真实基础设施打造 - 服务器、Kubernetes 和多集群工作流

- 🔁 可复用的 Agent 技能 - 将经验转化为自动化

- 🧠 上下文感知智能 - 理解你的系统，而不仅仅是命令

- 🛡️ 安全可控 - 可审计、可审查、支持回滚

## 核心特性

- 🤖 **AI 智能代理**

  Agent 能理解目标，自主规划，并跨越多台主机完成问题分析与根因定位，自动闭环完成复杂的流程处理。

  每一步操作均可审核与追溯，并支持快速日志回滚，让 AI 自动化在生产环境中更加安全可靠。

- 🧠 **智能命令推荐**

  结合用户习惯、本地记忆及当前服务器上下文，推荐最合适的命令，让终端输入更智能、更高效。

  支持跨设备会话同步，并通过快捷命令与语音交互减少移动端输入成本，使远程运维更加流畅。

- 🧩 **用户知识库**

  支持导入技术手册、内部文档、脚本和白皮书，构建个人运维知识体系。

  Chaterm 能理解当前基础设施上下文并精准检索相关知识，辅助任务决策与执行。

- ⚡ **Agent Skill**

  将复杂运维流程封装为可复用的 AI 技能，实现结构化、可靠的自动化执行。

  帮助团队沉淀运维经验，使 AI 能安全、稳定地应用于真实生产环境。

- 🔌 **插件系统**

  通过插件扩展，实现对公有云服务器与 Kubernetes 的统一认证、动态授权与安全加密连接。

  提供更高效的资源访问体验，助力基础设施的集中化管理。

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

## Gold Sponsors

![Preview image](resources/aws.webp) ![Preview image](resources/aliyun.webp)

## Contributors

感谢您为Chaterm做出贡献！请参阅<a href="./CONTRIBUTING_zh.md">贡献指南</a>获取更多信息。

<div align=center style="margin-top: 30px;">
  <a href="https://github.com/chaterm/Chaterm/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=chaterm/Chaterm&refresh=true" />
  </a>
</div>
