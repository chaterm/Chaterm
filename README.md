<div align="center">
  <a href="./README_zh.md">中文</a> / English
</div>

# Chaterm
No need to learn complicated regular expressions, Perl and Python, switches and Linux commands, SQL syntax can easily manage thousands of devices!

Is the full screen of errors difficult to understand? Massive log output, don't know how to locate the problem? Ask @host directly!

Want syntax highlighting and smart completion, but don't have root privileges, and don't want to install fish thousands of times, use Chaterm to solve it with one click!

## Demo Display
![Preview image](demo.jpg)

## Main Features

- 🤖️ AI Agent：Use natural language to instead of remember the complex command line.
- ✅ Smart Completion：Command suggestion base your personal knowledge across multiple os platform.
- 🌟 Global Syntax Highlight：Personalization syntax highlighting on no matter whatever shell you use.
- 📄 Visual Vim Editor：Get visual text editor experience in terminal Vim like Sublime Text.
- 🎹 Short aliases：instead of complex code snippets across multiple terminal.

## Security Features
- 🔐 Zero Trust：No need to worry about update passwords and SSH certificates monthly again.
- 💼 IAM and Workspace：Make collaboration easier in same team and isolation between different teams.
- 🔏 Privacy watermark：screen recording, Clipboard and data transmission control.
- 🔎 Behavior Audits：Advanced pattern recognition and anomaly detection in user operations.

## Project Setup

### Install Electron

```sh
1、update npm registry
npm config set registry https://registry.npmmirror.com

2、npm config
npm config edit

3、Set configuration at the end:
electron_mirror=https://cdn.npmmirror.com/binaries/electron/
electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/

4、install Electron：
npm i electron -D

```

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

### Local front-end and back-end debugging

<p>Modify the electron.vite.config.ts file and set the target to the local URL address.</p>

## Contributors

In this era full of unlimited opportunities and challenges, a group of DevOps partners from different backgrounds gathered here with their dreams. They used their spare time to create this ingenious tool.

We hope it will become a reliable partner for you to improve efficiency and quality of life. At the same time, we also look forward to more like-minded friends joining us to create a better future together!


