/**
 * レンダラープロセス - UIロジック
 */

// WaveSurfer.jsはCDN経由で読み込まれ、グローバル変数として使用可能

// DOM要素の取得
const searchQuery = document.getElementById('searchQuery');
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
const downloadUrl = document.getElementById('downloadUrl');
const downloadBtn = document.getElementById('downloadBtn');
const downloadProgress = document.getElementById('downloadProgress');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const downloadStatus = document.getElementById('downloadStatus');
const refreshBtn = document.getElementById('refreshBtn');
const downloadedVideos = document.getElementById('downloadedVideos');
const videoPlayer = document.getElementById('videoPlayer');
const previewSection = document.getElementById('previewSection');
const videoInfo = document.getElementById('videoInfo');

// 波形表示関連の要素
const waveformContainer = document.getElementById('waveform');
const waveformLoading = document.getElementById('waveformLoading');
const toggleWaveformBtn = document.getElementById('toggleWaveformBtn');
const normalizeCheckbox = document.getElementById('normalizeCheckbox');
const zoomToTrimBtn = document.getElementById('zoomToTrimBtn');
const resetZoomBtn = document.getElementById('resetZoomBtn');

// トリミング関連の要素
const startSlider = document.getElementById('startSlider');
const endSlider = document.getElementById('endSlider');
const startTimeDisplay = document.getElementById('startTimeDisplay');
const endTimeDisplay = document.getElementById('endTimeDisplay');
const durationDisplay = document.getElementById('durationDisplay');
const rangeHighlight = document.getElementById('rangeHighlight');
const setStartBtn = document.getElementById('setStartBtn');
const setEndBtn = document.getElementById('setEndBtn');
const playTrimmedBtn = document.getElementById('playTrimmedBtn');
const resetTrimBtn = document.getElementById('resetTrimBtn');
const loopCheckbox = document.getElementById('loopCheckbox');

// メタデータ関連の要素
const videoIdInput = document.getElementById('videoId');
const fileNameInput = document.getElementById('fileName');
const serifInput = document.getElementById('serif');
const rubyInput = document.getElementById('ruby');
const clipUrlInput = document.getElementById('clipUrl');
const memoInput = document.getElementById('memo');
const categoryButtons = document.getElementById('categoryButtons');
const selectedCategoriesDiv = document.getElementById('selectedCategories');
const generateFileNameBtn = document.getElementById('generateFileNameBtn');
const generateRubyBtn = document.getElementById('generateRubyBtn');
const generateClipUrlBtn = document.getElementById('generateClipUrlBtn');
const saveMetadataBtn = document.getElementById('saveMetadataBtn');
const clearMetadataBtn = document.getElementById('clearMetadataBtn');
const exportVideoBtn = document.getElementById('exportVideoBtn');

// WaveSurferインスタンス
let wavesurfer = null;
let wavesurferRegions = null;
let trimRegion = null;
let waveformVisible = false;

// トリミング状態
let trimState = {
  startTime: 0,
  endTime: 0,
  duration: 0,
  isLooping: true
};

// メタデータ状態
let metadata = {
  videoId: '',
  fileName: '',
  serif: '',
  ruby: '',
  categories: [],
  clipUrl: '',
  memo: ''
};

// 現在読み込まれている動画ファイル
let currentVideoFile = null;

