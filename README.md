<div align="center">
  <a href="./README_zh.md">中文</a> / English / <a href="./README_ja.md">日本語</a>
</div>
<br>

<p align="center">
  <a href="https://www.tbench.ai/leaderboard/terminal-bench/1.0"><img src="https://img.shields.io/badge/Terminal--Bench-Ranked_%232-00D94E?style=for-the-badge&logo=github&logoColor=white" alt="Terminal-Bench"></a>
  <a href="https://landscape.cncf.io/?item=provisioning--automation-configuration--chaterm"><img src="https://img.shields.io/badge/CNCF-Landscape-0086FF?style=for-the-badge&logo=kubernetes&logoColor=white" alt="CNCF Landscape"></a>
  <a href="https://aws.amazon.com/cn/blogs/china/chaterm-aws-kms-envelope-encryption-for-zero-trust-security-en/"><img src="https://img.shields.io/badge/AWS-Security-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white&labelColor=232F3E" alt="AWS Security"></a>
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
</p>

# Introduction

Chaterm: Your Next-Generation AI Terminal Co-pilot!

Chaterm is an AI-native intelligent terminal agent designed to reshape the traditional command-line experience through natural language interaction. Its goal is to be your intelligent DevOps co-pilot, not just a dialog-based SSH client.

With its built-in expert knowledge base and powerful agent inference capabilities, Chaterm understands your business topology and operational intentions. No need to memorize complex shell commands, SQL syntax, or script parameters; it automatically completes the entire chain of operations, including code building, service deployment, troubleshooting, and automatic rollback, all through natural language. Chaterm aims to eliminate the cognitive barriers of the technology stack, enabling every developer to immediately possess the operational capabilities of a seasoned SRE.

![Preview image](resources/hero.webp)

## Key Features

- 🤖 **AI Agent Assistant**

  Breaks complex O&M tasks into executable steps, automating operations from log analysis to service rollback through closed-loop AI execution.

- 🧠 **Intelligent Command Recommendation**

  Not only records historical commands, but also recommends the most suitable commands in real time based on user habits, current infrastructure environment, and multi-server context.

- 🎙️ **Voice and Conversational Operations**

  Execute commands via voice and conversational interaction on mobile devices, eliminating the limitations of virtual keyboards, making it particularly suitable for remote O&M and emergency fault handling scenarios.

- 🎨 **Modern Terminal Experience**

  Automatically synchronizes themes, configurations, and syntax highlighting across devices. Supports visual Vim editing, multi-language syntax highlighting, and cross-host file synchronization similar to WinSCP.

- 🧩 **Knowledge Base + Agent Skills**

  Supports long-term memory and allows importing technical manuals, internal documents, and scripts to build a personal knowledge base. Combine Agent Skills to make AI more intelligent and reliable in real-world operations and maintenance scenarios.

- 🛡️ **Zero Trust Security Architecture**

  Built in enterprise-grade security design, ensuring all operations are auditable, traceable, and compliant with the zero trust security framework through session-level identity authentication.

- 🔌 **Plug-in Ecosystem**

  Extend capabilities through plugins for unified management of public cloud, network devices, containers, and Kubernetes. Combined with IAM access control, achieve unified authorization and centralized management of infrastructure assets.

![Preview image](resources/features.webp)

## Development Guide

### Install Electron

```sh
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

Thank you for your contribution!
Please refer to the <a href="./CONTRIBUTING.md">Contribution Guide</a> for more information.

<div align=center style="margin-top: 30px;">
  <a href="https://github.com/chaterm/Chaterm/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=chaterm/Chaterm" />
  </a>
</div>
