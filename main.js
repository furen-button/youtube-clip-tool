const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const YouTubeDownloader = require('./src/youtube-downloader');
const { isAllowedYouTubeUrl, VIDEO_ID_RE } = require('./src/youtube-downloader');

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

// YouTubeから指定区間のみダウンロードしてmp4で書き出し（再エンコード）
// yt-dlp の --download-sections で必要な区間のみ取得し、--force-keyframes-at-cuts で
// 区間端を正確にカットしたうえで --recode-video mp4 で mp4 へ再エンコードする。
ipcMain.handle('export-video', async (event, url, outputFileName, startTime, endTime) => {
  try {
    // URL バリデーション（コマンドインジェクション対策・想定外URLの拒否）
    if (!isAllowedYouTubeUrl(url)) {
      throw new Error('不正なYouTube URLです');
    }

    // 時間バリデーション
    const start = Number(startTime);
    const end = Number(endTime);
    if (!isFinite(start) || !isFinite(end) || start < 0 || end <= start) {
      throw new Error('開始/終了時間が不正です');
    }

    const outputBaseDir = path.join(__dirname, 'output', 'movies');

    // テンプレート由来の "/" を含むファイル名を、サブディレクトリ + ベース名 に分解
    const { subDirs, baseName } = resolveOutputSubpath(outputFileName, 'output');
    const outputDir = path.join(outputBaseDir, ...subDirs);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `${baseName}.mp4`);

    // 既存ファイルがあれば事前に削除（yt-dlp の上書き警告を避ける）
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch (_) {}
    }

    // yt-dlp 引数（spawn + 配列でシェル経由なし）
    const args = [
      '-f', 'bv*+ba/b',
      '--download-sections', `*${start.toFixed(3)}-${end.toFixed(3)}`,
      '--force-keyframes-at-cuts',
      '--recode-video', 'mp4',
      '--no-playlist',
      '--no-part',
      '-o', outputPath,
      url
    ];

    return new Promise((resolve, reject) => {
      const child = spawn('yt-dlp', args);
      let stderr = '';
      let lastSent = -1;

      const sendProgress = (info) => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('export-progress', info);
        }
      };

      child.stdout.on('data', (data) => {
        const out = data.toString();
        // yt-dlp の進捗（[download]   12.3% of ...）をパース
        const m = out.match(/(\d+\.?\d*)%/);
        if (m) {
          const pct = parseFloat(m[1]);
          if (Math.floor(pct) !== lastSent) {
            lastSent = Math.floor(pct);
            sendProgress({ percentage: pct, stage: 'download', output: out });
          }
        }
        // 後処理（マージ/再エンコード）の表示
        if (/Merger|VideoRemuxer|VideoConvertor|ffmpeg/i.test(out)) {
          sendProgress({ percentage: 100, stage: 'encoding', output: out });
        }
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, outputPath });
        } else {
          reject(new Error(`yt-dlpがcode ${code}で終了しました\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`yt-dlp実行エラー: ${error.message}`));
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// クリップ範囲の音声を whisper.cpp で文字起こし
// 1) ffmpeg で指定範囲を 16kHz mono WAV に抽出
// 2) whisper-cli で文字起こし → 生成された .txt を読み取り
// 3) finally で WAV/TXT を必ず削除
ipcMain.handle('transcribe-clip', async (event, videoPath, startTime, endTime) => {
  const whisperCli = process.env.WHISPER_CLI || 'whisper-cli';
  const modelPath = process.env.WHISPER_MODEL_PATH;
  const language = process.env.WHISPER_LANGUAGE || 'ja';

  if (!modelPath) {
    throw new Error('WHISPER_MODEL_PATH が設定されていません（.env を確認してください）');
  }
  if (!fs.existsSync(modelPath)) {
    throw new Error(`whisper モデルが見つかりません: ${modelPath}`);
  }
  if (!videoPath || !fs.existsSync(videoPath)) {
    throw new Error('動画ファイルが見つかりません');
  }
  const startSec = Number(startTime);
  const endSec = Number(endTime);
  if (!isFinite(startSec) || !isFinite(endSec) || endSec <= startSec) {
    throw new Error('トリミング範囲が不正です');
  }

  const prefix = path.join(os.tmpdir(), `yct-stt-${Date.now()}-${process.pid}`);
  const wavPath = `${prefix}.wav`;
  const txtPath = `${prefix}.txt`;

  try {
    // 1) ffmpeg で範囲抽出（16kHz mono PCM s16le WAV、whisper.cpp が確実に読める形式）
    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y',
        '-ss', String(startSec),
        '-to', String(endSec),
        '-i', videoPath,
        '-vn',
        '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
        wavPath
      ]);
      let stderr = '';
      ff.stderr.on('data', (d) => { stderr += d.toString(); });
      ff.on('error', (err) => reject(new Error(`ffmpeg 起動エラー: ${err.message}`)));
      ff.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg 終了コード ${code}: ${stderr.slice(-300)}`));
      });
    });

    // 2) whisper-cli を実行（入力は -f で明示。--no-prints は新しめのフラグなので付けない）
    await new Promise((resolve, reject) => {
      const wp = spawn(whisperCli, [
        '-m', modelPath,
        '-l', language,
        '-otxt',
        '-of', prefix,
        '-nt',
        '-f', wavPath
      ]);
      let stderr = '';
      wp.stderr.on('data', (d) => { stderr += d.toString(); });
      wp.on('error', (err) => reject(new Error(`whisper 起動エラー: ${err.message}（PATH を確認）`)));
      wp.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`whisper 終了コード ${code}: ${stderr.slice(-300)}`));
      });
    });

    // 3) 出力 txt を読む
    const text = await fs.promises.readFile(txtPath, 'utf8');
    return text.trim();
  } finally {
    fs.promises.unlink(wavPath).catch(() => {});
    fs.promises.unlink(txtPath).catch(() => {});
  }
});

