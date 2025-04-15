# Chaterm

无需再学习复杂的正则表达式，Perl和Python，交换机和Linux命令，SQL语法也能轻松管理上千台设备！

满屏的报错难以理解？海量的日志输出不知道如何定位问题？直接@host提问吧！

想要语法高亮和智能补全，无奈没有root权限，也不想安装几千次fish，使用Chaterm一键解决！

## Demo Display
![Preview image](demo.png)

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

### 本地前后端调试

<p>打开electron.vite.config.ts文件，将target指向改为本地url地址即可。</p>

## Contributors

In this era of AI full of infinite possibilities, a group of devops from diverse backgrounds but with like-minded goals have come together here out of their love for technology and their shared pursuit of improving industry efficiency and enhancing the quality of life. They have crafted this ingenious tool in their spare time.
We hope this tool can light up a guiding light on your development journey and become a reliable partner to help you boost efficiency and improve your quality of life. We look forward to more like-minded friends joining us and working together to create a better future!


