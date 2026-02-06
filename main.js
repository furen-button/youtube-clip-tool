const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const YouTubeDownloader = require('./src/youtube-downloader');

let mainWindow;
let downloader;

/**
 * メインウィンドウを作成
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools(); // 開発時のみ

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * アプリケーション起動時の初期化
 */
app.whenReady().then(() => {
  // ダウンローダーの初期化
  downloader = new YouTubeDownloader('./downloads');
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * IPC通信ハンドラー
 */

// YouTube動画を検索
ipcMain.handle('search-videos', async (event, query, maxResults) => {
  try {
    const results = await downloader.searchVideos(query, maxResults);
    return { success: true, data: results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 動画情報を取得
ipcMain.handle('get-video-info', async (event, url) => {
  try {
    const info = await downloader.getVideoInfo(url);
    return { success: true, data: info };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 動画をダウンロード
ipcMain.handle('download-video', async (event, url, options) => {
  try {
    const result = await downloader.downloadVideo(url, {
      ...options,
      onProgress: (progress) => {
        // 進捗をレンダラープロセスに送信
        mainWindow.webContents.send('download-progress', progress);
      }
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ダウンロード済み動画一覧を取得
ipcMain.handle('list-downloaded-videos', async () => {
  try {
    const files = await downloader.listDownloadedVideos();
    return { success: true, data: files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ファイル選択ダイアログを表示
ipcMain.handle('select-video-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Videos', extensions: ['mp4', 'webm', 'mkv', 'avi', 'mov'] }
      ]
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      return { success: true, data: result.filePaths[0] };
    }
    return { success: false, error: 'キャンセルされました' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
