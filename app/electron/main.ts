import { app, BrowserWindow, ipcMain, Notification, dialog, shell, Tray, Menu, nativeImage, desktopCapturer, session } from 'electron'
import { join } from 'path'
import fs, { promises as fsPromises } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import keytar from 'keytar'
import * as db from './db'

const execAsync = promisify(exec)
const isDev = process.env.NODE_ENV === 'development'

/** Keychain service name — consistent across all platforms */
const KEYTAR_SERVICE = 'mirai-granola'

/** Reference to the main window, used to focus/restore it when a native notification is clicked. */
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function getAppIcon(sizePx = 64): Electron.NativeImage | undefined {
  try {
    // In dev, the icon lives under the project's public/ folder. In a
    // packaged build it's bundled via electron-builder's "extraResources"
    // (see package.json) directly under process.resourcesPath — public/
    // itself isn't included in the packaged app.asar since Vite doesn't
    // copy it verbatim into dist/.
    const pngPath = isDev
      ? join(process.cwd(), 'public/tray-icon.png')
      : join(process.resourcesPath, 'tray-icon.png')
    if (fs.existsSync(pngPath)) {
      const img = nativeImage.createFromPath(pngPath)
      if (!img.isEmpty()) {
        return sizePx ? img.resize({ width: sizePx, height: sizePx }) : img
      }
    }
  } catch (err) {
    console.warn('[main] Failed to load icon:', err)
  }
  return undefined
}

async function createTray() {
  if (tray) return
  try {
    let icon = getAppIcon(32)
    if (!icon || icon.isEmpty()) {
      icon = nativeImage.createFromBuffer(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA0SURBVDhPY/wPBAwUACYoTVsDRo1Hw0A0Y2A0DUw0GkZ4gNE0MOGgAYqR/wcYGp+h8RoYAAAkoxn3/nfl4AAAAABJRU5ErkJggg==',
          'base64'
        )
      )
    }
    tray = new Tray(icon)
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Mirai Granola',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ])
    tray.setToolTip('Mirai Granola — Meeting Assistant')
    tray.setContextMenu(contextMenu)
    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
      }
    })
  } catch (err) {
    console.warn('[main] Failed to create system tray icon:', err)
  }
}

function createWindow() {
  const appIcon = getAppIcon(64)
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Mirai Granola',
    icon: appIcon,
    webPreferences: {
      preload: join(import.meta.dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Meeting detection (MeetingDetectionService) polls every 5s via a
      // renderer-side setInterval, and recording/transcription timers also
      // live in the renderer. Electron throttles/suspends renderer timers by
      // default once the window is hidden (close-to-tray keeps it hidden but
      // alive) — without this flag, background detection and notifications
      // silently stop firing as soon as the window is closed to tray.
      backgroundThrottling: false,
    }
  })
  mainWindow = win

  if (appIcon && !appIcon.isEmpty()) {
    win.setIcon(appIcon)
  }

  // Close to tray behavior: keep background meeting detection running
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
      return false
    }
  })

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(import.meta.dirname, '../dist/index.html'))
  }
}

/**
 * Returns a list of window title strings for all visible processes on the OS.
 * Windows: uses PowerShell Get-Process with MainWindowTitle.
 * macOS/Linux: uses AppleScript / wmctrl respectively (graceful fallback).
 */