/**
 * トースト通知を表示
 */
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  // アイコンを設定
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };
  
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <div class="toast-content">
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
    <button class="toast-close">×</button>
  `;
  
  container.appendChild(toast);
  
  // 閉じるボタンのイベント
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    removeToast(toast);
  });
  
  // 自動で閉じる
  if (duration > 0) {
    setTimeout(() => {
      removeToast(toast);
    }, duration);
  }
  
  return toast;
}

/**
 * トーストを削除
 */
function removeToast(toast) {
  toast.classList.add('removing');
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

/**
 * YouTube動画を検索
 */
async function searchVideos() {
  const query = searchQuery.value.trim();
  if (!query) {
    showStatus('検索キーワードを入力してください', 'error');
    return;
  }

  searchResults.innerHTML = '<div class="loading">検索中</div>';
  searchBtn.disabled = true;

  try {
    const result = await window.electronAPI.searchVideos(query, 10);
    
    if (result.success) {
      displaySearchResults(result.data);
    } else {
      searchResults.innerHTML = `<p class="error">検索に失敗しました: ${result.error}</p>`;
    }
  } catch (error) {
    searchResults.innerHTML = `<p class="error">エラーが発生しました: ${error.message}</p>`;
  } finally {
    searchBtn.disabled = false;
  }
}

/**
 * 検索結果を表示
 */
function displaySearchResults(videos) {
  if (videos.length === 0) {
    searchResults.innerHTML = '<p>検索結果が見つかりませんでした</p>';
    return;
  }

  searchResults.innerHTML = videos.map(video => `
    <div class="video-card">
      <img src="${video.thumbnail}" alt="${video.title}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22180%22%3E%3Crect fill=%22%23ddd%22 width=%22320%22 height=%22180%22/%3E%3C/svg%3E'">
      <div class="video-card-content">
        <div class="video-card-title">${escapeHtml(video.title)}</div>
        <div class="video-card-info">
          <div>チャンネル: ${escapeHtml(video.uploader)}</div>
          <div>再生時間: ${formatDuration(video.duration)}</div>
          <div>視聴回数: ${formatNumber(video.viewCount)}</div>
        </div>
        <div class="video-card-actions">
          <button class="btn btn-info" onclick="setDownloadUrl('${video.url}')">
            ダウンロード
          </button>
          <button class="btn btn-secondary" onclick="openInBrowser('${video.url}')" style="font-size: 0.9rem; padding: 8px 16px;">
            開く
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

/**
 * ダウンロードURLを設定
 */
function setDownloadUrl(url) {
  downloadUrl.value = url;
  downloadUrl.scrollIntoView({ behavior: 'smooth' });
}

/**
 * ブラウザでURLを開く（外部ブラウザ起動）
 */
function openInBrowser(url) {
  require('electron').shell.openExternal(url);
}

/**
 * 動画をダウンロード
 */
