const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
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

// 動画ファイルを読み込んでバッファとして返す
ipcMain.handle('load-video-file', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('ファイルが見つかりません');
    }
    
    const buffer = fs.readFileSync(filePath);
    return { success: true, data: buffer };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// メタデータをJSONファイルとして保存
ipcMain.handle('save-metadata', async (event, metadata, fileName) => {
  try {
    // output/json ディレクトリを作成
    const outputDir = path.join(__dirname, 'output', 'json');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // ファイル名を生成
    const safeFileName = (fileName || 'metadata').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(outputDir, `${safeFileName}.json`);
    
    // JSONファイルを保存
    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf-8');
    
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// FFmpegで動画をトリミングして書き出し
ipcMain.handle('export-video', async (event, inputPath, outputFileName, startTime, endTime) => {
  try {
    // output/movies ディレクトリを作成
    const outputDir = path.join(__dirname, 'output', 'movies');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 出力ファイルパス
    const safeFileName = outputFileName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const outputPath = path.join(outputDir, `${safeFileName}.mp4`);
    
    // 入力ファイルの存在確認
    if (!fs.existsSync(inputPath)) {
      throw new Error('入力ファイルが見つかりません');
    }
    
    // FFmpegコマンドを実行
    // -ss: 開始時間, -to: 終了時間, -i: 入力ファイル, -c: コーデック(copy=再エンコードなし)
    const duration = endTime - startTime;
    const ffmpegArgs = [
      '-ss', startTime.toString(),
      '-t', duration.toString(),
      '-i', inputPath,
      '-c', 'copy',
      '-avoid_negative_ts', '1',
      '-y', // 上書き確認なし
      outputPath
    ];
    
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      
      let stderr = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        // 進捗情報をレンダラーに送信（オプション）
        const progressMatch = stderr.match(/time=(\d+:\d+:\d+\.\d+)/);
        if (progressMatch && mainWindow) {
          mainWindow.webContents.send('export-progress', progressMatch[1]);
        }
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, outputPath });
        } else {
          reject(new Error(`FFmpeg exited with code ${code}\n${stderr}`));
        }
      });
      
      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg error: ${error.message}`));
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});
