#!/usr/bin/env node

/**
 * 打包前校验脚本
 * 检查当前版本是否在 update-notes.json 中有对应的更新说明
 * 如果缺失则阻止打包流程
 */

const fs = require('fs')
const path = require('path')

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function main() {
  try {
    // 读取 package.json 获取当前版本
    const packageJsonPath = path.join(__dirname, '../package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    const currentVersion = packageJson.version

    log(`\n[Release Notes Check] 检查版本: ${currentVersion}`, 'blue')

    // 读取 update-notes.json
    const notesPath = path.join(__dirname, '../resources/update-notes.json')

    if (!fs.existsSync(notesPath)) {
      log('\n[ERROR] 未找到 resources/update-notes.json 文件', 'red')
      log('请创建该文件并添加版本更新说明', 'yellow')
      process.exit(1)
    }

    const notesContent = fs.readFileSync(notesPath, 'utf-8')
    const notes = JSON.parse(notesContent)

    // 检查是否有 versions 数组
    if (!notes.versions || !Array.isArray(notes.versions)) {
      log('\n[ERROR] update-notes.json 格式错误：缺少 versions 数组', 'red')
      process.exit(1)
    }

    // 检查当前版本是否存在
    const versionEntry = notes.versions.find((v) => v.version === currentVersion)

    if (!versionEntry) {
      log(`\n${'='.repeat(60)}`, 'red')
      log(`[ERROR] 版本更新说明缺失`, 'red')
      log(`${'='.repeat(60)}`, 'red')
      log(`\n当前版本: ${colors.bold}${currentVersion}${colors.reset}`, 'red')
      log(`\n在 resources/update-notes.json 中未找到此版本的更新说明`, 'yellow')
      log(`\n请按以下格式添加版本信息：`, 'yellow')
      log(
        `
{
  "releaseNotesUrl": "https://github.com/chaterm/Chaterm/releases/tag/v",
  "versions": [
    {
      "version": "${currentVersion}",
      "date": "${new Date().toISOString().split('T')[0]}",
      "highlights": {
        "zh-CN": [
          "更新亮点1",
          "更新亮点2",
          "更新亮点3"
        ],
        "en-US": [
          "Highlight 1",
          "Highlight 2",
          "Highlight 3"
        ]
      }
    }
  ]
}
`,
        'blue'
      )
      log(`${'='.repeat(60)}\n`, 'red')
      process.exit(1)
    }

    // 检查是否有高亮内容
    if (!versionEntry.highlights) {
      log(`\n[WARNING] 版本 ${currentVersion} 缺少 highlights 字段`, 'yellow')
      log('建议添加更新亮点以改善用户体验', 'yellow')
    } else {
      // 检查双语内容
      const hasZhCN = versionEntry.highlights['zh-CN'] && versionEntry.highlights['zh-CN'].length > 0
      const hasEnUS = versionEntry.highlights['en-US'] && versionEntry.highlights['en-US'].length > 0

      if (!hasZhCN && !hasEnUS) {
        log(`\n[WARNING] 版本 ${currentVersion} 的 highlights 内容为空`, 'yellow')
      } else if (!hasZhCN) {
        log(`\n[WARNING] 版本 ${currentVersion} 缺少中文更新说明 (zh-CN)`, 'yellow')
      } else if (!hasEnUS) {
        log(`\n[WARNING] 版本 ${currentVersion} 缺少英文更新说明 (en-US)`, 'yellow')
      }
    }

    // 检查日期格式
    if (versionEntry.date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(versionEntry.date)) {
        log(`\n[WARNING] 版本 ${currentVersion} 的日期格式不正确`, 'yellow')
        log('建议使用格式: YYYY-MM-DD', 'yellow')
      }
    } else {
      log(`\n[WARNING] 版本 ${currentVersion} 缺少发布日期`, 'yellow')
    }

    // 检查通过
    log(`\n[SUCCESS] 版本 ${currentVersion} 的更新说明已就绪`, 'green')

    // 显示摘要信息
    if (versionEntry.date) {
      log(`  发布日期: ${versionEntry.date}`, 'green')
    }
    if (versionEntry.highlights) {
      const zhCount = versionEntry.highlights['zh-CN']?.length || 0
      const enCount = versionEntry.highlights['en-US']?.length || 0
      log(`  更新亮点: 中文 ${zhCount} 条, 英文 ${enCount} 条`, 'green')
    }
    log('') // 空行

    process.exit(0)
  } catch (error) {
    log(`\n[ERROR] 校验过程出错: ${error.message}`, 'red')
    if (error.code === 'ENOENT') {
      log('请检查文件路径是否正确', 'yellow')
    } else if (error instanceof SyntaxError) {
      log('JSON 格式错误，请检查文件内容', 'yellow')
    }
    process.exit(1)
  }
}

main()
