<div align="center">
  <a href="./README_zh.md">中文</a> / <a href="./README.md">English</a> / 日本語
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

# 製品紹介

Chaterm: 次世代AIターミナルコパイロット!

Chatermは、自然言語インタラクションを通じて従来のコマンドライン操作体験を再構築することを目的としたAIネイティブのインテリジェントターミナルエージェントです。単なるダイアログ付きSSHクライアントではなく、あなたのインテリジェントなDevOpsコパイロットになることを目指しています。

内蔵の専門知識ベースと強力なエージェント推論機能により、Chatermはあなたのビジネストポロジーと操作意図を理解します。複雑なシェルコマンド、SQL構文、スクリプトパラメータを覚える必要はなく、自然言語でコードビルド、サービスデプロイ、障害対応、自動ロールバックなどの一連の操作を自動的に完了できます。Chatermは技術スタックの認知障壁を解消し、すべての開発者がベテランSREの運用能力を即座に手に入れることを目指しています。

![Preview image](resources/hero.webp)

## 主な機能

- 自律エージェントエンジン: 複雑なタスクの分解と計画能力を持ち、ログ分析からサービスロールバックまでのクローズドループ自動化操作をサポートします。

- インテリジェントなコンテキスト補完: 従来の履歴記録を超え、ユーザーの習慣、現在のビジネスコンテキスト、クロスサーバー環境に基づいて、よりパーソナライズされたインテリジェントなコマンド提案を提供します。

- リアルタイム音声インタラクション: キーボードの制限を打ち破り、モバイルデバイスでの音声コマンド入力をサポートし、リモートメンテナンスと緊急対応の効率を大幅に向上させます。

- グローバルに一貫した体験: 設定ローミング：シンタックスハイライトと環境設定を一度設定すれば、どのホストからログインしても自動的に同期されます。ビジュアルVim：ターミナル内でIDEのようなモダンなファイル編集体験を提供し、多言語シンタックスハイライトをサポートします。

- エンタープライズグレードのゼロトラストセキュリティ: セッションレベルのシームレス認証システムを統合し、ゼロトラストセキュリティアーキテクチャを完全にサポートして、すべての操作がコンプライアンスに準拠し追跡可能であることを保証します。

- MCPプロトコルエコシステム: Model Context Protocol（MCP）を完全にサポートし、NotionやGitHubなどの企業知識ベースへの低コストアクセスを可能にし、AIスキルの無限の拡張を実現します。

- 統一ワークスペース: エイリアスショートカットの共有とエンタープライズレベルのSSO統一認証をサポートし、組織間のデジタル資産を効率的に管理します。

![Preview image](resources/features.webp)

## 開発ガイド

### Electronのインストール

```sh
npm i electron -D
```

### インストール

```bash
node scripts/patch-package-lock.js
npm install
```

### 開発

```bash
npm run dev
```

### ビルド

```bash
# Windows向け
npm run build:win

# macOS向け
npm run build:mac

# Linux向け
npm run build:linux
```

## コントリビューター

Chatermへの貢献ありがとうございます！
詳細については<a href="./CONTRIBUTING.md">貢献ガイド</a>をご参照ください。

<div align=center style="margin-top: 30px;">
  <a href="https://github.com/chaterm/Chaterm/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=chaterm/Chaterm" />
  </a>
</div>
