import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const rcedit = 'C:\\Users\\Nisha Shetty\\AppData\\Local\\electron-builder\\cache\\winCodeSign\\winCodeSign-2.6.0\\rcedit-x64.exe';
const icoPath = path.resolve('public', 'icon.ico');

// Stop any running electron processes so file is not locked
try {
  execSync('powershell -Command "Stop-Process -Name electron -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
} catch {}

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

const electronExes = findFiles(path.resolve('node_modules'), 'electron.exe');
console.log('Found electron.exe files:', electronExes);

for (const exe of electronExes) {
  try {
    execSync(`"${rcedit}" "${exe}" --set-icon "${icoPath}"`, { stdio: 'inherit' });
    console.log('Successfully injected official icon into:', exe);
  } catch (err) {
    console.error('Failed to patch:', exe, err.message);
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
