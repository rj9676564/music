import { app, protocol, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
const boundsPath = path.join(app.getPath("userData"), "lyric-bounds.json");
function saveBounds(bounds) {
  try {
    fs.writeFileSync(boundsPath, JSON.stringify(bounds));
  } catch (e) {
    console.error("Failed to save bounds", e);
  }
}
function getSavedBounds() {
  try {
    if (fs.existsSync(boundsPath)) {
      return JSON.parse(fs.readFileSync(boundsPath, "utf-8"));
    }
  } catch (e) {
    console.error("Failed to get saved bounds", e);
  }
  return { width: 1e3, height: 200 };
}
protocol.registerSchemesAsPrivileged([
  { scheme: "local-file", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } }
]);
process.env.DIST = path.join(__dirname$1, "../dist");
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, "../public");
function registerLocalResourceProtocol() {
  protocol.registerFileProtocol("local-file", (request, callback) => {
    try {
      let url = request.url.replace(/^local-file:\/\/media/, "");
      url = url.split("?")[0];
      const decodedPath = decodeURIComponent(url);
      const finalPath = path.normalize(decodedPath);
      callback({ path: finalPath });
    } catch (error) {
      console.error("Failed to handle protocol", error);
      callback({ error: -6 });
    }
  });
}
let win;
let lyricWin;
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "vite.svg"),
    width: 530,
    height: 820,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      webSecurity: true
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.env.DIST, "index.html"));
  }
  win.on("closed", () => {
    win = null;
  });
}
function createLyricWindow() {
  const savedBounds = getSavedBounds();
  const shouldUseDefaults = !savedBounds.x || savedBounds.y > 800;
  lyricWin = new BrowserWindow({
    x: shouldUseDefaults ? void 0 : savedBounds.x,
    y: shouldUseDefaults ? void 0 : savedBounds.y,
    width: savedBounds.width || 1e3,
    height: Math.max(savedBounds.height || 200, 80),
    minHeight: 40,
    minWidth: 200,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  if (shouldUseDefaults) {
    lyricWin.center();
  }
  console.log("Lyric Window boundary:", lyricWin.getBounds());
  lyricWin.on("ready-to-show", () => {
    console.log("Lyric Window ready to show");
    lyricWin?.show();
  });
  lyricWin.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    console.error("Lyric Window failed to load:", errorCode, errorDescription);
  });
  const handleBoundsUpdate = () => {
    if (lyricWin && !lyricWin.isDestroyed()) {
      saveBounds(lyricWin.getBounds());
    }
  };
  lyricWin.on("move", handleBoundsUpdate);
  lyricWin.on("resize", handleBoundsUpdate);
  if (process.env.VITE_DEV_SERVER_URL) {
    const lyricUrl = `${process.env.VITE_DEV_SERVER_URL.replace(/\/$/, "")}/lyric.html`;
    console.log("Loading Lyric URL:", lyricUrl);
    lyricWin.loadURL(lyricUrl);
  } else {
    lyricWin.loadFile(path.join(process.env.DIST, "lyric.html"));
  }
  lyricWin.on("closed", () => {
    console.log("Lyric Window closed");
    lyricWin = null;
  });
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
    lyricWin = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    createLyricWindow();
  }
});
app.whenReady().then(() => {
  registerLocalResourceProtocol();
  createWindow();
  createLyricWindow();
});
ipcMain.handle("set-lyric-ignore-mouse-events", (_event, ignore, options) => {
  if (lyricWin && !lyricWin.isDestroyed()) {
    lyricWin.setIgnoreMouseEvents(ignore, options);
  }
});
ipcMain.on("update-lyric", (_event, text) => {
  if (lyricWin && !lyricWin.isDestroyed()) {
    lyricWin.webContents.send("update-lyric", text);
  }
});
ipcMain.on("update-settings", (_event, settings) => {
  if (lyricWin && !lyricWin.isDestroyed()) {
    lyricWin.webContents.send("update-settings", settings);
  }
});
ipcMain.handle("open-file", async (_event, filters) => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    return {
      path: filePath,
      url: `local-file://media${filePath}`
    };
  }
  return null;
});
ipcMain.handle("read-file-content", async (_event, filePath) => {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    return null;
  }
});
ipcMain.handle("find-matching-lyric", async (_event, musicPath) => {
  const ext = path.extname(musicPath);
  const basePath = musicPath.substring(0, musicPath.length - ext.length);
  const possibleExts = [".lrc", ".srt", ".LRC", ".SRT"];
  for (const lrcExt of possibleExts) {
    const lrcPath = basePath + lrcExt;
    if (fs.existsSync(lrcPath)) {
      try {
        const content = fs.readFileSync(lrcPath, "utf-8");
        return { path: lrcPath, content };
      } catch (e) {
      }
    }
  }
  return null;
});
ipcMain.handle("check-file-exists", (_event, filePath) => {
  return fs.existsSync(filePath);
});
ipcMain.on("resize-lyric-window", (_event, { width, height }) => {
  if (lyricWin && !lyricWin.isDestroyed()) {
    const bounds = lyricWin.getBounds();
    const safeHeight = Math.max(Math.ceil(height), 40);
    lyricWin.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: width || bounds.width,
      height: safeHeight
    });
    if (!lyricWin.isVisible()) lyricWin.show();
  }
});
ipcMain.handle("reset-lyric-window", () => {
  if (lyricWin && !lyricWin.isDestroyed()) {
    lyricWin.setSize(1e3, 200);
    lyricWin.center();
    lyricWin.setAlwaysOnTop(true);
    lyricWin.show();
    saveBounds(lyricWin.getBounds());
    return true;
  }
  return false;
});
ipcMain.on("toggle-lyric-window", (_event, visible) => {
  if (visible) {
    if (!lyricWin || lyricWin.isDestroyed()) {
      createLyricWindow();
    } else {
      lyricWin.show();
    }
  } else {
    if (lyricWin && !lyricWin.isDestroyed()) {
      lyricWin.hide();
    }
  }
});
