<div align="center">
  <a href="./README_zh.md">中文</a> / English / <a href="./README_ja.md">日本語</a>
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

# Introduction

Chaterm: Your Next-Generation AI Terminal Co-pilot!

Chaterm is an AI-native intelligent terminal agent designed to reshape the traditional command-line experience through natural language interaction. Its goal is to be your intelligent DevOps co-pilot, not just a dialog-based SSH client.

With its built-in expert knowledge base and powerful agent inference capabilities, Chaterm understands your business topology and operational intentions. No need to memorize complex shell commands, SQL syntax, or script parameters; it automatically completes the entire chain of operations, including code building, service deployment, troubleshooting, and automatic rollback, all through natural language. Chaterm aims to eliminate the cognitive barriers of the technology stack, enabling every developer to immediately possess the operational capabilities of a seasoned SRE.

![Preview image](resources/hero.webp)

## Key Features

- 🤖 **AI Agent**

  The Agent understands the target, autonomously plans, and performs problem analysis and root cause localization across multiple hosts, automatically closing the loop to complete complex process handling.

  Every operation is auditable and traceable, and supports rapid log rollback, making AI automation more secure and reliable in production environments.

- 🧠 **Smart completion**

  Combining user habits, local memory, and the current server context, the Agent recommends the most suitable commands, making terminal input smarter and more efficient.

  Supports cross-device session synchronization and reduces mobile input costs through quick commands and voice interaction, making remote maintenance smoother.

- 🧩 **Knowledge Base**

  Supports importing technical manuals, internal documents, scripts, and white papers to build a personal maintenance knowledge system.

  Chaterm understands the current infrastructure context and accurately retrieves relevant knowledge to assist in task decision-making and execution.

- ⚡ **Agent Skill**

  Encapsulates complex maintenance processes into reusable AI skills, achieving structured and reliable automated execution.

  Help teams accumulate operational experience, enabling AI to be applied securely and stably in real production environments.

- 🔌 **Plugin System**

  Through plugin extensions, achieve unified authentication, dynamic authorization, and secure encrypted connections for public cloud servers and Kubernetes.

  Provide a more efficient resource access experience and facilitate centralized infrastructure management.

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
