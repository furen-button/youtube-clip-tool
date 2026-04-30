const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { youtube } = require('./youtube-api');

const execAsync = promisify(exec);

/**
 * YouTube動画のダウンロードと検索機能を提供するクラス
 */
class YouTubeDownloader {
  constructor(downloadDir = './downloads') {
    // 相対パスを絶対パスに変換
    this.downloadDir = path.resolve(downloadDir);
    this.ensureDownloadDir();
  }

  /**
   * ダウンロードディレクトリが存在することを確認
   */
  ensureDownloadDir() {
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  /**
   * YouTube動画の情報を取得
   * @param {string} url - YouTube動画のURL
   * @returns {Promise<Object>} 動画情報
   */
  async getVideoInfo(url) {
    try {
      // ライブチャットなど巨大なJSONフィールドを除外しつつバッファを大きめに確保
      const { stdout } = await execAsync(
        `yt-dlp --dump-json --no-playlist "${url}"`,
        { maxBuffer: 1024 * 1024 * 50 }
      );
      const info = JSON.parse(stdout);
      return {
        id: info.id,
        title: info.title,
        duration: info.duration,
        thumbnail: info.thumbnail,
        description: info.description,
        uploader: info.uploader,
        uploadDate: info.upload_date,
        viewCount: info.view_count,
        // 画質選択用に詳細フィールドを含める
        formats: info.formats.map(f => ({
          formatId: f.format_id,
          ext: f.ext,
          resolution: f.resolution,
          filesize: f.filesize,
          filesizeApprox: f.filesize_approx,
          vcodec: f.vcodec,
          acodec: f.acodec,
          height: f.height,
          width: f.width,
          fps: f.fps,
          tbr: f.tbr,             // 総ビットレート (kbps) — サイズ推定に使用
          formatNote: f.format_note,
          protocol: f.protocol
        }))
      };
    } catch (error) {
      throw new Error(`動画情報の取得に失敗しました: ${error.message}`);
    }
  }

  /**
   * YouTube動画を検索 (YouTube Data API v3を使用)
   * @param {string} query - 検索クエリ
   * @param {number} maxResults - 最大結果数
   * @returns {Promise<Array>} 検索結果
   */
  async searchVideos(query, maxResults = 10) {
    try {
      // YouTube Data API v3で検索
      const response = await youtube.search.list({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: maxResults,
        order: 'relevance'
      });

      if (!response.data.items || response.data.items.length === 0) {
        return [];
      }

      // 動画IDを取得
      const videoIds = response.data.items.map(item => item.id.videoId);

      // 詳細情報を取得（再生時間、視聴回数など）
      const detailsResponse = await youtube.videos.list({
        part: 'contentDetails,statistics',
        id: videoIds.join(',')
      });

      const detailsMap = {};
      if (detailsResponse.data.items) {
        detailsResponse.data.items.forEach(item => {
          detailsMap[item.id] = {
            duration: this.parseDuration(item.contentDetails.duration),
            viewCount: parseInt(item.statistics.viewCount) || 0
          };
        });
      }

      // 結果を整形
      const results = response.data.items.map(item => {
        const videoId = item.id.videoId;
        const details = detailsMap[videoId] || { duration: 0, viewCount: 0 };

        return {
          id: videoId,
          title: item.snippet.title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default.url,
          duration: details.duration,
          uploader: item.snippet.channelTitle,
          viewCount: details.viewCount
        };
      });

      return results;
    } catch (error) {
      // APIキーが設定されていない場合は、yt-dlpにフォールバック
      if (error.message.includes('API key') || error.code === 403) {
        console.warn('YouTube API利用不可、yt-dlpにフォールバック');
        return this.searchVideosWithYtDlp(query, maxResults);
      }
      throw new Error(`動画検索に失敗しました: ${error.message}`);
    }
  }

  /**
   * ISO 8601形式の期間を秒に変換
   * @param {string} duration - ISO 8601形式の期間（例: PT1H2M10S）
   * @returns {number} 秒数
   */
  parseDuration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * yt-dlpを使用した検索（フォールバック用）
   * @param {string} query - 検索クエリ
   * @param {number} maxResults - 最大結果数
   * @returns {Promise<Array>} 検索結果
   */
  async searchVideosWithYtDlp(query, maxResults = 10) {
    try {
      // バッファサイズを増やして実行
      const { stdout } = await execAsync(
        `yt-dlp "ytsearch${maxResults}:${query}" --dump-json --no-playlist --skip-download`,
        { maxBuffer: 1024 * 1024 * 10 } // 10MBに増加
      );
      
      const results = [];
      const lines = stdout.trim().split('\n');
      
      for (const line of lines) {
        if (line) {
          try {
            const info = JSON.parse(line);
            results.push({
              id: info.id,
              title: info.title,
              url: info.webpage_url,
              thumbnail: info.thumbnail,
              duration: info.duration,
              uploader: info.uploader,
              viewCount: info.view_count
            });
          } catch (e) {
            console.error('JSONのパースに失敗:', e.message);
          }
        }
      }
      
      return results;
    } catch (error) {
      throw new Error(`動画検索に失敗しました: ${error.message}`);
    }
  }

  /**
   * YouTube動画をダウンロード
   * @param {string} url - YouTube動画のURL
   * @param {Object} options - ダウンロードオプション
   * @returns {Promise<Object>} ダウンロード結果
   */
  async downloadVideo(url, options = {}) {
    const {
      format = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      outputTemplate = '%(id)s.%(ext)s',
      onProgress = null
    } = options;

    return new Promise(async (resolve, reject) => {
      const outputPath = path.join(this.downloadDir, outputTemplate);
      const command = `yt-dlp -f "${format}" -o "${outputPath}" --no-playlist "${url}"`;

      const child = exec(command);

      let downloadedFile = null;

      child.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(output);

        // ダウンロード進捗をパース
        const progressMatch = output.match(/(\d+\.?\d*)%/);
        if (progressMatch && onProgress) {
          onProgress({
            percentage: parseFloat(progressMatch[1]),
            output: output
          });
        }

        // ダウンロード完了ファイル名を取得
        const fileMatch = output.match(/\[download\] Destination: (.+)/);
        if (fileMatch) {
          downloadedFile = fileMatch[1].trim();
        }

        const mergeMatch = output.match(/\[Merger\] Merging formats into "(.+)"/);
        if (mergeMatch) {
          downloadedFile = mergeMatch[1].trim();
        }
      });

      child.stderr.on('data', (data) => {
        console.error('stderr:', data.toString());
      });

      child.on('close', async (code) => {
        if (code === 0) {
          // ダウンロード成功後、動画情報を取得してメタデータとして保存
          try {
            const videoInfo = await this.getVideoInfo(url);
            const videoFileName = path.basename(downloadedFile || outputPath);
            const metadataFileName = videoFileName.replace(/\.[^.]+$/, '.json');
            const metadataPath = path.join(this.downloadDir, metadataFileName);
            
            const metadata = {
              videoId: videoInfo.id,
              title: videoInfo.title,
              duration: videoInfo.duration,
              thumbnail: videoInfo.thumbnail,
              uploader: videoInfo.uploader,
              uploadDate: videoInfo.uploadDate,
              viewCount: videoInfo.viewCount,
              url: url,
              downloadedAt: new Date().toISOString(),
              filePath: downloadedFile || outputPath
            };
            
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
            console.log('メタデータを保存しました:', metadataPath);
          } catch (error) {
            console.error('メタデータの保存に失敗しました:', error.message);
          }
          
          resolve({
            success: true,
            filePath: downloadedFile || outputPath,
            message: 'ダウンロードが完了しました'
          });
        } else {
          reject(new Error(`ダウンロードに失敗しました (exit code: ${code})`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`ダウンロードエラー: ${error.message}`));
      });
    });
  }

