import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import axios from 'axios'
import FormData from 'form-data'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const boundsPath = path.join(app.getPath('userData'), 'lyric-bounds.json')

function saveBounds(bounds: any) {
  try {
    fs.writeFileSync(boundsPath, JSON.stringify(bounds))
  } catch (e) {
    console.error('Failed to save bounds', e)
  }
}

function getSavedBounds() {
  try {
    if (fs.existsSync(boundsPath)) {
      return JSON.parse(fs.readFileSync(boundsPath, 'utf-8'))
    }
  } catch (e) {
    console.error('Failed to get saved bounds', e)
  }
  return { width: 1000, height: 200 } // Default
}

// Must be called before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } }
])

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

// Register custom protocol for local files
function registerLocalResourceProtocol() {
  protocol.registerFileProtocol('local-file', (request, callback) => {
    // request.url will be something like 'local-file://media/Users/laibin/...'
    // We want to extract '/Users/laibin/...'
    try {
      let url = request.url.replace(/^local-file:\/\/media/, '')
      // Remove any query strings if they exist
      url = url.split('?')[0]
      const decodedPath = decodeURIComponent(url)
      
      // On macOS, the path should start with /
      const finalPath = path.normalize(decodedPath)
      callback({ path: finalPath })
    } catch (error) {
      console.error('Failed to handle protocol', error)
      callback({ error: -6 }) // net::ERR_FILE_NOT_FOUND
    }
  })
}

let win: BrowserWindow | null
let lyricWin: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    width: 530,
    height: 820,
    title: 'Molten Music',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      webSecurity: true, 
      backgroundThrottling: false,    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    // win.webContents.openDevTools() 
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }

  win.on('closed', () => {
    win = null
  })

  // Disable F12/DevTools in production
  win.webContents.on('before-input-event', (event, input) => {
    if (app.isPackaged) {
      const isDevToolsShortcut = 
        input.key === 'F12' || 
        ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i');
      if (isDevToolsShortcut) {
        event.preventDefault();
      }
    }
  });
}

function createLyricWindow() {
  const savedBounds = getSavedBounds()
  
  // Safety check: If bounds look like they are off-screen (e.g. y is very high)
  // Or if it's the first run, let's start centered
  const shouldUseDefaults = !savedBounds.x || savedBounds.y > 800

  lyricWin = new BrowserWindow({
    x: shouldUseDefaults ? undefined : savedBounds.x,
    y: shouldUseDefaults ? undefined : savedBounds.y,
    width: savedBounds.width || 1000,
    height: Math.max(savedBounds.height || 200, 80),
    minHeight: 40,
    minWidth: 200,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  if (shouldUseDefaults) {
    lyricWin.center()
  }

  console.log('Lyric Window boundary:', lyricWin.getBounds())

  lyricWin.on('ready-to-show', () => {
    console.log('Lyric Window ready to show')
    lyricWin?.show()
  })

  lyricWin.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Lyric Window failed to load:', errorCode, errorDescription)
  })

  // Save bounds when window is moved or resized
  const handleBoundsUpdate = () => {
    if (lyricWin && !lyricWin.isDestroyed()) {
      saveBounds(lyricWin.getBounds())
    }
  }
  
  lyricWin.on('move', handleBoundsUpdate)
  lyricWin.on('resize', handleBoundsUpdate)

  if (process.env.VITE_DEV_SERVER_URL) {
    const lyricUrl = `${process.env.VITE_DEV_SERVER_URL.replace(/\/$/, '')}/lyric.html`
    console.log('Loading Lyric URL:', lyricUrl)
    lyricWin.loadURL(lyricUrl)
  } else {
    lyricWin.loadFile(path.join(process.env.DIST, 'lyric.html'))
  }

  lyricWin.on('closed', () => {
    console.log('Lyric Window closed')
    lyricWin = null
  })

  // Disable F12/DevTools in production
  lyricWin.webContents.on('before-input-event', (event, input) => {
    if (app.isPackaged) {
      const isDevToolsShortcut = 
        input.key === 'F12' || 
        ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i');
      if (isDevToolsShortcut) {
        event.preventDefault();
      }
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
    lyricWin = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
    createLyricWindow()
  }
})

app.whenReady().then(() => {
  registerLocalResourceProtocol()
  createWindow()
  createLyricWindow()
})

ipcMain.handle('set-lyric-ignore-mouse-events', (_event, ignore, options) => {
  if (lyricWin && !lyricWin.isDestroyed()) {
    lyricWin.setIgnoreMouseEvents(ignore, options)
  }
})

ipcMain.on('update-lyric', (_event, text) => {
  if (lyricWin && !lyricWin.isDestroyed()) {
    lyricWin.webContents.send('update-lyric', text)
  }
})

ipcMain.on('update-settings', (_event, settings) => {
  if (lyricWin && !lyricWin.isDestroyed()) {
    lyricWin.webContents.send('update-settings', settings)
  }
})

ipcMain.handle('open-file', async (_event, filters: { name: string, extensions: string[] }[]) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0]
    // Use 'media' as a dummy host to prevent the actual path from being treated as a host
    return {
      path: filePath,
      url: `local-file://media${filePath}`
    }
  }
  return null
})

