#!/usr/bin/env node

/**
 * Verify that built application can require all external dependencies
 * This script tries to load each external dependency to ensure they're available
 */

const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const configPath = path.join(rootDir, 'electron.vite.config.ts')
const packageJsonPath = path.join(rootDir, 'package.json')

// Read electron.vite.config.ts
const configContent = fs.readFileSync(configPath, 'utf-8')

// Extract external dependencies from rollupOptions.external
const externalMatch = configContent.match(/external:\s*\[([\s\S]*?)\]/)
if (!externalMatch) {
  console.error('❌ Could not find external dependencies in electron.vite.config.ts')
  process.exit(1)
}

// Parse external dependencies
const externalSection = externalMatch[1]
const externalDeps = []
const depRegex = /['"]([^'"]+)['"]/g
let match
while ((match = depRegex.exec(externalSection)) !== null) {
  externalDeps.push(match[1])
}

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
const dependencies = Object.keys(packageJson.dependencies || {})

// Check if each external dependency can be required
const missing = []
const failed = []

console.log('Verifying external dependencies can be required...\n')

for (const dep of externalDeps) {
  // Skip checking if not in dependencies (will be caught by check-external-deps.js)
  if (!dependencies.includes(dep)) {
    continue
  }

  try {
    require.resolve(dep)
    console.log(`✅ ${dep} - available`)
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      missing.push(dep)
      console.error(`❌ ${dep} - MODULE_NOT_FOUND`)
    } else {
      failed.push({ dep, error: error.message })
      console.error(`❌ ${dep} - ${error.message}`)
    }
  }
}

// Report results
if (missing.length > 0 || failed.length > 0) {
  console.error('\n❌ Some external dependencies cannot be required!\n')

  if (missing.length > 0) {
    console.error('Missing modules:')
    missing.forEach((dep) => {
      console.error(`  - ${dep}`)
      console.error(`    Fix: Run "npm install" to ensure ${dep} is installed`)
    })
  }

  if (failed.length > 0) {
    console.error('\nFailed to load:')
    failed.forEach(({ dep, error }) => {
      console.error(`  - ${dep}: ${error}`)
    })
  }

  console.error('\n')
  process.exit(1)
}

console.log(`\n✅ All external dependencies are available (verified ${externalDeps.length} dependencies)\n`)
