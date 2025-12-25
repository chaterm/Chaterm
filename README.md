<div align="center">
  <a href="./README_zh.md">中文</a> / English
</div>
<br>

<p align="center">
  <a href="https://www.tbench.ai/leaderboard/terminal-bench/1.0"><img src="https://img.shields.io/badge/Terminal--Bench-Ranked_%232-00D94E?style=for-the-badge&logo=github&logoColor=white" alt="Terminal-Bench"></a>
  <a href="https://landscape.cncf.io/?item=provisioning--automation-configuration--chaterm"><img src="https://img.shields.io/badge/CNCF-Landscape-0086FF?style=for-the-badge&logo=kubernetes&logoColor=white" alt="CNCF Landscape"></a>
</p>

<p align="center">
<img src="https://img.shields.io/github/package-json/dependency-version/chaterm/Chaterm/dev/electron" alt="electron-version">
<img src="https://img.shields.io/github/package-json/dependency-version/chaterm/Chaterm/dev/electron-vite" alt="electron-vite-version" />
<img src="https://img.shields.io/github/package-json/dependency-version/chaterm/Chaterm/dev/electron-builder" alt="electron-builder-version" />
<img src="https://img.shields.io/github/package-json/dependency-version/chaterm/Chaterm/dev/vite" alt="vite-version" />
<img src="https://img.shields.io/github/package-json/dependency-version/chaterm/Chaterm/dev/vue" alt="vue-version" />
<img src="https://img.shields.io/github/package-json/dependency-version/chaterm/Chaterm/dev/typescript" alt="typescript-version" />
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

- 🤖 Autonomous Agent Engine: Capable of breaking down and planning complex tasks, supporting closed-loop automated operations from log analysis to service rollback.

- 🧠 Intelligent Contextual Completion: Going beyond traditional history recording, it provides more personalized intelligent command suggestions based on user habits, current business context, and cross-server environment.

- 🎙️ Real-time Voice Interaction: Breaking keyboard limitations, it supports voice command input on mobile devices, significantly improving remote maintenance and emergency response efficiency.

- 🎨 Globally Consistent Experience: Configuration Roaming: Configure syntax highlighting and environment preferences once, and automatically synchronize upon login from any host. Visual Vim: Provides a modern IDE-like file editing experience within the terminal, supporting multi-language syntax highlighting.

- 🛡️ Enterprise-Grade Zero-Trust Security: Integrates a session-level seamless authentication system, fully supporting a zero-trust security architecture to ensure every operation is compliant and traceable.

- 🔗 MCP Protocol Ecosystem: Fully supports the Model Context Protocol (MCP), enabling low-cost access to enterprise knowledge bases such as Notion and GitHub, achieving unlimited expansion of AI skills.

- 🏢 Unified Workspace: Supports Alias ​​shortcut sharing and enterprise-level SSO unified authorization, efficiently managing digital assets across organizations.

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
![Preview image](resources/contributors.webp)