ipcMain.handle('read-file-content', async (_event, filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch (error) {
    return null
  }
})

ipcMain.handle('find-matching-lyric', async (_event, musicPath: string) => {
  const ext = path.extname(musicPath)
  const basePath = musicPath.substring(0, musicPath.length - ext.length)
  
  const possibleExts = ['.lrc', '.srt', '.LRC', '.SRT']
  for (const lrcExt of possibleExts) {
    const lrcPath = basePath + lrcExt
    if (fs.existsSync(lrcPath)) {
      try {
        const content = fs.readFileSync(lrcPath, 'utf-8')
        return { path: lrcPath, content }
      } catch (e) {
        // Continue to next extension
      }
    }
  }
  return null
})

ipcMain.handle('check-file-exists', (_event, filePath: string) => {
  return fs.existsSync(filePath)
})

ipcMain.on('resize-lyric-window', (_event, { width, height }) => {
  if (lyricWin && !lyricWin.isDestroyed()) {
    const bounds = lyricWin.getBounds()
    const safeHeight = Math.max(Math.ceil(height), 40)
    lyricWin.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: width || bounds.width,
      height: safeHeight
    })
    if (!lyricWin.isVisible()) lyricWin.show()
  }
})

ipcMain.handle('reset-lyric-window', () => {
  if (lyricWin && !lyricWin.isDestroyed()) {
    lyricWin.setSize(1000, 200)
    lyricWin.center()
    lyricWin.setAlwaysOnTop(true)
    lyricWin.show()
    saveBounds(lyricWin.getBounds())
    return true
  }
  return false
})

ipcMain.on('toggle-lyric-window', (_event, visible: boolean) => {
  if (visible) {
    if (!lyricWin || lyricWin.isDestroyed()) {
      createLyricWindow()
    } else {
      lyricWin.show()
    }
  } else {
    if (lyricWin && !lyricWin.isDestroyed()) {
      lyricWin.hide()
    }
  }
})

// AI Transcription Service (Buzz-like integration with N100 server)
const WHISPER_SERVER_URL = 'http://d.mrlb.top:9999'

ipcMain.handle('transcribe-audio', async (_event, audioPath: string) => {
  console.log('Starting AI Transcription for:', audioPath)
  
  if (!fs.existsSync(audioPath)) {
    return { success: false, message: '文件不存在' }
  }

  try {
    const formData = new FormData()
    formData.append('audio_file', fs.createReadStream(audioPath))

    // Call N100 Whisper API
    // Task: transcribe, Language: auto, Output format: srt
    const apiUrl = `${WHISPER_SERVER_URL}/asr?task=transcribe&output=srt`
    console.log('Uploading to:', apiUrl)

    const response = await axios.post(apiUrl, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      // Timeout 15 minutes for long audio
      timeout: 1000 * 60 * 15
    })

    if (response.data) {
      // Success! Path to save: same folder as audio, same name but .srt
      const ext = path.extname(audioPath)
      const srtPath = audioPath.substring(0, audioPath.length - ext.length) + '.srt'
      
      fs.writeFileSync(srtPath, response.data)
      console.log('SRT saved to:', srtPath)
      
      return { 
        success: true, 
        message: '转录成功！歌词已生成并保存到音频所在目录。',
        srtContent: response.data 
      }
    }

    return { success: false, message: '服务器未返回有效内容' }
  } catch (error: any) {
    console.error('Transcription error:', error)
    return { 
      success: false, 
      message: `转录失败: ${error.message}. 请检查 N100 上的 Docker 服务是否在运行且端口 9000 已开放。` 
    }
  }
})
