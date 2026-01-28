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
      const bounds = JSON.parse(fs.readFileSync(boundsPath, 'utf-8'))
      // 验证保存的位置是否有效
      if (bounds && typeof bounds === 'object') {
        return bounds
      }
    }
  } catch (e) {
    console.error('Failed to get saved bounds', e)
  }
  return { width: 1000, height: 200, x: undefined, y: undefined } // Default
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
  
  // 检查是否有有效的保存位置
  const hasValidPosition = savedBounds.x !== undefined && savedBounds.y !== undefined
  // 检查位置是否在合理范围内（考虑多显示器，y 可能很大）
  const isPositionValid = hasValidPosition && 
    savedBounds.x >= -1000 && savedBounds.y >= -100 && 
    savedBounds.x < 10000 && savedBounds.y < 10000

  lyricWin = new BrowserWindow({
    x: isPositionValid ? savedBounds.x : undefined,
    y: isPositionValid ? savedBounds.y : undefined,
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

  // 如果没有有效位置，居中显示
  if (!isPositionValid) {
    lyricWin.center()
    // 居中后立即保存位置
    setTimeout(() => {
      if (lyricWin && !lyricWin.isDestroyed()) {
        saveBounds(lyricWin.getBounds())
      }
    }, 100)
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
  let boundsUpdateTimer: NodeJS.Timeout | null = null
  const handleBoundsUpdate = () => {
    if (lyricWin && !lyricWin.isDestroyed()) {
      // 防抖：延迟保存，避免频繁写入
      if (boundsUpdateTimer) {
        clearTimeout(boundsUpdateTimer)
      }
      boundsUpdateTimer = setTimeout(() => {
        if (lyricWin && !lyricWin.isDestroyed()) {
          const bounds = lyricWin.getBounds()
          saveBounds(bounds)
          console.log('Saved lyric window bounds:', bounds)
        }
      }, 500) // 500ms 防抖
    }
  }
  
  lyricWin.on('move', handleBoundsUpdate)
  lyricWin.on('resize', handleBoundsUpdate)
  
  // 窗口关闭前保存位置
  lyricWin.on('close', () => {
    if (lyricWin && !lyricWin.isDestroyed()) {
      const bounds = lyricWin.getBounds()
      saveBounds(bounds)
      console.log('Saved lyric window bounds on close:', bounds)
    }
  })

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
  // 保存歌词窗口位置
  if (lyricWin && !lyricWin.isDestroyed()) {
    const bounds = lyricWin.getBounds()
    saveBounds(bounds)
    console.log('Saved lyric window bounds on app close:', bounds)
  }
  
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
    lyricWin = null
  }
})

// 应用退出前保存位置
app.on('before-quit', () => {
  if (lyricWin && !lyricWin.isDestroyed()) {
    const bounds = lyricWin.getBounds()
    saveBounds(bounds)
    console.log('Saved lyric window bounds before quit:', bounds)
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
  
  // Set Dock icon for macOS
  if (process.platform === 'darwin') {
    const iconPath = path.join(process.env.VITE_PUBLIC, 'icon.png')
    if (fs.existsSync(iconPath)) {
      app.dock.setIcon(iconPath)
    }
  }
})

ipcMain.handle('set-lyric-ignore-mouse-events', (_event, ignore, options) => {
  if (lyricWin && !lyricWin.isDestroyed()) {
    lyricWin.setIgnoreMouseEvents(ignore, options)
    // 通知渲染进程锁定状态
    lyricWin.webContents.send('update-lock-state', ignore)
  }
})

ipcMain.on('start-window-drag', () => {
  if (lyricWin && !lyricWin.isDestroyed()) {
    // macOS 上拖动窗口需要特殊处理
    // 通过设置 webContents 的拖拽区域来实现
    const [x, y] = lyricWin.getPosition()
    lyricWin.setPosition(x, y)
  }
})

// 解析 RSS Feed
function parseRSSFeed(xmlString: string) {
  const items: any[] = []
  
  // 提取所有 <item> 标签
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let match
  
  while ((match = itemRegex.exec(xmlString)) !== null) {
    const itemContent = match[1]
    const item: any = {}
    
    // 提取标题
    const titleMatch = itemContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (titleMatch) {
      item.title = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/gi, '$1').trim()
    }
    
    // 提取描述
    const descMatch = itemContent.match(/<description[^>]*>([\s\S]*?)<\/description>/i)
    if (descMatch) {
      item.description = descMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/gi, '$1').trim()
    }
    
    // 提取链接
    const linkMatch = itemContent.match(/<link[^>]*>([\s\S]*?)<\/link>/i)
    if (linkMatch) {
      item.link = linkMatch[1].trim()
    }
    
    // 提取发布日期
    const pubDateMatch = itemContent.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)
    if (pubDateMatch) {
      item.pubDate = pubDateMatch[1].trim()
    }
    
    // 提取音频 URL (enclosure)
    const enclosureMatch = itemContent.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i)
    if (enclosureMatch) {
      item.audioUrl = enclosureMatch[1]
    }
    
    // 如果没有 enclosure，尝试从 itunes:enclosure 获取
    if (!item.audioUrl) {
      const itunesMatch = itemContent.match(/<itunes:enclosure[^>]*url=["']([^"']+)["'][^>]*>/i)
      if (itunesMatch) {
        item.audioUrl = itunesMatch[1]
      }
    }
    
    if (item.title && item.audioUrl) {
      items.push(item)
    }
  }
  
  return items
}

