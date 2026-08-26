import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

function findFiles(dir, filter) {
  let results = [];
  try {
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of list) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        results = results.concat(findFiles(fullPath, filter));
      } else if (item.name.toLowerCase() === filter.toLowerCase()) {
        results.push(fullPath);
      }
    }
  } catch {}
  return results;
}

function findRcedit() {
  const localAppData = process.env.LOCALAPPDATA || '';
  const searchDirs = [
    path.join(localAppData, 'electron-builder', 'Cache', 'winCodeSign'),
    path.join(localAppData, 'electron-builder', 'cache', 'winCodeSign'),
  ];
  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      const results = findFiles(dir, 'rcedit-x64.exe');
      if (results.length > 0) return results[0];
      const results32 = findFiles(dir, 'rcedit-ia32.exe');
      if (results32.length > 0) return results32[0];
    }
  }
  return null;
}

// Stop any running electron processes so file is not locked
try {
  execSync('powershell -Command "Stop-Process -Name electron -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
} catch {}

const icoPath = path.resolve('public', 'icon.ico');
const rcedit = findRcedit();
const electronExes = findFiles(path.resolve('node_modules'), 'electron.exe');
console.log('Found electron.exe files:', electronExes);

for (const exe of electronExes) {
  if (rcedit && fs.existsSync(icoPath)) {
    try {
      execSync(
        `"${rcedit}" "${exe}" --set-icon "${icoPath}" --set-version-string "ProductName" "Mirai Granola" --set-version-string "FileDescription" "Mirai Granola" --set-version-string "CompanyName" "Mirai Granola" --set-version-string "InternalName" "Mirai Granola" --set-version-string "OriginalFilename" "Mirai Granola.exe"`,
        { stdio: 'inherit' }
      );
      console.log('Successfully injected official icon and product metadata into:', exe);
    } catch (err) {
      console.error('Failed to patch:', exe, err.message);
    }
  }

  // Ensure electron.exe launched without arguments (e.g. from Windows Toast clicks)
  // routes to Mirai Granola's main.js instead of opening the default Electron screen
  try {
    const resourcesDir = path.join(path.dirname(exe), 'resources', 'app');
    fs.mkdirSync(resourcesDir, { recursive: true });
    fs.writeFileSync(
      path.join(resourcesDir, 'package.json'),
      JSON.stringify(
        {
          name: 'mirai-granola',
          productName: 'Mirai Granola',
          main: 'index.js',
        },
        null,
        2
      )
    );
    const targetMain = path.resolve('dist-electron/main.js').replace(/\\/g, '/');
    fs.writeFileSync(
      path.join(resourcesDir, 'index.js'),
      `const fs = require('fs');\nconst target = ${JSON.stringify(targetMain)};\nif (fs.existsSync(target)) {\n  require(target);\n}\n`
    );
  } catch {}
}