async function getActiveWindowTitles(): Promise<string[]> {
  try {
    if (process.platform === 'win32') {
      const ps = "$ProgressPreference = 'SilentlyContinue'; Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -ExpandProperty MainWindowTitle"
      const encoded = Buffer.from(ps, 'utf16le').toString('base64')
      const { stdout } = await execAsync(
        `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
        // 8s was too tight — PowerShell's own interpreter cold-start plus
        // Get-Process enumeration can exceed that under normal system load
        // (e.g. while actively recording/transcribing), causing this poll
        // (which runs every 5s) to hit the timeout and log a warning on
        // nearly every cycle even though the fallback (return []) is
        // harmless. 15s gives real headroom without meaningfully delaying
        // meeting-detection responsiveness, since a timeout here just skips
        // that one poll cycle rather than blocking anything else.
        { timeout: 15000, windowsHide: true }
      )
      return stdout
        .split(/\r?\n/)
        .map((t) => t.trim())
        .filter(Boolean)
    }

    if (process.platform === 'darwin') {
      // AppleScript: list all window names
      const script = `tell application "System Events" to get name of every window of every process`
      const { stdout } = await execAsync(`osascript -e '${script}'`, { timeout: 4000 })
      return stdout
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean)
    }

    // Linux: wmctrl -l lists all X window titles
    const { stdout } = await execAsync('wmctrl -l 2>/dev/null || true', { timeout: 4000 })
    return stdout
      .split('\n')
      .map((line) => {
        // wmctrl format: "0x... <desktop> <host> <title>"
        const parts = line.split(/\s+/)
        return parts.slice(3).join(' ').trim()
      })
      .filter(Boolean)
  } catch (err) {
    // Concise, single-line warning — the full error object (with stack
    // trace, cmd, stdout/stderr) is verbose and this is a routine,
    // already-handled fallback (every caller treats an empty array as
    // "no titles available right now"), not something that needs
    // investigating on every occurrence.
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[main] getActiveWindowTitles failed (will retry next poll):', message)
    return []
  }
}

app.whenReady().then(() => {
  // Registers the modern, officially-documented display-media request
  // handler for system audio loopback capture (see Electron's
  // desktopCapturer docs). The renderer calls
  // navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
  // instead of the older chromeMediaSource:'desktop' mandatory-constraints
  // getUserMedia() call — that older API path is what was hitting the WGC
  // "GetFrame failed" screen-capture-session timeout. This handler routes
  // getDisplayMedia through the same desktopCapturer source list but lets
  // Chromium negotiate the actual capture internally via its
  // better-maintained getDisplayMedia code path, and explicitly requests
  // audio: 'loopback' so Chromium knows this call only needs system audio.
  // Must be registered before any getDisplayMedia() call from the
  // renderer, so it's set up here at startup rather than per-recording.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (sources.length === 0) {
        callback({})
        return
      }
      callback({ video: sources[0], audio: 'loopback' })
    }).catch((err) => {
      console.error('[main] setDisplayMediaRequestHandler getSources failed:', err)
      callback({})
    })
  })

  // Initialize Drizzle ORM over Better SQLite3 and run pending migrations.
  //
  // IMPORTANT: app.getAppPath() (used for isDev===false previously) points
  // at the packaged app's installation directory — e.g.
  // "C:\Program Files\Mirai Granola\resources\app.asar" — which is
  // READ-ONLY once installed. Writing the SQLite database, recordings, and
  // app-config.json there would fail (or silently no-op) in a real
  // installed build. All WRITABLE user data must live under
  // app.getPath('userData') instead (the OS-appropriate per-user app data
  // directory, e.g. %APPDATA%\Mirai Granola on Windows) — this is the
  // standard, documented Electron pattern. Bundled READ-ONLY assets
  // (migrations) are read from process.resourcesPath instead, matching the
  // "extraResources" entry in package.json's electron-builder config.
  const appPath = isDev ? process.cwd() : app.getAppPath()
  const userDataPath = isDev ? process.cwd() : app.getPath('userData')
  const dbDir = join(userDataPath, 'database')
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  const migrationsFolder = isDev
    ? join(appPath, 'database', 'migrations')
    : join(process.resourcesPath, 'database', 'migrations')
  try {
    db.initDatabase(dbDir, migrationsFolder)
  } catch (err) {
    console.error('[db] Failed to initialize database:', err)
  }

  // ── App config (persists settings that must be known before/independent
  // of the SQLite DB — e.g. the recordings folder location) ──────────────────
  const configPath = join(userDataPath, 'app-config.json')

  function readAppConfig(): { recordingsDir?: string } {
    try {
      if (!fs.existsSync(configPath)) return {}
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch {
      return {}
    }
  }

  function writeAppConfig(config: { recordingsDir?: string }) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  const appConfig = readAppConfig()
  let recordingsDir = appConfig.recordingsDir || join(userDataPath, 'recordings')

  // ── Audio save IPC ──────────────────────────────────────────────────────────
  ipcMain.handle('save-audio', async (_event, { fileName, buffer }) => {
    try {
      if (!fs.existsSync(recordingsDir)) {
        fs.mkdirSync(recordingsDir, { recursive: true })
      }
      const filePath = join(recordingsDir, fileName)
      const nodeBuffer = Buffer.from(buffer)
      await fsPromises.writeFile(filePath, nodeBuffer)
      return filePath
    } catch (err) {
      console.error('Failed to save audio file:', err)
      throw err
    }
  })

  // ── Audio retention IPC ─────────────────────────────────────────────────────

  /** Returns { fileCount, totalBytes } for everything currently in recordings/. */
  ipcMain.handle('get-audio-storage-info', async () => {
    try {
      if (!fs.existsSync(recordingsDir)) return { ok: true, fileCount: 0, totalBytes: 0 }
      const files = await fsPromises.readdir(recordingsDir)
      let totalBytes = 0
      let fileCount = 0
      for (const file of files) {
        const stat = await fsPromises.stat(join(recordingsDir, file)).catch(() => null)
        if (stat?.isFile()) {
          totalBytes += stat.size
          fileCount++
        }
      }
      return { ok: true, fileCount, totalBytes }
    } catch (err) {
      console.error('[main] get-audio-storage-info failed:', err)
      return { ok: false, fileCount: 0, totalBytes: 0, error: String(err) }
    }
  })

  /** Deletes every file in recordings/. Does not touch the SQLite meeting/transcript data. */
  ipcMain.handle('clear-all-audio', async () => {
    try {
      if (!fs.existsSync(recordingsDir)) return { ok: true, deletedCount: 0 }
      const files = await fsPromises.readdir(recordingsDir)
      let deletedCount = 0
      for (const file of files) {
        try {
          await fsPromises.unlink(join(recordingsDir, file))
          deletedCount++
        } catch (err) {
          console.warn(`[main] Failed to delete audio file ${file}:`, err)
        }
      }
      return { ok: true, deletedCount }
    } catch (err) {
      console.error('[main] clear-all-audio failed:', err)
      return { ok: false, deletedCount: 0, error: String(err) }
    }
  })

  /**
   * Deletes audio files older than `retentionDays`. Called once at startup
   * with the user's saved retention preference. retentionDays <= 0 means
   * "keep forever" — no cleanup runs.
   */
  ipcMain.handle('apply-audio-retention', async (_event, retentionDays: number) => {
    try {
      if (!retentionDays || retentionDays <= 0) return { ok: true, deletedCount: 0 }
      if (!fs.existsSync(recordingsDir)) return { ok: true, deletedCount: 0 }

      const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000
      const files = await fsPromises.readdir(recordingsDir)
      let deletedCount = 0
      for (const file of files) {
        const filePath = join(recordingsDir, file)
        const stat = await fsPromises.stat(filePath).catch(() => null)
        if (stat?.isFile() && stat.mtimeMs < cutoffMs) {
          try {
            await fsPromises.unlink(filePath)
            deletedCount++
          } catch (err) {
            console.warn(`[main] Failed to delete expired audio file ${file}:`, err)
          }
        }
      }
      return { ok: true, deletedCount }
    } catch (err) {
      console.error('[main] apply-audio-retention failed:', err)
      return { ok: false, deletedCount: 0, error: String(err) }
    }
  })

  // ── Storage paths IPC ────────────────────────────────────────────────────────
  // Real paths, not mocked strings — the database file location is
  // reported but not changeable at runtime (see rename below for why);
  // the recordings folder location is fully real: native picker, actual
  // file move, and persisted across restarts via app-config.json.

  ipcMain.handle('get-storage-paths', async () => {
    return {
      ok: true,
      databasePath: join(dbDir, 'granola.db'),
      recordingsPath: recordingsDir,
    }
  })

  /** Opens the recordings folder in the OS file explorer (Explorer/Finder/etc). */
  ipcMain.handle('open-recordings-folder', async () => {
    try {
      if (!fs.existsSync(recordingsDir)) {
        fs.mkdirSync(recordingsDir, { recursive: true })
      }
      const err = await shell.openPath(recordingsDir)
      if (err) return { ok: false, error: err }
      return { ok: true }
    } catch (err) {
      console.error('[main] open-recordings-folder failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  /**
   * Opens a native folder picker, then actually moves every existing file
   * from the current recordings folder into the newly chosen one, and
   * persists the new location to app-config.json so it survives restarts.
   * Returns the new path on success, or ok:false if cancelled/failed.
   */
  ipcMain.handle('change-recordings-folder', async () => {
    if (!mainWindow) return { ok: false, error: 'No window available for dialog.' }
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Choose a folder for audio recordings',
        defaultPath: recordingsDir,
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, canceled: true }
      }

      const newDir = result.filePaths[0]
      if (newDir === recordingsDir) {
        return { ok: true, path: recordingsDir }
      }

      // Move existing recordings into the new location rather than leaving
      // them behind — a "change location" that silently orphans existing
      // files would be its own kind of broken/mocked behavior.
      if (fs.existsSync(recordingsDir)) {
        if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true })
        const files = await fsPromises.readdir(recordingsDir)
        for (const file of files) {
          const src = join(recordingsDir, file)
          const dest = join(newDir, file)
          const stat = await fsPromises.stat(src).catch(() => null)
          if (stat?.isFile()) {
            await fsPromises.rename(src, dest).catch(async (err) => {
              // Cross-device rename can fail — fall back to copy+delete
              console.warn(`[main] rename failed for ${file}, falling back to copy:`, err)
              await fsPromises.copyFile(src, dest)
              await fsPromises.unlink(src)
            })
          }
        }
      }

      recordingsDir = newDir
      writeAppConfig({ ...readAppConfig(), recordingsDir: newDir })

      return { ok: true, path: newDir }
    } catch (err) {
      console.error('[main] change-recordings-folder failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  // ── Meeting detection IPC ───────────────────────────────────────────────────
  // Returns string[] of all visible window titles on the host OS.
  // The renderer-side detectors match against these titles.
  ipcMain.handle('get-active-window-titles', async () => {
    return await getActiveWindowTitles()
  })

  // ── Desktop audio sources (system/loopback capture) ─────────────────────────
  // Used by AudioCapture.ts to capture the meeting app's output (e.g. Teams)
  // via chromeMediaSource: 'desktop', in addition to the mic. Without this
  // handler the renderer silently falls back to mic-only, which is why remote
  // participants' audio was missing from the transcript when using headphones.
  //
  // IMPORTANT: only 'screen' sources are requested, never 'window'. Chromium's
  // desktop-capture audio loopback on Windows only reliably produces real
  // system audio when capturing a screen source — requesting audio from a
  // window source silently returns a track with no usable audio instead of
  // erroring. AudioCapture.ts previously picked sources[0] from a combined
  // window+screen list, which was often a window (arbitrary enumeration
  // order), so the "system"/"Speaker" track carried no real audio — every
  // utterance from both the user and the other participant then only ever
  // arrived via the mic track and got tagged "You", which is exactly the
  // "headphones make it think everyone is me" symptom this fixes.
  ipcMain.handle('get-desktop-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] })
      return sources.map((s) => ({ id: s.id, name: s.name }))
    } catch (err) {
      console.error('[main] get-desktop-sources failed:', err)
      return []
    }
  })

  // ── Native OS notification ──────────────────────────────────────────────────
  // Shows a real Windows/macOS/Linux system notification (Action Center /
  // Notification Center), independent of whether the app window is focused
  // or even visible. Clicking it brings the app to the foreground.
  // This is separate from the in-app banner (MeetingNotification.tsx) — the
  // renderer fires both so the user sees it whether or not Mirai Granola has
  // focus at the moment a meeting is detected.
  ipcMain.handle('show-native-notification', async (_event, options: { title: string; body: string }) => {
    if (!Notification.isSupported()) {
      return { ok: false, error: 'Notifications are not supported on this system.' }
    }
    try {
      const notification = new Notification({
        title: options.title,
        body: options.body,
        silent: false,
      })
      notification.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          mainWindow.focus()
        }
      })
      notification.show()
      return { ok: true }
    } catch (err) {
      console.error('[main] show-native-notification failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  // ── Credential store IPC (keytar → OS Credential Manager) ──────────────────
  // All three handlers use the same KEYTAR_SERVICE; the `account` argument is
  // the provider name (e.g. "OpenAI", "Anthropic"). Keys are NEVER returned to
  // the renderer — the renderer only learns whether a key exists.

  /** Save (or overwrite) a credential for `account` in the OS keychain. */
  ipcMain.handle('credential-save', async (_event, account: string, secret: string) => {
    try {
      await keytar.setPassword(KEYTAR_SERVICE, account, secret)
      return { ok: true }
    } catch (err) {
      console.error('[keytar] credential-save failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  /** Returns true if a credential for `account` exists in the OS keychain. */
  ipcMain.handle('credential-exists', async (_event, account: string) => {
    try {
      const value = await keytar.getPassword(KEYTAR_SERVICE, account)
      return { ok: true, exists: value !== null }
    } catch (err) {
      console.error('[keytar] credential-exists failed:', err)
      return { ok: false, exists: false }
    }
  })

  /**
   * Loads the stored credential for `account` and returns it once to the main
   * process so it can be forwarded to the AI provider without ever exposing it
   * in the renderer's memory. Returns null if not found.
   *
   * NOTE: This is used exclusively at startup to initialise the provider config.
   * The renderer never calls this for display purposes.
   */
  ipcMain.handle('credential-load', async (_event, account: string) => {
    try {
      const value = await keytar.getPassword(KEYTAR_SERVICE, account)
      return { ok: true, secret: value }
    } catch (err) {
      console.error('[keytar] credential-load failed:', err)
      return { ok: false, secret: null }
    }
  })

  /** Delete the credential for `account` from the OS keychain. */
  ipcMain.handle('credential-delete', async (_event, account: string) => {
    try {
      const deleted = await keytar.deletePassword(KEYTAR_SERVICE, account)
      return { ok: true, deleted }
    } catch (err) {
      console.error('[keytar] credential-delete failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  // ── Database IPC: Meetings ──────────────────────────────────────────────────
  ipcMain.handle('db-list-meetings', async () => {
    try {
      return { ok: true, meetings: db.listMeetings() }
    } catch (err) {
      console.error('[db] list-meetings failed:', err)
      return { ok: false, meetings: [], error: String(err) }
    }
  })

  ipcMain.handle('db-upsert-meeting', async (_event, meeting) => {
    try {
      db.upsertMeeting(meeting)
      return { ok: true }
    } catch (err) {
      console.error('[db] upsert-meeting failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('db-delete-meeting', async (_event, meetingId: string) => {
    try {
      // "Delete" moves the meeting to the Bin (soft delete) rather than
      // erasing it — see db-permanently-delete-meeting for the real erase.
      db.softDeleteMeeting(meetingId)
      return { ok: true }
    } catch (err) {
      console.error('[db] delete-meeting failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('db-list-deleted-meetings', async () => {
    try {
      return { ok: true, meetings: db.listDeletedMeetings() }
    } catch (err) {
      console.error('[db] list-deleted-meetings failed:', err)
      return { ok: false, meetings: [], error: String(err) }
    }
  })

  ipcMain.handle('db-restore-meeting', async (_event, meetingId: string) => {
    try {
      db.restoreMeeting(meetingId)
      return { ok: true }
    } catch (err) {
      console.error('[db] restore-meeting failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('db-permanently-delete-meeting', async (_event, meetingId: string) => {
    try {
      db.permanentlyDeleteMeeting(meetingId)
      return { ok: true }
    } catch (err) {
      console.error('[db] permanently-delete-meeting failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('db-append-transcript-line', async (_event, meetingId: string, line) => {
    try {
      db.appendTranscriptLine(meetingId, line)
      return { ok: true }
    } catch (err) {
      console.error('[db] append-transcript-line failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('db-replace-action-items', async (_event, meetingId: string, items) => {
    try {
      db.replaceActionItems(meetingId, items)
      return { ok: true }
    } catch (err) {
      console.error('[db] replace-action-items failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  // ── Database IPC: Chat ──────────────────────────────────────────────────────
  ipcMain.handle('db-list-chat-threads', async () => {
    try {
      return { ok: true, threads: db.listChatThreads() }
    } catch (err) {
      console.error('[db] list-chat-threads failed:', err)
      return { ok: false, threads: [], error: String(err) }
    }
  })

  ipcMain.handle('db-create-chat-thread', async (_event, id: string, title: string, meetingId?: string | null) => {
    try {
      db.createChatThread(id, title, meetingId)
      return { ok: true }
    } catch (err) {
      console.error('[db] create-chat-thread failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('db-rename-chat-thread', async (_event, threadId: string, title: string) => {
    try {
      db.renameChatThread(threadId, title)
      return { ok: true }
    } catch (err) {
      console.error('[db] rename-chat-thread failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('db-delete-chat-thread', async (_event, threadId: string) => {
    try {
      db.deleteChatThread(threadId)
      return { ok: true }
    } catch (err) {
      console.error('[db] delete-chat-thread failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('db-append-chat-message', async (_event, threadId: string, message) => {
    try {
      db.appendChatMessage(threadId, message)
      return { ok: true }
    } catch (err) {
      console.error('[db] append-chat-message failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  createWindow()
  void createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit()
  }
  db.closeDatabase()
})