// 抓取 The Daily 播客列表
ipcMain.handle('fetch-daily-podcast', async (_event) => {
  try {
    // The Daily 播客的 RSS feed URL
    const rssUrl = 'https://feeds.simplecast.com/54nAGcIl'
    
    const response = await axios.get(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 15000,
    })
    
    if (response.data) {
      const episodes = parseRSSFeed(response.data)
      return {
        success: true,
        episodes: episodes,
        count: episodes.length,
      }
    }
    
    return { success: false, message: '未获取到数据' }
  } catch (error: any) {
    console.error('Fetch daily podcast error:', error)
    return {
      success: false,
      message: error.message || '抓取失败',
    }
  }
})

// 通用 RSS 抓取
ipcMain.handle('fetch-rss-feed', async (_event, rssUrl: string) => {
  try {
    if (!rssUrl) return { success: false, message: 'URL 不能为空' }

    const response = await axios.get(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 15000,
    })
    
    if (response.data) {
      const episodes = parseRSSFeed(response.data)
      return {
        success: true,
        episodes: episodes,
        count: episodes.length,
      }
    }
    
    return { success: false, message: '未获取到数据' }
  } catch (error: any) {
    console.error('Fetch RSS error:', error)
    return {
      success: false,
      message: error.message || '抓取失败',
    }
  }
})

// 抓取 Daily List 的通用方法
ipcMain.handle('fetch-daily-list', async (_event, options: {
  url?: string
  method?: 'api' | 'scrape'
  selector?: string
  headers?: Record<string, string>
}) => {
  try {
    const { url, method = 'api', selector, headers = {} } = options

    if (!url) {
      return { success: false, message: '请提供 URL' }
    }

    if (method === 'api') {
      // 直接调用 API
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          ...headers,
        },
        timeout: 10000,
      })
      return { success: true, data: response.data }
    } else if (method === 'scrape') {
      // 网页爬取（需要 puppeteer 或 cheerio）
      // 这里提供一个基础示例，实际使用时可能需要安装 cheerio
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          ...headers,
        },
        timeout: 10000,
      })
      // 简单的 HTML 解析（如果需要更复杂的解析，建议使用 cheerio）
      return { success: true, data: response.data, html: true }
    }

    return { success: false, message: '不支持的方法' }
  } catch (error: any) {
    console.error('Fetch daily list error:', error)
    return {
      success: false,
      message: error.message || '抓取失败',
    }
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

// AI Transcription Service - Now delegated to Go backend
ipcMain.handle('transcribe-audio', async (_event, audioPath: string, guid?: string) => {
  console.log('Delegating AI Transcription to Go backend:', audioPath, 'GUID:', guid)
  
  try {
    const response = await axios.post('http://localhost:8080/api/transcribe', {
      audioPath,
      guid
    }, {
      timeout: 1000 * 60 * 30 // 30 mins
    })
    return response.data
  } catch (error: any) {
    console.error('Transcription error from backend:', error.message)
    return { 
      success: false, 
      message: `后端转录服务错误: ${error.message}` 
    }
  }
})

// Generic resize handler
ipcMain.on('set-window-size', (_event, width: number) => {
  if (win && !win.isDestroyed()) {
     const [currentW, currentH] = win.getSize()
     if (currentW !== width) {
        win.setSize(width, 820, true)
     }
  }
})