async function downloadVideo() {
  const url = downloadUrl.value.trim();
  if (!url) {
    showStatus('YouTube URLを入力してください', 'error');
    return;
  }

  downloadBtn.disabled = true;
  downloadProgress.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = '0%';
  showStatus('', '');

  // ダウンロード進捗の監視
  window.electronAPI.onDownloadProgress((progress) => {
    const percentage = Math.round(progress.percentage);
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${percentage}%`;
  });

  try {
    const result = await window.electronAPI.downloadVideo(url);
    
    if (result.success) {
      showStatus(`ダウンロードが完了しました: ${result.data.filePath}`, 'success');
      progressBar.style.width = '100%';
      progressText.textContent = '100%';
      
      // ダウンロード済み動画リストを更新
      setTimeout(() => {
        loadDownloadedVideos();
      }, 500);
    } else {
      showStatus(`ダウンロードに失敗しました: ${result.error}`, 'error');
    }
  } catch (error) {
    showStatus(`エラーが発生しました: ${error.message}`, 'error');
  } finally {
    downloadBtn.disabled = false;
    window.electronAPI.removeDownloadProgressListener();
    
    // プログレスバーを数秒後に非表示
    setTimeout(() => {
      downloadProgress.style.display = 'none';
    }, 3000);
  }
}

/**
 * ダウンロード済み動画一覧を読み込み
 */
async function loadDownloadedVideos() {
  downloadedVideos.innerHTML = '<div class="loading">読み込み中</div>';

  try {
    const result = await window.electronAPI.listDownloadedVideos();
    
    if (result.success) {
      displayDownloadedVideos(result.data);
    } else {
      downloadedVideos.innerHTML = `<p class="error">読み込みに失敗しました: ${result.error}</p>`;
    }
  } catch (error) {
    downloadedVideos.innerHTML = `<p class="error">エラーが発生しました: ${error.message}</p>`;
  }
}

/**
 * ダウンロード済み動画を表示
 */
function displayDownloadedVideos(files) {
  if (files.length === 0) {
    downloadedVideos.innerHTML = '<p>ダウンロード済みの動画がありません</p>';
    return;
  }

  downloadedVideos.innerHTML = files.map((file, index) => `
    <div class="video-item">
      <div class="video-item-info">
        <div class="video-item-name">${escapeHtml(file.name)}</div>
        <div class="video-item-details">
          サイズ: ${formatFileSize(file.stats.size)} | 
          更新日時: ${new Date(file.stats.mtime).toLocaleString('ja-JP')}
        </div>
      </div>
      <div class="video-item-actions">
        <button class="btn btn-primary" onclick="playVideo(${index})">
          再生
        </button>
      </div>
    </div>
  `).join('');
  
  // ファイル情報を保存（再生時に使用）
  window.downloadedFilesList = files;
}

/**
 * 動画を再生
 */
async function playVideo(fileIndex) {
  if (!window.downloadedFilesList || !window.downloadedFilesList[fileIndex]) {
    console.error('ファイルが見つかりません');
    return;
  }
  
  const file = window.downloadedFilesList[fileIndex];
  const filePath = file.path;
  
  // 現在の動画ファイル情報を保存
  currentVideoFile = {
    name: file.name,
    path: filePath,
    size: file.stats.size
  };
  
  // Video IDを抽出（ファイル名から）
  const videoIdMatch = file.name.match(/([a-zA-Z0-9_-]{11})/);
  if (videoIdMatch) {
    videoIdInput.value = videoIdMatch[1];
    metadata.videoId = videoIdMatch[1];
  }
  
  // デバッグ情報
  console.log('Loading video:', filePath);
  
  try {
    // IPCを使ってファイルを読み込む
    const result = await window.electronAPI.loadVideoFile(filePath);
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    // バッファをBlobに変換
    const blob = new Blob([result.data], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    
    // 既存のObject URLがあれば解放
    if (videoPlayer.src && videoPlayer.src.startsWith('blob:')) {
      URL.revokeObjectURL(videoPlayer.src);
    }
    
    videoPlayer.src = url;
    previewSection.style.display = 'block';
    previewSection.scrollIntoView({ behavior: 'smooth' });
    
    videoPlayer.onerror = (e) => {
      console.error('動画の読み込みに失敗しました:', e);
      console.error('Video error code:', videoPlayer.error ? videoPlayer.error.code : 'unknown');
      console.error('Video error message:', videoPlayer.error ? videoPlayer.error.message : 'unknown');
      videoInfo.innerHTML = `
        <p style="color: red;">動画の読み込みに失敗しました</p>
        <p><strong>ファイル:</strong> ${escapeHtml(file.name)}</p>
        <p><strong>パス:</strong> ${escapeHtml(filePath)}</p>
        <p><strong>エラーコード:</strong> ${videoPlayer.error ? videoPlayer.error.code : 'unknown'}</p>
        <p>ファイルが存在するか、形式がサポートされているか確認してください。</p>
      `;
    };
    
    videoPlayer.onloadedmetadata = () => {
      console.log('Video loaded successfully');
      videoInfo.innerHTML = `
        <p><strong>ファイル:</strong> ${escapeHtml(file.name)}</p>
        <p><strong>再生時間:</strong> ${formatDuration(videoPlayer.duration)}</p>
        <p><strong>解像度:</strong> ${videoPlayer.videoWidth} × ${videoPlayer.videoHeight}</p>
      `;
    };
  } catch (error) {
    console.error('動画の読み込みエラー:', error);
    videoInfo.innerHTML = `
      <p style="color: red;">動画の読み込みに失敗しました</p>
      <p><strong>ファイル:</strong> ${escapeHtml(file.name)}</p>
      <p><strong>パス:</strong> ${escapeHtml(filePath)}</p>
      <p><strong>エラー:</strong> ${escapeHtml(error.message)}</p>
    `;
    previewSection.style.display = 'block';
  }
}

/**
 * ステータスメッセージを表示
 */
function showStatus(message, type) {
  downloadStatus.textContent = message;
  downloadStatus.className = 'status-message';
  if (type) {
    downloadStatus.classList.add(type);
  }
  
  if (message && type === 'error') {
    setTimeout(() => {
      downloadStatus.className = 'status-message';
    }, 5000);
  }
}

/**
 * ユーティリティ関数
 */

// HTMLエスケープ
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// 再生時間をフォーマット
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '不明';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

// 数値をフォーマット
function formatNumber(num) {
  if (!num) return '不明';
  return num.toLocaleString('ja-JP');
}

// ファイルサイズをフォーマット
function formatFileSize(bytes) {
  if (!bytes) return '不明';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * イベントリスナーの設定
 */
searchBtn.addEventListener('click', searchVideos);
searchQuery.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    searchVideos();
  }
});

downloadBtn.addEventListener('click', downloadVideo);
downloadUrl.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    downloadVideo();
  }
});

refreshBtn.addEventListener('click', loadDownloadedVideos);

// 初期読み込み
window.addEventListener('DOMContentLoaded', () => {
  loadDownloadedVideos();
});

/**
 * トリミング機能
 */

// 時間を「分:秒.ミリ秒」形式にフォーマット
function formatTimeWithMillis(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00.000';
  
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

// トリミング時間表示を更新
function updateTrimDisplay() {
  const videoDuration = videoPlayer.duration || 0;
  
  trimState.startTime = (startSlider.value / 100) * videoDuration;
  trimState.endTime = (endSlider.value / 100) * videoDuration;
  trimState.duration = trimState.endTime - trimState.startTime;
  
  startTimeDisplay.textContent = formatTimeWithMillis(trimState.startTime);
  endTimeDisplay.textContent = formatTimeWithMillis(trimState.endTime);
  durationDisplay.textContent = formatTimeWithMillis(trimState.duration);
  
  // ハイライト表示を更新
  updateRangeHighlight();
  
  // ファイル名を自動更新
  autoGenerateFileName();
}

// 範囲ハイライトの表示を更新
function updateRangeHighlight() {
  const startPercent = parseFloat(startSlider.value);
  const endPercent = parseFloat(endSlider.value);
  
  rangeHighlight.style.left = `${startPercent}%`;
  rangeHighlight.style.width = `${endPercent - startPercent}%`;
  
  // 波形のregionを更新
  updateWaveformRegion();
  
  // 波形のズームを更新
  updateWaveformZoom();
}

// 波形をトリミング範囲にズーム
function updateWaveformZoom() {
  if (!wavesurfer || !videoPlayer.duration) return;
  
  const duration = videoPlayer.duration;
  const startTime = trimState.startTime;
  const endTime = trimState.endTime;
  const trimDuration = endTime - startTime;
  
  // ズーム倍率を計算（全体の長さ / トリミング範囲）
  const zoomLevel = duration / trimDuration;
  
  // WaveSurferのズームを設定（倍率を適切な範囲に制限）
  const clampedZoom = Math.max(1, Math.min(zoomLevel, 100));
  
  try {
    wavesurfer.zoom(clampedZoom);
    
    // トリミング開始位置にスクロール
    const scrollPercent = startTime / duration;
    const container = waveformContainer;
    const scrollLeft = scrollPercent * (container.scrollWidth - container.clientWidth);
    container.scrollLeft = scrollLeft;
  } catch (error) {
    console.error('ズームエラー:', error);
  }
}

// トリミングスライダーの初期化
function initTrimSliders() {
  if (!videoPlayer.duration) return;
  
  const duration = videoPlayer.duration;
  trimState.endTime = duration;
  endSlider.value = 100;
  startSlider.value = 0;
  
  updateTrimDisplay();
}

// 開始位置スライダーの変更
startSlider.addEventListener('input', () => {
  // 開始位置が終了位置を超えないようにする
  if (parseFloat(startSlider.value) >= parseFloat(endSlider.value)) {
    startSlider.value = Math.max(0, parseFloat(endSlider.value) - 0.01);
  }
  updateTrimDisplay();
});

// 終了位置スライダーの変更
endSlider.addEventListener('input', () => {
  // 終了位置が開始位置より前にならないようにする
  if (parseFloat(endSlider.value) <= parseFloat(startSlider.value)) {
    endSlider.value = Math.min(100, parseFloat(startSlider.value) + 0.01);
  }
  updateTrimDisplay();
});

// 現在位置を開始位置に設定
setStartBtn.addEventListener('click', () => {
  if (!videoPlayer.duration) return;
  
  const currentTime = videoPlayer.currentTime;
  const percentage = (currentTime / videoPlayer.duration) * 100;
  
  // 終了位置より前であることを確認
  if (percentage < parseFloat(endSlider.value)) {
    startSlider.value = percentage;
    updateTrimDisplay();
  } else {
    showToast('開始位置は終了位置より前に設定してください', 'warning');
  }
});

// 現在位置を終了位置に設定
setEndBtn.addEventListener('click', () => {
  if (!videoPlayer.duration) return;
  
  const currentTime = videoPlayer.currentTime;
  const percentage = (currentTime / videoPlayer.duration) * 100;
  
  // 開始位置より後であることを確認
  if (percentage > parseFloat(startSlider.value)) {
    endSlider.value = percentage;
    updateTrimDisplay();
  } else {
    showToast('終了位置は開始位置より後に設定してください', 'warning');
  }
});

// トリミング範囲を再生
playTrimmedBtn.addEventListener('click', () => {
  if (!videoPlayer.duration) return;
  
  videoPlayer.currentTime = trimState.startTime;
  videoPlayer.play();
  // チェックボックスの状態に合わせる
  trimState.isLooping = loopCheckbox.checked;
});

// ループ再生チェックボックスの変更
loopCheckbox.addEventListener('change', () => {
  trimState.isLooping = loopCheckbox.checked;
});

// トリミング設定をリセット
resetTrimBtn.addEventListener('click', () => {
  if (!videoPlayer.duration) return;
  
  startSlider.value = 0;
  endSlider.value = 100;
  trimState.isLooping = true;
  loopCheckbox.checked = true;
  updateTrimDisplay();
});

/**
 * トリミング範囲の微調整機能
 */

// フレームレート（通常30fps、60fpsなどの動画にも対応）
const DEFAULT_FRAME_RATE = 30;

// フレーム数から秒数に変換
function framesToSeconds(frames, frameRate = DEFAULT_FRAME_RATE) {
  return frames / frameRate;
}

// 開始位置の微調整
document.getElementById('startMinus15FrameBtn').addEventListener('click', () => adjustStartTime(-15));
document.getElementById('startMinus1FrameBtn').addEventListener('click', () => adjustStartTime(-1));
document.getElementById('startPlus1FrameBtn').addEventListener('click', () => adjustStartTime(1));
document.getElementById('startPlus15FrameBtn').addEventListener('click', () => adjustStartTime(15));

// 終了位置の微調整
document.getElementById('endMinus15FrameBtn').addEventListener('click', () => adjustEndTime(-15));
document.getElementById('endMinus1FrameBtn').addEventListener('click', () => adjustEndTime(-1));
document.getElementById('endPlus1FrameBtn').addEventListener('click', () => adjustEndTime(1));
document.getElementById('endPlus15FrameBtn').addEventListener('click', () => adjustEndTime(15));

// 開始位置を調整
function adjustStartTime(frames) {
  if (!videoPlayer.duration) return;
  
  const adjustSeconds = framesToSeconds(frames);
  let newStartTime = trimState.startTime + adjustSeconds;
  
  // 範囲チェック
  newStartTime = Math.max(0, Math.min(newStartTime, trimState.endTime - 0.1));
  
  // スライダーを更新
  const percentage = (newStartTime / videoPlayer.duration) * 100;
  startSlider.value = percentage;
  updateTrimDisplay();
  
  // 開始位置から再生
  videoPlayer.currentTime = trimState.startTime;
  videoPlayer.play().catch(e => console.error('再生エラー:', e));
}

// 終了位置を調整
function adjustEndTime(frames) {
  if (!videoPlayer.duration) return;
  
  const adjustSeconds = framesToSeconds(frames);
  let newEndTime = trimState.endTime + adjustSeconds;
  
  // 範囲チェック
  newEndTime = Math.max(trimState.startTime + 0.1, Math.min(newEndTime, videoPlayer.duration));
  
  // スライダーを更新
  const percentage = (newEndTime / videoPlayer.duration) * 100;
  endSlider.value = percentage;
  updateTrimDisplay();
  
  // 終了位置の2秒前から再生
  const playbackTime = Math.max(trimState.endTime - 2, trimState.startTime);
  videoPlayer.currentTime = playbackTime;
  videoPlayer.play().catch(e => console.error('再生エラー:', e));
}

// 動画の再生位置を監視してトリミング範囲でループ
videoPlayer.addEventListener('timeupdate', () => {
  if (trimState.isLooping && videoPlayer.currentTime >= trimState.endTime) {
    videoPlayer.currentTime = trimState.startTime;
  }
});

// 動画が一時停止したらループを停止
videoPlayer.addEventListener('pause', () => {
  trimState.isLooping = false;
  loopCheckbox.checked = false;
});

// 動画のメタデータが読み込まれたらトリミングスライダーを初期化
videoPlayer.addEventListener('loadedmetadata', () => {
  initTrimSliders();
});

/**
 * WaveSurfer - 音声波形表示機能
 */

// WaveSurferを初期化
function initWaveSurfer() {
  if (wavesurfer) {
    wavesurfer.destroy();
  }

  wavesurfer = WaveSurfer.create({
    container: waveformContainer,
    waveColor: '#667eea',
    progressColor: '#764ba2',
    cursorColor: '#e53e3e',
    barWidth: 2,
    barRadius: 3,
    cursorWidth: 2,
    height: 128,
    barGap: 2,
    normalize: normalizeCheckbox.checked,
    responsive: true,
    backend: 'MediaElement',
    media: videoPlayer,
    autoplay: false,
    interact: true
  });

  // Regionsプラグインを初期化
  wavesurferRegions = wavesurfer.registerPlugin(WaveSurfer.Regions.create());

  // 既存のトリミング範囲でregionを作成
  if (videoPlayer.duration) {
    updateWaveformRegion();
  }

  // Region更新イベント - ドラッグでトリミング範囲を変更
  wavesurferRegions.on('region-updated', (region) => {
    if (region.id === 'trim-region') {
      const duration = videoPlayer.duration;
      trimState.startTime = region.start;
      trimState.endTime = region.end;
      trimState.duration = region.end - region.start;

      // スライダーを更新
      startSlider.value = (region.start / duration) * 100;
      endSlider.value = (region.end / duration) * 100;

      // 表示を更新
      startTimeDisplay.textContent = formatTimeWithMillis(region.start);
      endTimeDisplay.textContent = formatTimeWithMillis(region.end);
      durationDisplay.textContent = formatTimeWithMillis(region.end - region.start);
      updateRangeHighlight();
    }
  });

  // 波形がロードされたら
  wavesurfer.on('ready', () => {
    waveformLoading.style.display = 'none';
    console.log('WaveSurfer ready');
  });

  // 波形クリックで再生位置を変更して再生
  wavesurfer.on('click', (relativeX) => {
    // relativeXは0-1の範囲の相対位置
    const newTime = relativeX * videoPlayer.duration;
    videoPlayer.currentTime = newTime;
    if (videoPlayer.paused) {
      videoPlayer.play().catch(e => console.error('再生エラー:', e));
    }
  });
  
  // interactionイベント
  wavesurfer.on('interaction', (newTime) => {
    videoPlayer.currentTime = newTime;
    if (videoPlayer.paused) {
      videoPlayer.play().catch(e => console.error('再生エラー:', e));
    }
  });

  // エラーハンドリング
  wavesurfer.on('error', (error) => {
    waveformLoading.style.display = 'none';
    waveformLoading.textContent = '波形の生成に失敗しました';
  });

  return wavesurfer;
}

// 波形上のトリミング範囲を更新
function updateWaveformRegion() {
  if (!wavesurferRegions || !videoPlayer.duration) return;

  // 既存のregionを削除
  if (trimRegion) {
    trimRegion.remove();
    trimRegion = null;
  }

  // 新しいregionを作成
  try {
    trimRegion = wavesurferRegions.addRegion({
      id: 'trim-region',
      start: trimState.startTime,
      end: trimState.endTime,
      color: 'rgba(102, 126, 234, 0.3)',
      drag: true,
      resize: true
    });
  } catch (error) {
    console.error('Region作成エラー:', error);
  }
}

// 波形表示を切り替え
function toggleWaveform() {
  if (!videoPlayer.src) {
    showToast('動画を選択してください', 'warning');
    return;
  }

  waveformVisible = !waveformVisible;

  if (waveformVisible) {
    // 波形を表示
    waveformContainer.style.display = 'block';
    waveformLoading.style.display = 'block';
    waveformLoading.textContent = '波形を生成中...';
    toggleWaveformBtn.textContent = '波形を非表示';
    zoomToTrimBtn.style.display = 'inline-block';
    resetZoomBtn.style.display = 'inline-block';

    try {
      // video要素を使用してWaveSurferを初期化
      // media: videoPlayerを設定しているので、loadは不要
      initWaveSurfer();
    } catch (error) {
      console.error('波形の読み込みエラー:', error);
      waveformLoading.textContent = '波形の生成に失敗しました';
    }
  } else {
    // 波形を非表示
    waveformContainer.style.display = 'none';
    waveformLoading.style.display = 'none';
    toggleWaveformBtn.textContent = '波形を表示';
    zoomToTrimBtn.style.display = 'none';
    resetZoomBtn.style.display = 'none';
    if (wavesurfer) {
      wavesurfer.destroy();
      wavesurfer = null;
      wavesurferRegions = null;
      trimRegion = null;
    }
  }
}

// 正規化チェックボックスの変更
normalizeCheckbox.addEventListener('change', () => {
  if (wavesurfer && waveformVisible) {
    // 波形を再生成
    toggleWaveform();
    setTimeout(() => {
      if (!waveformVisible) {
        toggleWaveform();
      }
    }, 100);
  }
});

// 波形表示ボタンのクリック
toggleWaveformBtn.addEventListener('click', toggleWaveform);

// トリミング範囲にズーム
zoomToTrimBtn.addEventListener('click', () => {
  if (!wavesurfer || !videoPlayer.duration) {
    showToast('動画と波形を読み込んでください', 'warning');
    return;
  }
  updateWaveformZoom();
});

// ズームをリセット
resetZoomBtn.addEventListener('click', () => {
  if (!wavesurfer) {
    showToast('波形を表示してください', 'warning');
    return;
  }
  
  try {
    // ズームをリセット（倍率1）
    wavesurfer.zoom(1);
    waveformContainer.scrollLeft = 0;
  } catch (error) {
    console.error('ズームリセットエラー:', error);
  }
});

/**
 * メタデータ編集機能
 */

// カテゴリボタンのクリックイベント
categoryButtons.addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-category')) {
    const category = e.target.dataset.category;
    
    // アクティブ状態をトグル
    e.target.classList.toggle('active');
    
    // カテゴリ配列を更新
    if (metadata.categories.includes(category)) {
      metadata.categories = metadata.categories.filter(c => c !== category);
    } else {
      metadata.categories.push(category);
    }
    
    // 選択済みカテゴリ表示を更新
    updateSelectedCategories();
  }
});

// 選択済みカテゴリの表示を更新
function updateSelectedCategories() {
  if (metadata.categories.length === 0) {
    selectedCategoriesDiv.innerHTML = '<span style="color: #a0aec0; font-size: 0.9rem;">カテゴリが選択されていません</span>';
    return;
  }
  
  selectedCategoriesDiv.innerHTML = metadata.categories.map(category => `
    <span class="category-tag">
      ${escapeHtml(category)}
      <span class="remove-btn" data-category="${escapeHtml(category)}">×</span>
    </span>
  `).join('');
  
  // 削除ボタンのイベント
  selectedCategoriesDiv.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.category;
      metadata.categories = metadata.categories.filter(c => c !== category);
      
      // ボタンのアクティブ状態を解除
      const categoryBtn = Array.from(categoryButtons.querySelectorAll('.btn-category'))
        .find(b => b.dataset.category === category);
      if (categoryBtn) {
        categoryBtn.classList.remove('active');
      }
      
      updateSelectedCategories();
    });
  });
}

// ファイル名の自動生成関数
function autoGenerateFileName() {
  const videoId = videoIdInput.value.trim();
  
  if (!videoId || !videoPlayer.duration) {
    return;
  }
  
  // フォーマット: videoId_startTime-endTime（秒は6桁0詰め）
  const startSec = Math.floor(trimState.startTime);
  const endSec = Math.floor(trimState.endTime);
  const startSecPadded = String(startSec).padStart(6, '0');
  const endSecPadded = String(endSec).padStart(6, '0');
  const fileName = `${videoId}_${startSecPadded}-${endSecPadded}`;
  
  fileNameInput.value = fileName;
  metadata.fileName = fileName;
}

// ファイル名の自動生成ボタン
generateFileNameBtn.addEventListener('click', () => {
  const videoId = videoIdInput.value.trim();
  
  if (!videoId) {
    showToast('Video IDを入力してください', 'warning');
    return;
  }
  
  if (!videoPlayer.duration) {
    showToast('動画を読み込んでください', 'warning');
    return;
  }
  
  autoGenerateFileName();
});

// ルビの自動生成（簡易版：ひらがな変換APIを使わず、そのまま表示）
generateRubyBtn.addEventListener('click', () => {
  const serif = serifInput.value.trim();
  
  if (!serif) {
    showToast('セリフを入力してください', 'warning');
    return;
  }
  
  // 実際のアプリケーションでは、ひらがな変換APIを使用
  // ここでは簡易的にトーストを表示
  showToast('ルビの自動生成機能は将来実装予定です。\n現在は手動でひらがなを入力してください。', 'info', 5000);
});

// クリップURLの自動生成
generateClipUrlBtn.addEventListener('click', () => {
  const videoId = videoIdInput.value.trim();
  
  if (!videoId) {
    showToast('Video IDを入力してください', 'warning');
    return;
  }
  
  if (!videoPlayer.duration) {
    showToast('動画を読み込んでください', 'warning');
    return;
  }
  
  // YouTube URL with timestamp
  const startSec = Math.floor(trimState.startTime);
  const clipUrl = `https://youtube.com/watch?v=${videoId}&t=${startSec}s`;
  
  clipUrlInput.value = clipUrl;
  metadata.clipUrl = clipUrl;
});

// メタデータの保存（JSON）
saveMetadataBtn.addEventListener('click', async () => {
  // フォームデータを収集
  metadata.videoId = videoIdInput.value.trim();
  metadata.fileName = fileNameInput.value.trim();
  metadata.serif = serifInput.value.trim();
  metadata.ruby = rubyInput.value.trim();
  metadata.clipUrl = clipUrlInput.value.trim();
  metadata.memo = memoInput.value.trim();
  
  // トリミング情報も含める
  const saveData = {
    ...metadata,
    trimming: {
      startTime: trimState.startTime,
      endTime: trimState.endTime,
      duration: trimState.duration
    },
    videoFile: currentVideoFile,
    createdAt: new Date().toISOString()
  };
  
  try {
    // IPCを使ってoutput/jsonディレクトリに保存
    const result = await window.electronAPI.saveMetadata(saveData, metadata.fileName || 'metadata');
    
    if (result.success) {
      showToast(`メタデータを保存しました\n保存先: ${result.filePath}`, 'success', 5000);
    } else {
      showToast(`保存に失敗しました: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('保存エラー:', error);
    showToast(`保存に失敗しました: ${error.message}`, 'error');
  }
});

// 動画を書き出し（FFmpeg）
exportVideoBtn.addEventListener('click', async () => {
  // 動画が読み込まれているか確認
  if (!currentVideoFile || !currentVideoFile.path) {
    showToast('動画を読み込んでください', 'warning');
    return;
  }
  
  // トリミング範囲が設定されているか確認
  if (!videoPlayer.duration || trimState.duration <= 0) {
    showToast('トリミング範囲を設定してください', 'warning');
    return;
  }
  
  // ファイル名が設定されているか確認
  const fileName = fileNameInput.value.trim() || metadata.fileName;
  if (!fileName) {
    showToast('ファイル名を入力してください', 'warning');
    return;
  }
  
  try {
    // ボタンを無効化
    exportVideoBtn.disabled = true;
    exportVideoBtn.textContent = '書き出し中...';
    
    showToast('動画の書き出しを開始しました', 'info');
    
    // FFmpegで動画を書き出し
    const result = await window.electronAPI.exportVideo(
      currentVideoFile.path,
      fileName,
      trimState.startTime,
      trimState.endTime
    );
    
    if (result.success) {
      showToast(`動画を書き出しました\n保存先: ${result.outputPath}`, 'success', 5000);
    } else {
      showToast(`書き出しに失敗しました: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('書き出しエラー:', error);
    showToast(`書き出しに失敗しました: ${error.message}`, 'error');
  } finally {
    // ボタンを有効化
    exportVideoBtn.disabled = false;
    exportVideoBtn.textContent = '動画を書き出し (MP4)';
  }
});

// メタデータのクリア
clearMetadataBtn.addEventListener('click', () => {
  if (!confirm('メタデータをクリアしますか？')) {
    return;
  }
  
  // フォームをクリア
  videoIdInput.value = '';
  fileNameInput.value = '';
  serifInput.value = '';
  rubyInput.value = '';
  clipUrlInput.value = '';
  memoInput.value = '';
  
  // カテゴリをクリア
  metadata.categories = [];
  categoryButtons.querySelectorAll('.btn-category').forEach(btn => {
    btn.classList.remove('active');
  });
  updateSelectedCategories();
  
  // メタデータオブジェクトをリセット
  metadata = {
    videoId: '',
    fileName: '',
    serif: '',
    ruby: '',
    categories: [],
    clipUrl: '',
    memo: ''
  };
  
  showToast('メタデータをクリアしました', 'success');
});

// 入力フィールドの変更を監視
videoIdInput.addEventListener('input', (e) => {
  metadata.videoId = e.target.value.trim();
  autoGenerateFileName();
});
fileNameInput.addEventListener('input', (e) => metadata.fileName = e.target.value.trim());
serifInput.addEventListener('input', (e) => metadata.serif = e.target.value.trim());
rubyInput.addEventListener('input', (e) => metadata.ruby = e.target.value.trim());
clipUrlInput.addEventListener('input', (e) => metadata.clipUrl = e.target.value.trim());
memoInput.addEventListener('input', (e) => metadata.memo = e.target.value.trim());

// 初期化
updateSelectedCategories();
