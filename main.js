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
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('download-progress', progress);
        }
      }
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ライブチャットデータをダウンロード
ipcMain.handle('download-live-chat', async (event, videoId) => {
  try {
    const result = await downloader.downloadLiveChat(videoId, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('live-chat-progress', progress);
      }
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ライブチャットデータを取得（パース済み）
ipcMain.handle('get-live-chat-data', async (event, videoId) => {
  try {
    const result = downloader.getLiveChatData(videoId);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// コメント密度データを取得
ipcMain.handle('get-comment-density', async (event, videoId, intervalSec) => {
  try {
    const result = downloader.getCommentDensity(videoId, intervalSec);
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

/**
 * 出力名/サブディレクトリの安全化
 * テンプレートの "/" はサブフォルダ区切りとして扱い、各セグメント内の禁止文字のみを置換する。
 * @param {string} rawName - テンプレート解決後のパス (例: "Channel/2023-01-01-Title-000010-000020")
 * @param {string} fallback - 解決後が空だったときの fallback 名
 * @returns {{ subDirs: string[], baseName: string }}
 */
function resolveOutputSubpath(rawName, fallback = 'output') {
  const cleaned = String(rawName || '')
    .split(/[\\/]+/)
    .map(seg => seg
      // OS共通で禁止される文字 + 制御文字を _ に
      .replace(/[<>:"|?*\x00-\x1f]/g, '_')
      // セグメント先頭末尾のドット・空白を除去
      .replace(/^[\s.]+|[\s.]+$/g, '')
      .trim()
    )
    .filter(seg => seg.length > 0);

  if (cleaned.length === 0) {
    return { subDirs: [], baseName: fallback };
  }

  const baseName = cleaned.pop();
  return { subDirs: cleaned, baseName };
}

// メタデータをJSONファイルとして保存
ipcMain.handle('save-metadata', async (event, metadata, fileName) => {
  try {
    const outputBaseDir = path.join(__dirname, 'output', 'json');

    // テンプレート由来の "/" を含むファイル名を、サブディレクトリ + ベース名 に分解
    const { subDirs, baseName } = resolveOutputSubpath(fileName, 'metadata');
    const outputDir = path.join(outputBaseDir, ...subDirs);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filePath = path.join(outputDir, `${baseName}.json`);

    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf-8');

    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// スクリーンショット（PNG）を保存
ipcMain.handle('save-screenshot', async (event, dataUrl, fileName) => {
  try {
    const outputBaseDir = path.join(__dirname, 'output', 'screenshots');

    const { subDirs, baseName } = resolveOutputSubpath(fileName, 'screenshot');
    const outputDir = path.join(outputBaseDir, ...subDirs);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `${baseName}.png`);

    // data URL の base64 部分を抽出して書き込む
    const matches = String(dataUrl || '').match(/^data:image\/png;base64,(.+)$/);
    if (!matches) {
      throw new Error('スクリーンショットデータが不正です');
    }
    fs.writeFileSync(outputPath, matches[1], 'base64');

    return { success: true, filePath: outputPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// FFmpegで動画をトリミングして書き出し
ipcMain.handle('export-video', async (event, inputPath, outputFileName, startTime, endTime) => {
  try {
    const outputBaseDir = path.join(__dirname, 'output', 'movies');

    // テンプレート由来の "/" を含むファイル名を、サブディレクトリ + ベース名 に分解
    const { subDirs, baseName } = resolveOutputSubpath(outputFileName, 'output');
    const outputDir = path.join(outputBaseDir, ...subDirs);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `${baseName}.mp4`);
    
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
        if (progressMatch && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
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

// 波形データ（Peaks）を事前生成（長時間動画のOOMクラッシュ対策）
ipcMain.handle('generate-waveform-peaks', async (event, videoPath, pixelsPerSecond = 20) => {
  try {
    // キャッシュファイルの確認
    const peaksCachePath = videoPath.replace(/\.[^.]+$/, '.peaks.json');
    if (fs.existsSync(peaksCachePath)) {
      const cached = JSON.parse(fs.readFileSync(peaksCachePath, 'utf-8'));
      return { success: true, ...cached };
    }

    // ffprobeで動画の長さを取得
    const duration = await new Promise((resolve, reject) => {
      const probe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        videoPath
      ]);
      let out = '';
      probe.stdout.on('data', (d) => { out += d.toString(); });
      probe.stderr.on('data', () => {});
      probe.on('close', (code) => {
        if (code !== 0) { reject(new Error('ffprobe失敗')); return; }
        try {
          const data = JSON.parse(out);
          const stream = data.streams.find(s => s.codec_type === 'audio') || data.streams[0];
          const dur = parseFloat(stream.duration);
          if (!isNaN(dur) && dur > 0) { resolve(dur); } else { reject(new Error('動画時間を取得できません')); }
        } catch (e) { reject(e); }
      });
      probe.on('error', reject);
    });

    // ffmpegでモノラル低サンプルレートのRaw PCMを取得し、ストリーミングでピークを計算
    const sampleRate = 8000;
    const totalPeaks = Math.ceil(duration * pixelsPerSecond);
    const samplesPerPeak = Math.max(1, Math.floor((duration * sampleRate) / totalPeaks));

    const peaks = await new Promise((resolve, reject) => {
      const maxPeaks = new Array(totalPeaks).fill(0);
      let sampleIndex = 0;
      let remainder = Buffer.alloc(0);

      const ffmpeg = spawn('ffmpeg', [
        '-i', videoPath,
        '-vn',              // 映像ストリームを除外
        '-ac', '1',         // モノラル変換
        '-ar', String(sampleRate),
        '-f', 'f32le',      // 32bit浮動小数点リトルエンディアン
        'pipe:1'
      ]);

      ffmpeg.stdout.on('data', (chunk) => {
        const data = remainder.length > 0 ? Buffer.concat([remainder, chunk]) : chunk;
        const floatCount = Math.floor(data.length / 4);

        for (let i = 0; i < floatCount; i++) {
          const peakIdx = Math.min(Math.floor(sampleIndex / samplesPerPeak), totalPeaks - 1);
          const absVal = Math.abs(data.readFloatLE(i * 4));
          if (absVal > maxPeaks[peakIdx]) maxPeaks[peakIdx] = absVal;
          sampleIndex++;
        }

        remainder = (floatCount * 4 < data.length)
          ? data.slice(floatCount * 4)
          : Buffer.alloc(0);
      });

      ffmpeg.stderr.on('data', () => {});

      ffmpeg.on('close', (code) => {
        if (code !== 0) { reject(new Error(`ffmpegがcode ${code}で終了しました`)); return; }
        resolve(maxPeaks);
      });

      ffmpeg.on('error', (e) => reject(e));
    });

    const result = { peaks, duration };

    // キャッシュに保存（失敗は無視）
    try {
      fs.writeFileSync(peaksCachePath, JSON.stringify(result), 'utf-8');
    } catch (_) {}

    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
