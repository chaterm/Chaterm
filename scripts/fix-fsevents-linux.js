#!/usr/bin/env node

/**
 * Fix fsevents directory issue for Linux builds
 * fsevents is a macOS-only optional dependency, but electron-builder
 * may try to scan it during Linux builds, causing ENOENT errors.
 * This script ensures the directory exists (even if empty) to prevent scan errors.
 */

const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const fseventsDir = path.join(rootDir, 'node_modules', 'fsevents')

// Only run on Linux or when building for Linux
const isLinux = process.platform === 'linux' || process.argv.includes('--linux')

if (!isLinux) {
  console.log('⏭️  Skipping fsevents fix (not Linux build)')
  process.exit(0)
}

/**
 * Create a minimal fsevents directory structure
 * This prevents electron-builder from failing when trying to scandir a non-existent directory
 */
function createMinimalFseventsDir() {
  // Remove existing directory if it exists and is invalid
  if (fs.existsSync(fseventsDir)) {
    try {
      fs.rmSync(fseventsDir, { recursive: true, force: true })
    } catch (err) {
      // Ignore errors when removing
    }
  }

  // Create directory
  fs.mkdirSync(fseventsDir, { recursive: true })

  // Create a minimal package.json to make it look like a valid npm package
  // This prevents electron-builder from trying to scan a non-existent directory
  const minimalPackageJson = {
    name: 'fsevents',
    version: '2.3.3',
    description: 'macOS-only optional dependency',
    optional: true
  }
  fs.writeFileSync(path.join(fseventsDir, 'package.json'), JSON.stringify(minimalPackageJson, null, 2))
}

try {
  // Check if fsevents directory exists
  if (!fs.existsSync(fseventsDir)) {
    createMinimalFseventsDir()
    console.log('✅ Created minimal fsevents directory for Linux build')
  } else {
    // Directory exists, check if it's valid and accessible
    try {
      const stats = fs.statSync(fseventsDir)
      if (!stats.isDirectory()) {
        // Invalid: it's a file, not a directory
        createMinimalFseventsDir()
        console.log('✅ Fixed invalid fsevents entry (was a file, now a directory)')
      } else {
        // Check if directory is accessible
        try {
          fs.readdirSync(fseventsDir)
          console.log('✅ fsevents directory exists and is accessible')
        } catch (readErr) {
          // Directory exists but can't be read, recreate it
          createMinimalFseventsDir()
          console.log('✅ Fixed corrupted fsevents directory')
        }
      }
    } catch (err) {
      // Directory exists but can't be accessed, try to fix it
      try {
        createMinimalFseventsDir()
        console.log('✅ Fixed inaccessible fsevents directory')
      } catch (fixErr) {
        console.warn('⚠️  Warning: Could not fix fsevents directory:', fixErr.message)
      }
    }
  }
} catch (err) {
  console.error('❌ Error fixing fsevents directory:', err.message)
  // Don't fail the build, just warn
  console.warn('⚠️  Continuing build anyway...')
  process.exit(0)
}