  /**
   * ライブ配信のチャット（コメント）データをダウンロード
   * yt-dlpの--write-subsオプションを使用してライブチャットをJSON形式で取得
   * @param {string} videoId - YouTube動画のID
   * @param {Function} onProgress - 進捗コールバック
   * @returns {Promise<Object>} ダウンロード結果（ファイルパスとコメント数）
   */
  async downloadLiveChat(videoId, onProgress = null) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const outputTemplate = path.join(this.downloadDir, `${videoId}.%(ext)s`);

    return new Promise((resolve, reject) => {
      // ライブチャットのみダウンロード（動画はスキップ）
      const command = `yt-dlp --skip-download --write-subs --sub-langs live_chat -o "${outputTemplate}" --no-playlist "${url}"`;

      const child = exec(command, { maxBuffer: 1024 * 1024 * 50 }); // 50MB

      child.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[LiveChat DL]', output);
        if (onProgress) {
          onProgress({ status: 'downloading', output });
        }
      });

      child.stderr.on('data', (data) => {
        const output = data.toString();
        console.error('[LiveChat DL stderr]', output);
        if (onProgress) {
          onProgress({ status: 'downloading', output });
        }
      });

      child.on('close', (code) => {
        if (code === 0) {
          // ダウンロードされたライブチャットファイルを探す
          const liveChatPath = path.join(this.downloadDir, `${videoId}.live_chat.json`);
          if (fs.existsSync(liveChatPath)) {
            try {
              const parsed = this.parseLiveChatData(liveChatPath);
              resolve({
                success: true,
                filePath: liveChatPath,
                commentCount: parsed.length,
                message: `ライブチャットデータをダウンロードしました（${parsed.length}件）`
              });
            } catch (parseError) {
              resolve({
                success: true,
                filePath: liveChatPath,
                commentCount: 0,
                message: `ライブチャットデータをダウンロードしましたが、パースに失敗しました: ${parseError.message}`
              });
            }
          } else {
            reject(new Error('ライブチャットデータが見つかりません。この動画にはライブチャットが存在しない可能性があります。'));
          }
        } else {
          reject(new Error(`ライブチャットのダウンロードに失敗しました (exit code: ${code})`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`ライブチャットダウンロードエラー: ${error.message}`));
      });
    });
  }

  /**
   * ライブチャットのJSONLファイルを解析して構造化データに変換
   * @param {string} filePath - ライブチャットJSONLファイルのパス
   * @returns {Array<Object>} パース済みコメントデータの配列
   */
  parseLiveChatData(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    const comments = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);
        const action = entry.replayChatItemAction;
        if (!action) continue;

        // オフセット時間（マイクロ秒 → 秒）
        const offsetTimeMsec = parseInt(action.videoOffsetTimeMsec) || 0;
        const offsetTimeSec = offsetTimeMsec / 1000;

        // チャットアイテムを取得
        const actions = action.actions;
        if (!actions || actions.length === 0) continue;

        for (const act of actions) {
          const addAction = act.addChatItemAction;
          if (!addAction || !addAction.item) continue;

          const item = addAction.item;

          // テキストメッセージを抽出
          const renderer = item.liveChatTextMessageRenderer;
          if (renderer) {
            const messageText = this._extractMessageText(renderer.message);
            const authorName = renderer.authorName?.simpleText || '不明';

            comments.push({
              type: 'text',
              offsetTimeSec,
              offsetTimeMsec,
              author: authorName,
              message: messageText,
              timestamp: renderer.timestampText?.simpleText || ''
            });
            continue;
          }

          // スーパーチャット（投げ銭）メッセージ
          const paidRenderer = item.liveChatPaidMessageRenderer;
          if (paidRenderer) {
            const messageText = this._extractMessageText(paidRenderer.message);
            const authorName = paidRenderer.authorName?.simpleText || '不明';
            const amount = paidRenderer.purchaseAmountText?.simpleText || '';

            comments.push({
              type: 'superchat',
              offsetTimeSec,
              offsetTimeMsec,
              author: authorName,
              message: messageText,
              amount,
              timestamp: paidRenderer.timestampText?.simpleText || ''
            });
            continue;
          }

          // スーパーステッカー
          const stickerRenderer = item.liveChatPaidStickerRenderer;
          if (stickerRenderer) {
            const authorName = stickerRenderer.authorName?.simpleText || '不明';
            const amount = stickerRenderer.purchaseAmountText?.simpleText || '';

            comments.push({
              type: 'supersticker',
              offsetTimeSec,
              offsetTimeMsec,
              author: authorName,
              message: '[スーパーステッカー]',
              amount,
              timestamp: stickerRenderer.timestampText?.simpleText || ''
            });
          }
        }
      } catch (e) {
        // パースに失敗した行はスキップ
        continue;
      }
    }

    // オフセット時間でソート
    comments.sort((a, b) => a.offsetTimeSec - b.offsetTimeSec);
    return comments;
  }

  /**
   * メッセージオブジェクトからテキストを抽出
   * @param {Object} message - メッセージオブジェクト（runs配列を含む）
   * @returns {string} 結合されたテキスト
   * @private
   */
  _extractMessageText(message) {
    if (!message || !message.runs) return '';
    return message.runs.map(run => {
      if (run.text) return run.text;
      if (run.emoji) return run.emoji.shortcuts?.[0] || run.emoji.emojiId || '';
      return '';
    }).join('');
  }

  /**
   * パース済みライブチャットデータを取得
   * 既にダウンロード済みのファイルからコメントを読み込んで返す
   * @param {string} videoId - YouTube動画のID
   * @returns {Object} コメントデータ（comments配列とメタ情報）
   */
  getLiveChatData(videoId) {
    const liveChatPath = path.join(this.downloadDir, `${videoId}.live_chat.json`);
    
    if (!fs.existsSync(liveChatPath)) {
      return { exists: false, comments: [], message: 'ライブチャットデータが見つかりません' };
    }

    try {
      const comments = this.parseLiveChatData(liveChatPath);
      return {
        exists: true,
        comments,
        commentCount: comments.length,
        filePath: liveChatPath,
        message: `${comments.length}件のコメントを読み込みました`
      };
    } catch (error) {
      return { exists: false, comments: [], message: `パースに失敗: ${error.message}` };
    }
  }

  /**
   * コメント密度を計算（時間区間ごとのコメント数）
   * @param {string} videoId - YouTube動画のID
   * @param {number} intervalSec - 集計区間（秒）デフォルト5秒
   * @returns {Object} 密度データ（density配列、最大値、統計情報）
   */
  getCommentDensity(videoId, intervalSec = 5) {
    const chatData = this.getLiveChatData(videoId);
    if (!chatData.exists || chatData.comments.length === 0) {
      return { exists: false, density: [], maxCount: 0, totalComments: 0, message: chatData.message };
    }

    const comments = chatData.comments;
    const maxTime = comments[comments.length - 1].offsetTimeSec;
    const bucketCount = Math.ceil(maxTime / intervalSec) + 1;
    const density = new Array(bucketCount).fill(0);

    // 各コメントを対応するバケットに振り分け
    for (const comment of comments) {
      const bucketIndex = Math.floor(comment.offsetTimeSec / intervalSec);
      if (bucketIndex >= 0 && bucketIndex < bucketCount) {
        density[bucketIndex]++;
      }
    }

    const maxCount = Math.max(...density);
    const avgCount = comments.length / bucketCount;

    // 密度データを時間付きで返す
    const densityData = density.map((count, i) => ({
      startTime: i * intervalSec,
      endTime: (i + 1) * intervalSec,
      count
    }));

    return {
      exists: true,
      density: densityData,
      maxCount,
      avgCount,
      totalComments: comments.length,
      intervalSec,
      durationSec: maxTime,
      message: `${comments.length}件のコメントから密度を計算しました（${intervalSec}秒間隔）`
    };
  }

  /**
   * ダウンロード済みの動画ファイル一覧を取得
   * @returns {Promise<Array>} ファイル一覧
   */
  async listDownloadedVideos() {
    return new Promise((resolve, reject) => {
      fs.readdir(this.downloadDir, (err, files) => {
        if (err) {
          reject(new Error(`ファイル一覧の取得に失敗しました: ${err.message}`));
          return;
        }

        const videoFiles = files.filter(file => {
          const ext = path.extname(file).toLowerCase();
          return ['.mp4', '.webm', '.mkv', '.avi', '.mov'].includes(ext);
        });

        const fileInfos = videoFiles.map(file => {
          const filePath = path.join(this.downloadDir, file);
          const metadataPath = filePath.replace(/\.[^.]+$/, '.json');
          
          let metadata = null;
          if (fs.existsSync(metadataPath)) {
            try {
              const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
              metadata = JSON.parse(metadataContent);
            } catch (error) {
              console.error(`メタデータの読み込みに失敗: ${metadataPath}`, error.message);
            }
          }
          
          // ライブチャットデータの有無を確認
          const videoIdMatch = file.match(/([a-zA-Z0-9_-]{11})/);
          const hasLiveChat = videoIdMatch 
            ? fs.existsSync(path.join(this.downloadDir, `${videoIdMatch[1]}.live_chat.json`))
            : false;

          return {
            name: file,
            path: filePath,
            stats: fs.statSync(filePath),
            metadata: metadata,
            hasLiveChat: hasLiveChat
          };
        });

        resolve(fileInfos);
      });
    });
  }
}

module.exports = YouTubeDownloader;
