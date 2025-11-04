#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packageName = '@rollup/rollup-android-arm-eabi';
const packageVersion = '4.52.5';
const packagePath = path.join(__dirname, '..', 'node_modules', '@rollup', 'rollup-android-arm-eabi');

// Check if the package is already installed
if (fs.existsSync(packagePath)) {
  console.log(`✓ ${packageName} is already installed`);
  process.exit(0);
}

console.log(`Installing ${packageName}@${packageVersion} for Homey...`);

try {
  // Download the package to /tmp
  execSync(`npm pack ${packageName}@${packageVersion}`, {
    cwd: '/tmp',
    stdio: 'inherit'
  });

  const tarballName = `rollup-rollup-android-arm-eabi-${packageVersion}.tgz`;
  const tarballPath = path.join('/tmp', tarballName);

  // Create the target directory
  const targetDir = path.join(__dirname, '..', 'node_modules', '@rollup', 'rollup-android-arm-eabi');
  fs.mkdirSync(targetDir, { recursive: true });

  // Extract the tarball
  execSync(`tar -xzf ${tarballPath} -C ${targetDir} --strip-components=1`, {
    stdio: 'inherit'
  });

  // Clean up
  fs.unlinkSync(tarballPath);

  console.log(`✓ Successfully installed ${packageName}@${packageVersion}`);
} catch (error) {
  console.error(`Failed to install ${packageName}:`, error.message);
  process.exit(1);
}
