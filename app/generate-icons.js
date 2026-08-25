import { app, BrowserWindow, nativeImage } from 'electron';
import fs from 'fs';
import path from 'path';

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="brand-grad" x1="40" y1="40" x2="472" y2="472" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2898EB"/>
      <stop offset="100%" stop-color="#146CB8"/>
    </linearGradient>
  </defs>
  <!-- Rounded App Squircle -->
  <rect width="512" height="512" rx="116" fill="url(#brand-grad)"/>
  
  <!-- Speech Bubble Container -->
  <path
    d="M 164 132 H 348 C 379 132 404 157 404 188 V 276 C 404 307 379 332 348 332 H 204 L 132 390 L 140 332 H 164 C 133 332 108 307 108 276 V 188 C 108 157 133 132 164 132 Z"
    fill="rgba(255, 255, 255, 0.08)"
    stroke="#FFFFFF"
    stroke-width="28"
    stroke-linejoin="round"
    stroke-linecap="round"
  />

  <!-- 4 Voice Waveform Bars -->
  <line x1="182" y1="232" x2="182" y2="276" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round"/>
  <line x1="232" y1="184" x2="232" y2="284" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round"/>
  <line x1="282" y1="208" x2="282" y2="276" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round"/>
  <line x1="330" y1="184" x2="330" y2="284" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round"/>
</svg>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true,
    },
  });

  const html = `<!DOCTYPE html>
  <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { width: 512px; height: 512px; overflow: hidden; background: transparent; display: flex; align-items: center; justify-content: center; }
        svg { width: 512px; height: 512px; }
      </style>
    </head>
    <body>
      ${svgContent}
    </body>
  </html>`;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  
  // Wait slightly for rendering
  await new Promise((r) => setTimeout(r, 400));

  const image512 = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const png512Buf = image512.toPNG();

  const image256 = image512.resize({ width: 256, height: 256, quality: 'best' });
  const png256Buf = image256.toPNG();

  const publicDir = path.join(process.cwd(), 'public');
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent);
  fs.writeFileSync(path.join(publicDir, 'app-icon-256.png'), png256Buf);

  // Generate 32x32 tray icon
  const trayImg = image512.resize({ width: 32, height: 32, quality: 'best' });
  fs.writeFileSync(path.join(publicDir, 'tray-icon.png'), trayImg.toPNG());

  // Generate Multi-resolution Windows .ico (16, 24, 32, 48, 64, 128, 256)
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = sizes.map((s) => {
    const resized = image512.resize({ width: s, height: s, quality: 'best' });
    return resized.toPNG();
  });

  const count = sizes.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = count * dirEntrySize;
  let currentOffset = headerSize + dirSize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(count, 4); // count of images

  const dirEntries = [];
  for (let i = 0; i < count; i++) {
    const s = sizes[i];
    const buf = pngBuffers[i];
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(s === 256 ? 0 : s, 0); // width (0 = 256)
    entry.writeUInt8(s === 256 ? 0 : s, 1); // height (0 = 256)
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(buf.length, 8); // size
    entry.writeUInt32LE(currentOffset, 12); // offset
    dirEntries.push(entry);
    currentOffset += buf.length;
  }

  const icoBuf = Buffer.concat([header, ...dirEntries, ...pngBuffers]);
  fs.writeFileSync(path.join(publicDir, 'icon.ico'), icoBuf);

  // Also copy to dist if dist exists
  const distDir = path.join(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    fs.writeFileSync(path.join(distDir, 'favicon.svg'), svgContent);
    fs.writeFileSync(path.join(distDir, 'app-icon-256.png'), png256Buf);
    fs.writeFileSync(path.join(distDir, 'tray-icon.png'), trayImg.toPNG());
    fs.writeFileSync(path.join(distDir, 'icon.ico'), icoBuf);
  }

  console.log(`Successfully generated full multi-resolution public/icon.ico (${sizes.join(', ')} px), public/favicon.svg, public/app-icon-256.png, public/tray-icon.png`);
  app.quit();
});
