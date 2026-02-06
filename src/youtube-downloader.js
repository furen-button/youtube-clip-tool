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
      const { stdout } = await execAsync(
        `yt-dlp --dump-json --no-playlist "${url}"`
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
        formats: info.formats.map(f => ({
          formatId: f.format_id,
          ext: f.ext,
          resolution: f.resolution,
          filesize: f.filesize
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

    return new Promise((resolve, reject) => {
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

      child.on('close', (code) => {
        if (code === 0) {
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

        const fileInfos = videoFiles.map(file => ({
          name: file,
          path: path.join(this.downloadDir, file),
          stats: fs.statSync(path.join(this.downloadDir, file))
        }));

        resolve(fileInfos);
      });
    });
  }
}

module.exports = YouTubeDownloader;