// 波形データ（Peaks）を事前生成（長時間動画のOOMクラッシュ対策）
// version 2: ピーク位置をサンプル実時刻から計算するように変更（v1は長時間で時間ドリフト）
const PEAKS_CACHE_VERSION = 2;
ipcMain.handle('generate-waveform-peaks', async (event, videoPath, pixelsPerSecond = 20) => {
  try {
    // キャッシュファイルの確認
    const peaksCachePath = videoPath.replace(/\.[^.]+$/, '.peaks.json');
    if (fs.existsSync(peaksCachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(peaksCachePath, 'utf-8'));
        if (cached && cached.version === PEAKS_CACHE_VERSION) {
          return { success: true, peaks: cached.peaks, duration: cached.duration };
        }
      } catch (_) { /* 壊れたキャッシュは再生成 */ }
    }

    // ffprobeで動画の長さを取得
    // ストリーム側に duration が入らないコンテナがあるため、format.duration もフォールバックとして使う
    const duration = await new Promise((resolve, reject) => {
      const probe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        videoPath
      ]);
      let out = '';
      probe.stdout.on('data', (d) => { out += d.toString(); });
      probe.stderr.on('data', () => {});
      probe.on('close', (code) => {
        if (code !== 0) { reject(new Error('ffprobe失敗')); return; }
        try {
          const data = JSON.parse(out);
          const streams = Array.isArray(data.streams) ? data.streams : [];
          const audioStream = streams.find(s => s.codec_type === 'audio');
          const candidates = [
            audioStream && audioStream.duration,
            ...streams.map(s => s && s.duration),
            data.format && data.format.duration
          ];
          let dur = NaN;
          for (const c of candidates) {
            const v = parseFloat(c);
            if (!isNaN(v) && v > 0) { dur = v; break; }
          }
          if (!isNaN(dur) && dur > 0) { resolve(dur); } else { reject(new Error('動画時間を取得できません')); }
        } catch (e) { reject(e); }
      });
      probe.on('error', reject);
    });

    // ffmpegでモノラル低サンプルレートのRaw PCMを取得し、ストリーミングでピークを計算
    const sampleRate = 8000;
    const totalPeaks = Math.ceil(duration * pixelsPerSecond);
    // ピーク位置はサンプル実時刻 (sampleIndex / sampleRate) から直接計算する。
    // samplesPerPeak を整数で丸めると長時間動画で時間ドリフトが起きる（例: 1時間時点で約9秒ずれ）。
    const peakStride = sampleRate / pixelsPerSecond;

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
          const peakIdx = Math.min(Math.floor(sampleIndex / peakStride), totalPeaks - 1);
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
      fs.writeFileSync(
        peaksCachePath,
        JSON.stringify({ version: PEAKS_CACHE_VERSION, ...result }),
        'utf-8'
      );
    } catch (_) {}

    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
