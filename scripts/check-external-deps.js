#!/usr/bin/env node

/**
 * Check that all external dependencies declared in electron.vite.config.ts
 * are present in package.json dependencies
 *
 * Optional dependencies (like fsevents for macOS) are allowed but will be warned
 */

const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const configPath = path.join(rootDir, 'electron.vite.config.ts')
const packageJsonPath = path.join(rootDir, 'package.json')

// Optional dependencies that are platform-specific and don't need to be in dependencies
// These are typically optional peer dependencies
const OPTIONAL_DEPS = ['fsevents'] // macOS only, optional dependency

// Read electron.vite.config.ts
const configContent = fs.readFileSync(configPath, 'utf-8')

// Extract external dependencies from rollupOptions.external
const externalMatch = configContent.match(/external:\s*\[([\s\S]*?)\]/)
if (!externalMatch) {
  console.error('❌ Could not find external dependencies in electron.vite.config.ts')
  process.exit(1)
}

// Parse external dependencies (handle both string and comment formats)
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
const devDependencies = Object.keys(packageJson.devDependencies || {})

// Check each external dependency
const missing = []
const inDevDeps = []
const optionalWarnings = []

for (const dep of externalDeps) {
  if (OPTIONAL_DEPS.includes(dep)) {
    // Optional dependencies are allowed but we warn if not present
    if (!dependencies.includes(dep) && !devDependencies.includes(dep)) {
      optionalWarnings.push(dep)
    }
    continue
  }

  if (!dependencies.includes(dep)) {
    if (devDependencies.includes(dep)) {
      inDevDeps.push(dep)
    } else {
      missing.push(dep)
    }
  }
}

// Report results
if (missing.length > 0 || inDevDeps.length > 0) {
  console.error('\n❌ External dependencies validation failed!\n')

  if (missing.length > 0) {
    console.error('Missing from dependencies (must be added):')
    missing.forEach((dep) => {
      console.error(`  - ${dep}`)
      console.error(`    Fix: Add "${dep}" to package.json dependencies`)
    })
  }

  if (inDevDeps.length > 0) {
    console.error('\nFound in devDependencies (should be in dependencies):')
    inDevDeps.forEach((dep) => {
      console.error(`  - ${dep}`)
      console.error(`    Fix: Move "${dep}" from devDependencies to dependencies`)
    })
  }

  console.error('\n')
  process.exit(1)
}

// Warn about optional dependencies
if (optionalWarnings.length > 0) {
  console.log('\n⚠️  Optional dependencies (platform-specific, not required):')
  optionalWarnings.forEach((dep) => {
    console.log(`  - ${dep} (optional, typically installed as peer dependency)`)
  })
  console.log('')
}

console.log('✅ All required external dependencies are present in package.json dependencies')
console.log(`   Checked ${externalDeps.length} external dependency/dependencies`)
