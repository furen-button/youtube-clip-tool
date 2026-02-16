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

// ズームパディング設定（秒）
const zoomPaddingLevels = [5, 60, 300]; // 5秒、1分、5分
let currentPaddingIndex = 0;
let zoomPadding = zoomPaddingLevels[currentPaddingIndex];

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

// カテゴリ設定
const defaultCategories = ['面白い', '感動', '驚き', '癒し', '学び', 'その他'];
let availableCategories = [...defaultCategories];

/**
 * 初期化処理
 */
function initialize() {
  // カテゴリをlocalStorageから読み込み
  loadCategories();
  
  // カテゴリボタンを生成
  renderCategoryButtons();
}

/**
 * カテゴリをlocalStorageから読み込み
 */
function loadCategories() {
  try {
    const saved = localStorage.getItem('availableCategories');
    if (saved) {
      availableCategories = JSON.parse(saved);
    }
  } catch (error) {
    console.error('カテゴリの読み込みエラー:', error);
    availableCategories = [...defaultCategories];
  }
}

/**
 * カテゴリをlocalStorageに保存
 */
function saveCategories() {
  try {
    localStorage.setItem('availableCategories', JSON.stringify(availableCategories));
  } catch (error) {
    console.error('カテゴリの保存エラー:', error);
  }
}

/**
 * カテゴリボタンを動的生成
 */
function renderCategoryButtons() {
  categoryButtons.innerHTML = '';
  
  availableCategories.forEach(category => {
    const button = document.createElement('button');
    button.className = 'btn-category';
    button.dataset.category = category;
    button.textContent = category;
    
    // 現在選択されているカテゴリならアクティブにする
    if (metadata.categories.includes(category)) {
      button.classList.add('active');
    }
    
    categoryButtons.appendChild(button);
  });
}

/**
 * タブ切り替え機能
 */
function switchTab(tabName) {
  // 全てのタブボタンとコンテンツの active クラスを削除
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // 選択されたタブをアクティブに
  const selectedButton = document.querySelector(`.tab-button[data-tab="${tabName}"]`);
  const selectedContent = document.getElementById(`${tabName}Tab`);
  
  if (selectedButton) selectedButton.classList.add('active');
  if (selectedContent) selectedContent.classList.add('active');
}

// タブボタンのイベントリスナーを設定
document.querySelectorAll('.tab-button').forEach(button => {
  button.addEventListener('click', () => {
    const tabName = button.dataset.tab;
    switchTab(tabName);
  });
});

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

  // downloadedAt（メタデータ）またはファイル更新日時でソート（新しい順）
  const sortedFiles = [...files].sort((a, b) => {
    const dateA = a.metadata?.downloadedAt 
      ? new Date(a.metadata.downloadedAt) 
      : new Date(a.stats.mtime);
    const dateB = b.metadata?.downloadedAt 
      ? new Date(b.metadata.downloadedAt) 
      : new Date(b.stats.mtime);
    return dateB - dateA; // 降順（新しいものが上）
  });

  downloadedVideos.innerHTML = sortedFiles.map((file, index) => {
    const metadata = file.metadata;
    
    if (metadata) {
      // メタデータがある場合：サムネイル、タイトル、詳細情報を表示
      return `
        <div class="video-item-card">
          <img src="${escapeHtml(metadata.thumbnail)}" alt="${escapeHtml(metadata.title)}" class="video-item-thumbnail" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22113%22%3E%3Crect fill=%22%23ddd%22 width=%22200%22 height=%22113%22/%3E%3C/svg%3E'">
          <div class="video-item-content">
            <div class="video-item-title">${escapeHtml(metadata.title)}</div>
            <div class="video-item-metadata">
              <div class="metadata-row">
                <span class="metadata-label">チャンネル:</span>
                <span>${escapeHtml(metadata.uploader)}</span>
              </div>
              <div class="metadata-row">
                <span class="metadata-label">再生時間:</span>
                <span>${formatDuration(metadata.duration)}</span>
              </div>
              <div class="metadata-row">
                <span class="metadata-label">視聴回数:</span>
                <span>${formatNumber(metadata.viewCount)}</span>
              </div>
              <div class="metadata-row">
                <span class="metadata-label">ダウンロード日時:</span>
                <span>${new Date(metadata.downloadedAt).toLocaleString('ja-JP')}</span>
              </div>
              <div class="metadata-row">
                <span class="metadata-label">ファイルサイズ:</span>
                <span>${formatFileSize(file.stats.size)}</span>
              </div>
            </div>
            <button class="btn btn-primary video-item-play-btn" onclick="playVideo(${index})">
              再生
            </button>
          </div>
        </div>
      `;
    } else {
      // メタデータがない場合：従来の表示
      return `
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
      `;
    }
  }).join('');
  
  // ファイル情報を保存（再生時に使用）- ソート済みのリストを保存
  window.downloadedFilesList = sortedFiles;
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
    videoPlayer.style.display = 'block';
    document.getElementById('editTabMessage').style.display = 'none';
    
    // 編集タブに自動切り替え
    switchTab('edit');
    
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
      
      // Video IDから自動生成
      autoGenerateFileName();
      autoGenerateClipUrl();
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
  
  // クリップURLを自動更新
  autoGenerateClipUrl();
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
  const width = waveformContainer.clientWidth;
  
  // トリミング範囲の前後に余白を含めた表示範囲を計算
  const displayStartTime = Math.max(0, startTime - zoomPadding);
  const displayEndTime = Math.min(duration, endTime + zoomPadding);
  const displayDuration = displayEndTime - displayStartTime;
  const zoomLevel = width / displayDuration;
  
  try {
    wavesurfer.zoom(zoomLevel);
    wavesurfer.setScrollTime(displayStartTime);
  } catch (error) {
    console.error('ズームエラー:', error);
  }
}

// ズームパディングを切り替える
function cycleZoomPadding() {
  if (!wavesurfer || !videoPlayer.duration) {
    showToast('動画と波形を読み込んでください', 'warning');
    return;
  }
  
  // 次のパディングレベルに切り替え
  currentPaddingIndex = (currentPaddingIndex + 1) % zoomPaddingLevels.length;
  zoomPadding = zoomPaddingLevels[currentPaddingIndex];
  
  // パディング値を表示用にフォーマット
  let paddingText;
  if (zoomPadding < 60) {
    paddingText = `${zoomPadding}秒`;
  } else if (zoomPadding < 3600) {
    paddingText = `${zoomPadding / 60}分`;
  } else {
    paddingText = `${zoomPadding / 3600}時間`;
  }
  
  // ズームを更新
  updateWaveformZoom();
  
  showToast(`ズームパディング: ${paddingText}`, 'info');
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
  
  // ループ再生をONにして範囲の頭から再生
  trimState.isLooping = true;
  loopCheckbox.checked = true;
  videoPlayer.currentTime = trimState.startTime;
  videoPlayer.play().catch(e => console.error('再生エラー:', e));
});

// 終了位置スライダーの変更
endSlider.addEventListener('input', () => {
  // 終了位置が開始位置より前にならないようにする
  if (parseFloat(endSlider.value) <= parseFloat(startSlider.value)) {
    endSlider.value = Math.min(100, parseFloat(startSlider.value) + 0.01);
  }
  updateTrimDisplay();
  
  // ループ再生をONにして範囲の最後の2秒前から再生
  trimState.isLooping = true;
  loopCheckbox.checked = true;
  const playbackTime = Math.max(trimState.endTime - 2, trimState.startTime);
  videoPlayer.currentTime = playbackTime;
  videoPlayer.play().catch(e => console.error('再生エラー:', e));
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
    
    // ループ再生をONにして範囲の頭から再生
    trimState.isLooping = true;
    loopCheckbox.checked = true;
    videoPlayer.currentTime = trimState.startTime;
    videoPlayer.play().catch(e => console.error('再生エラー:', e));
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
    
    // ループ再生をONにして範囲の最後の2秒前から再生
    trimState.isLooping = true;
    loopCheckbox.checked = true;
    const playbackTime = Math.max(trimState.endTime - 2, trimState.startTime);
    videoPlayer.currentTime = playbackTime;
    videoPlayer.play().catch(e => console.error('再生エラー:', e));
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
  
  // ループ再生をONにして開始位置から再生
  trimState.isLooping = true;
  loopCheckbox.checked = true;
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
  
  // ループ再生をONにして終了位置の2秒前から再生
  trimState.isLooping = true;
  loopCheckbox.checked = true;
  const playbackTime = Math.max(trimState.endTime - 2, trimState.startTime);
  videoPlayer.currentTime = playbackTime;
  videoPlayer.play().catch(e => console.error('再生エラー:', e));
}

// 動画の再生位置を監視してトリミング範囲でループ
setInterval(() => {
  if (trimState.isLooping && videoPlayer.currentTime >= trimState.endTime) {
    videoPlayer.currentTime = trimState.startTime;
  }
}, 1000 / 60); // 60fpsでチェック

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
    autoScroll: false,
    interact: true
  });

  // Regionsプラグインを初期化
  wavesurferRegions = wavesurfer.registerPlugin(WaveSurfer.Regions.create());

  // Minimapプラグインを初期化
  wavesurfer.registerPlugin(WaveSurfer.Minimap.create({
    height: 30,
    waveColor: '#999',
    progressColor: '#667eea',
    cursorColor: '#e53e3e',
    barWidth: 1,
    barGap: 1
  }));

  // 既存のトリミング範囲でregionを作成
  if (videoPlayer.duration) {
    updateWaveformRegion();
  }

  // Region更新タイマー
  let regionUpdateTimer = null;
  let regionUpdateType = null; // 'start' or 'end' - どちらのハンドルが動いたか

  // Region更新イベント - ドラッグでトリミング範囲を変更
  wavesurferRegions.on('region-updated', (region) => {
    if (region.id === 'trim-region') {
      const duration = videoPlayer.duration;
      const oldStartTime = trimState.startTime;
      const oldEndTime = trimState.endTime;
      
      trimState.startTime = region.start;
      trimState.endTime = region.end;
      trimState.duration = region.end - region.start;

      // どちらのハンドルが動いたかを判定
      if (Math.abs(region.start - oldStartTime) > 0.01) {
        regionUpdateType = 'start';
      } else if (Math.abs(region.end - oldEndTime) > 0.01) {
        regionUpdateType = 'end';
      }

      // スライダーを更新
      startSlider.value = (region.start / duration) * 100;
      endSlider.value = (region.end / duration) * 100;

      // 表示を更新
      startTimeDisplay.textContent = formatTimeWithMillis(region.start);
      endTimeDisplay.textContent = formatTimeWithMillis(region.end);
      durationDisplay.textContent = formatTimeWithMillis(region.end - region.start);
      updateRangeHighlight();
      
      // 既存のタイマーをクリア
      if (regionUpdateTimer) {
        clearTimeout(regionUpdateTimer);
      }
      
      // ドラッグ終了後に再生（300ms後）
      regionUpdateTimer = setTimeout(() => {
        // ループONにして再生
        trimState.isLooping = true;
        loopCheckbox.checked = true;
        
        if (regionUpdateType === 'start') {
          // 開始位置を動かした場合：頭から再生
          videoPlayer.currentTime = trimState.startTime;
        } else if (regionUpdateType === 'end') {
          // 終了位置を動かした場合：2秒前から再生
          const playbackTime = Math.max(trimState.endTime - 2, trimState.startTime);
          videoPlayer.currentTime = playbackTime;
        }
        
        videoPlayer.play().catch(e => console.error('再生エラー:', e));
        regionUpdateType = null;
      }, 300);
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
    // ズームをリセット
    const duration = videoPlayer.duration;
    const width = waveformContainer.clientWidth;
    const zoomLevel = width / duration;
    wavesurfer.zoom(zoomLevel);
    wavesurfer.setScrollTime(0);
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

// クリップURLの自動生成関数
function autoGenerateClipUrl() {
  const videoId = videoIdInput.value.trim();
  
  if (!videoId || !videoPlayer.duration) {
    return;
  }
  
  // YouTube URL with timestamp
  const startSec = Math.floor(trimState.startTime);
  const clipUrl = `https://youtube.com/watch?v=${videoId}&t=${startSec}s`;
  
  clipUrlInput.value = clipUrl;
  metadata.clipUrl = clipUrl;
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

// ルビの自動生成（カタカナ→ひらがな変換）
generateRubyBtn.addEventListener('click', () => {
  const serif = serifInput.value.trim();
  
  if (!serif) {
    showToast('セリフを入力してください', 'warning');
    return;
  }
  
  // カタカナをひらがなに変換
  const ruby = katakanaToHiragana(serif);
  rubyInput.value = ruby;
  metadata.ruby = ruby;
  
  showToast('ルビを自動生成しました', 'success');
});

/**
 * カタカナをひらがなに変換
 * @param {string} str - 変換する文字列
 * @returns {string} ひらがなに変換された文字列
 */
function katakanaToHiragana(str) {
  return str.replace(/[\u30A1-\u30F6]/g, (match) => {
    const charCode = match.charCodeAt(0) - 0x60;
    return String.fromCharCode(charCode);
  });
}

// クリップURLの自動生成ボタン（互換性のため残す）
generateClipUrlBtn.addEventListener('click', () => {
  autoGenerateClipUrl();
  if (!metadata.clipUrl) {
    showToast('Video IDを入力し、動画を読み込んでください', 'warning');
  }
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
  autoGenerateClipUrl();
});
fileNameInput.addEventListener('input', (e) => metadata.fileName = e.target.value.trim());
serifInput.addEventListener('input', (e) => metadata.serif = e.target.value.trim());
rubyInput.addEventListener('input', (e) => metadata.ruby = e.target.value.trim());
clipUrlInput.addEventListener('input', (e) => metadata.clipUrl = e.target.value.trim());
memoInput.addEventListener('input', (e) => metadata.memo = e.target.value.trim());

// 初期化
updateSelectedCategories();

/**
 * ============================================
 * キーボードショートカット機能
 * ============================================
 */

// デフォルトのショートカット設定
const defaultShortcuts = {
  playPause: { key: 'Space', ctrl: false, shift: false, alt: false, action: '再生/一時停止', description: '動画の再生と一時停止を切り替え' },
  frameBack1: { key: 'ArrowLeft', ctrl: false, shift: false, alt: false, action: '1フレーム戻る', description: '再生位置を1フレーム前に移動' },
  frameForward1: { key: 'ArrowRight', ctrl: false, shift: false, alt: false, action: '1フレーム進む', description: '再生位置を1フレーム後に移動' },
  frameBack15: { key: 'ArrowLeft', ctrl: false, shift: true, alt: false, action: '15フレーム戻る', description: '再生位置を15フレーム前に移動' },
  frameForward15: { key: 'ArrowRight', ctrl: false, shift: true, alt: false, action: '15フレーム進む', description: '再生位置を15フレーム後に移動' },
  setStart: { key: 'BracketLeft', ctrl: false, shift: false, alt: false, action: '開始位置を設定', description: '現在の再生位置をトリミング開始位置に設定' },
  setEnd: { key: 'BracketRight', ctrl: false, shift: false, alt: false, action: '終了位置を設定', description: '現在の再生位置をトリミング終了位置に設定' },
  toggleLoop: { key: 'KeyL', ctrl: false, shift: false, alt: false, action: 'ループ切り替え', description: 'トリミング範囲のループ再生を切り替え' },
  toggleWaveform: { key: 'KeyW', ctrl: false, shift: false, alt: false, action: '波形表示切り替え', description: '音声波形の表示/非表示を切り替え' },
  zoomCycle: { key: 'KeyX', ctrl: false, shift: false, alt: false, action: 'ズーム倍率切り替え', description: 'トリミング範囲のパディング（5秒/1分/5分）を切り替え' },
  saveMetadata: { key: 'KeyS', ctrl: true, shift: false, alt: false, action: 'メタデータ保存', description: 'メタデータをJSON形式で保存' },
  exportVideo: { key: 'KeyE', ctrl: true, shift: false, alt: false, action: '動画エクスポート', description: 'トリミング済み動画をMP4形式で書き出し' },
  openSettings: { key: 'KeyK', ctrl: false, shift: false, alt: false, action: 'ショートカット設定', description: 'このショートカット設定画面を開く' },
};

// 現在のショートカット設定
let shortcuts = { ...defaultShortcuts };

// ショートカット編集中のアクションID
let editingShortcutId = null;

// simple-keyboardインスタンス
let simpleKeyboard = null;

// キーコードからキー名への変換マップ
const keyCodeToKeyName = {
  'Space': 'スペース',
  'ArrowLeft': '←',
  'ArrowRight': '→',
  'ArrowUp': '↑',
  'ArrowDown': '↓',
  'BracketLeft': '[',
  'BracketRight': ']',
  'Enter': 'Enter',
  'Escape': 'Esc',
  'Backspace': 'Backspace',
  'Tab': 'Tab',
};

// Keyプレフィックスを持つキーの変換
function formatKeyName(key) {
  if (keyCodeToKeyName[key]) {
    return keyCodeToKeyName[key];
  }
  if (key.startsWith('Key')) {
    return key.replace('Key', '');
  }
  if (key.startsWith('Digit')) {
    return key.replace('Digit', '');
  }
  return key;
}

// ショートカット文字列の生成
function getShortcutString(shortcut) {
  const parts = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.shift) parts.push('Shift');
  if (shortcut.alt) parts.push('Alt');
  parts.push(formatKeyName(shortcut.key));
  return parts.join(' + ');
}

// ショートカット設定の読み込み
function loadShortcuts() {
  try {
    const saved = localStorage.getItem('keyboardShortcuts');
    if (saved) {
      const parsed = JSON.parse(saved);
      shortcuts = { ...defaultShortcuts, ...parsed };
    }
  } catch (error) {
    console.error('ショートカット設定の読み込みに失敗:', error);
    shortcuts = { ...defaultShortcuts };
  }
}

// ショートカット設定の保存
function saveShortcutsToStorage() {
  try {
    localStorage.setItem('keyboardShortcuts', JSON.stringify(shortcuts));
    showToast('ショートカット設定を保存しました', 'success');
  } catch (error) {
    console.error('ショートカット設定の保存に失敗:', error);
    showToast('ショートカット設定の保存に失敗しました', 'error');
  }
}

// ショートカットのリセット
function resetShortcuts() {
  if (!confirm('ショートカット設定をデフォルトに戻しますか？')) {
    return;
  }
  shortcuts = { ...defaultShortcuts };
  saveShortcutsToStorage();
  renderShortcutList();
  showToast('ショートカット設定をデフォルトに戻しました', 'success');
}

// ショートカット一覧の描画
function renderShortcutList() {
  const shortcutList = document.getElementById('shortcutList');
  shortcutList.innerHTML = '';
  
  Object.entries(shortcuts).forEach(([id, shortcut]) => {
    const item = document.createElement('div');
    item.className = 'shortcut-item';
    if (editingShortcutId === id) {
      item.classList.add('editing');
    }
    
    item.innerHTML = `
      <div class="shortcut-item-left">
        <div class="shortcut-action">${escapeHtml(shortcut.action)}</div>
        <div class="shortcut-description">${escapeHtml(shortcut.description)}</div>
      </div>
      <div class="shortcut-item-right">
        <div class="shortcut-key">${escapeHtml(getShortcutString(shortcut))}</div>
        <button class="btn-edit-shortcut" data-id="${id}">編集</button>
      </div>
    `;
    
    shortcutList.appendChild(item);
  });
  
  // 編集ボタンにイベントリスナーを追加
  shortcutList.querySelectorAll('.btn-edit-shortcut').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      editShortcut(id);
    });
  });
}

// ショートカット編集開始
function editShortcut(id) {
  editingShortcutId = id;
  renderShortcutList();
  
  const editingTitle = document.getElementById('editingShortcutTitle');
  editingTitle.style.display = 'block';
  editingTitle.textContent = `「${shortcuts[id].action}」のキーを押してください`;
  
  showToast('新しいキーを押してください（Escでキャンセル）', 'info');
}

// ショートカット編集終了
function finishEditingShortcut() {
  editingShortcutId = null;
  renderShortcutList();
  
  const editingTitle = document.getElementById('editingShortcutTitle');
  editingTitle.style.display = 'none';
}

// モーダル内のキーボードイベント処理
function handleModalKeyDown(e) {
  if (!editingShortcutId) return;
  
  // Escapeで編集キャンセル
  if (e.code === 'Escape') {
    finishEditingShortcut();
    showToast('編集をキャンセルしました', 'info');
    return;
  }
  
  e.preventDefault();
  e.stopPropagation();
  
  // 修飾キーのみの場合は無視
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
    return;
  }
  
  // 現在編集中のショートカット情報を保存
  const currentShortcut = shortcuts[editingShortcutId];
  if (!currentShortcut) {
    console.error('Invalid shortcut ID:', editingShortcutId);
    finishEditingShortcut();
    return;
  }
  
  // 新しいショートカットを設定
  const newShortcut = {
    ...currentShortcut,
    key: e.code,
    ctrl: e.ctrlKey || e.metaKey,
    shift: e.shiftKey,
    alt: e.altKey,
  };
  
  shortcuts[editingShortcutId] = newShortcut;
  
  // simple-keyboardのキーをハイライト
  highlightKey(e.code);
  
  // 編集終了前にメッセージを作成
  const message = `「${currentShortcut.action}」を ${getShortcutString(newShortcut)} に設定しました`;
  
  finishEditingShortcut();
  showToast(message, 'success');
}

// simple-keyboardのキーをハイライト
function highlightKey(code) {
  if (!simpleKeyboard) return;
  
  // キーコードから表示名への変換
  let buttonName = code;
  if (code.startsWith('Key')) {
    buttonName = code.replace('Key', '').toLowerCase();
  } else if (code.startsWith('Digit')) {
    buttonName = code.replace('Digit', '');
  } else if (code === 'Space') {
    buttonName = '{space}';
  } else if (code === 'Enter') {
    buttonName = '{enter}';
  } else if (code === 'Backspace') {
    buttonName = '{bksp}';
  } else if (code === 'Tab') {
    buttonName = '{tab}';
  } else if (code === 'ArrowLeft') {
    buttonName = '{arrowleft}';
  } else if (code === 'ArrowRight') {
    buttonName = '{arrowright}';
  } else if (code === 'ArrowUp') {
    buttonName = '{arrowup}';
  } else if (code === 'ArrowDown') {
    buttonName = '{arrowdown}';
  } else if (code === 'BracketLeft') {
    buttonName = '[';
  } else if (code === 'BracketRight') {
    buttonName = ']';
  }
  
  // 一時的にキーをハイライト
  const buttons = document.querySelectorAll('.hg-button');
  buttons.forEach(btn => btn.classList.remove('hg-activeButton'));
  
  setTimeout(() => {
    const targetButton = document.querySelector(`[data-skbtn="${buttonName}"]`);
    if (targetButton) {
      targetButton.classList.add('hg-activeButton');
      setTimeout(() => {
        targetButton.classList.remove('hg-activeButton');
      }, 500);
    }
  }, 50);
}

// グローバルキーボードイベント処理
function handleGlobalKeyDown(e) {
  // 編集中の場合は処理しない（モーダル内のイベントハンドラーに任せる）
  if (editingShortcutId) {
    return;
  }
  
  // モーダルが開いている場合は処理しない
  const modal = document.getElementById('shortcutModal');
  if (modal.classList.contains('active')) {
    return;
  }
  
  // 入力フィールドにフォーカスがある場合は処理しない
  const activeElement = document.activeElement;
  if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
    return;
  }
  
  // 動画が読み込まれていない場合は一部の機能のみ有効
  const videoLoaded = currentVideoFile !== null;
  
  // ショートカット処理
  Object.entries(shortcuts).forEach(([id, shortcut]) => {
    if (
      e.code === shortcut.key &&
      (e.ctrlKey || e.metaKey) === shortcut.ctrl &&
      e.shiftKey === shortcut.shift &&
      e.altKey === shortcut.alt
    ) {
      e.preventDefault();
      e.stopPropagation();
      
      // アクションを実行
      executeShortcutAction(id, videoLoaded);
    }
  });
}

// ショートカットアクション実行
function executeShortcutAction(actionId, videoLoaded) {
  switch (actionId) {
    case 'playPause':
      if (!videoLoaded) return;
      if (videoPlayer.paused) {
        videoPlayer.play();
      } else {
        videoPlayer.pause();
      }
      break;
      
    case 'frameBack1':
      if (!videoLoaded) return;
      adjustTime(-1);
      break;
      
    case 'frameForward1':
      if (!videoLoaded) return;
      adjustTime(1);
      break;
      
    case 'frameBack15':
      if (!videoLoaded) return;
      adjustTime(-15);
      break;
      
    case 'frameForward15':
      if (!videoLoaded) return;
      adjustTime(15);
      break;
      
    case 'setStart':
      if (!videoLoaded) return;
      setStartBtn.click();
      break;
      
    case 'setEnd':
      if (!videoLoaded) return;
      setEndBtn.click();
      break;
      
    case 'toggleLoop':
      if (!videoLoaded) return;
      loopCheckbox.checked = !loopCheckbox.checked;
      trimState.isLooping = loopCheckbox.checked;
      showToast(
        `ループ再生を${trimState.isLooping ? 'オン' : 'オフ'}にしました`,
        'info'
      );
      break;
      
    case 'toggleWaveform':
      if (!videoLoaded) return;
      toggleWaveformBtn.click();
      break;
      
    case 'zoomCycle':
      if (!videoLoaded) return;
      cycleZoomPadding();
      break;
      
    case 'saveMetadata':
      if (!videoLoaded) return;
      saveMetadataBtn.click();
      break;
      
    case 'exportVideo':
      if (!videoLoaded) return;
      exportVideoBtn.click();
      break;
      
    case 'openSettings':
      openShortcutModal();
      break;
  }
}

// フレーム単位の時間調整（ショートカット用）
function adjustTime(frames) {
  const frameTime = 1 / 30; // 30fps想定
  const newTime = Math.max(0, Math.min(videoPlayer.duration, videoPlayer.currentTime + frames * frameTime));
  videoPlayer.currentTime = newTime;
  
  // 波形の再生位置も更新
  if (wavesurfer && waveformVisible) {
    wavesurfer.setTime(newTime);
  }
}

// ショートカット設定モーダルを開く
function openShortcutModal() {
  const modal = document.getElementById('shortcutModal');
  modal.classList.add('active');
  
  // simple-keyboardを初期化（まだの場合）
  if (!simpleKeyboard) {
    const Keyboard = window.SimpleKeyboard.default;
    simpleKeyboard = new Keyboard({
      onChange: () => {},
      onKeyPress: () => {},
      layout: {
        default: [
          '` 1 2 3 4 5 6 7 8 9 0 - = {bksp}',
          '{tab} q w e r t y u i o p [ ]',
          'a s d f g h j k l',
          '{shift} z x c v b n m {shift}',
          '{space}'
        ]
      },
      display: {
        '{bksp}': 'Backspace',
        '{tab}': 'Tab',
        '{shift}': 'Shift',
        '{space}': 'Space',
      }
    });
  }
  
  renderShortcutList();
  editingShortcutId = null;
  document.getElementById('editingShortcutTitle').style.display = 'none';
}

// ショートカット設定モーダルを閉じる
function closeShortcutModal() {
  const modal = document.getElementById('shortcutModal');
  modal.classList.remove('active');
  editingShortcutId = null;
}

/**
 * カテゴリ設定モーダル管理
 */

// カテゴリ設定モーダルを開く
function openCategoryModal() {
  const modal = document.getElementById('categoryModal');
  modal.classList.add('active');
  renderCategoryList();
}

// カテゴリ設定モーダルを閉じる
function closeCategoryModal() {
  const modal = document.getElementById('categoryModal');
  modal.classList.remove('active');
  document.getElementById('newCategoryInput').value = '';
}

// カテゴリリストを表示
function renderCategoryList() {
  const container = document.getElementById('categoryListManager');
  
  if (availableCategories.length === 0) {
    container.innerHTML = '<p style="color: #a0aec0; text-align: center;">カテゴリがありません</p>';
    return;
  }
  
  container.innerHTML = availableCategories.map((category, index) => `
    <div class="category-item">
      <span class="category-item-name">${escapeHtml(category)}</span>
      <div class="category-item-actions">
        <button class="btn-edit-category" data-index="${index}" data-category="${escapeHtml(category)}">編集</button>
        <button class="btn-delete-category" data-index="${index}">削除</button>
      </div>
    </div>
  `).join('');
  
  // 編集ボタンのイベント
  container.querySelectorAll('.btn-edit-category').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      const oldCategory = btn.dataset.category;
      const newCategory = prompt('カテゴリ名を変更してください:', oldCategory);
      
      if (newCategory && newCategory.trim() !== '') {
        const trimmedCategory = newCategory.trim();
        
        // 重複チェック
        if (availableCategories.includes(trimmedCategory) && trimmedCategory !== oldCategory) {
          showToast('そのカテゴリは既に存在します', 'warning');
          return;
        }
        
        // カテゴリ名を更新
        availableCategories[index] = trimmedCategory;
        
        // メタデータ内のカテゴリも更新
        if (metadata.categories.includes(oldCategory)) {
          const categoryIndex = metadata.categories.indexOf(oldCategory);
          metadata.categories[categoryIndex] = trimmedCategory;
        }
        
        saveCategories();
        renderCategoryList();
        renderCategoryButtons();
        updateSelectedCategories();
        showToast('カテゴリを変更しました', 'success');
      }
    });
  });
  
  // 削除ボタンのイベント
  container.querySelectorAll('.btn-delete-category').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      const category = availableCategories[index];
      
      if (confirm(`「${category}」を削除しますか？`)) {
        // カテゴリを削除
        availableCategories.splice(index, 1);
        
        // メタデータから削除
        metadata.categories = metadata.categories.filter(c => c !== category);
        
        saveCategories();
        renderCategoryList();
        renderCategoryButtons();
        updateSelectedCategories();
        showToast('カテゴリを削除しました', 'success');
      }
    });
  });
}

// カテゴリを追加
function addCategory() {
  const input = document.getElementById('newCategoryInput');
  const category = input.value.trim();
  
  if (!category) {
    showToast('カテゴリ名を入力してください', 'warning');
    return;
  }
  
  // 重複チェック
  if (availableCategories.includes(category)) {
    showToast('そのカテゴリは既に存在します', 'warning');
    return;
  }
  
  // カテゴリを追加
  availableCategories.push(category);
  saveCategories();
  renderCategoryList();
  renderCategoryButtons();
  
  input.value = '';
  showToast('カテゴリを追加しました', 'success');
}

// カテゴリをデフォルトにリセット
function resetCategories() {
  if (confirm('カテゴリをデフォルトに戻しますか？\n現在のカテゴリ設定は失われます。')) {
    availableCategories = [...defaultCategories];
    
    // 選択中のカテゴリから存在しないものを削除
    metadata.categories = metadata.categories.filter(c => availableCategories.includes(c));
    
    saveCategories();
    renderCategoryList();
    renderCategoryButtons();
    updateSelectedCategories();
    showToast('カテゴリをデフォルトに戻しました', 'success');
  }
}

// イベントリスナー設定

// カテゴリ設定モーダル関連
document.getElementById('categorySettingsBtn').addEventListener('click', openCategoryModal);
document.getElementById('closeCategoryModal').addEventListener('click', closeCategoryModal);
document.getElementById('closeCategoryModalBtn').addEventListener('click', closeCategoryModal);
document.getElementById('addCategoryBtn').addEventListener('click', addCategory);
document.getElementById('resetCategoriesBtn').addEventListener('click', resetCategories);

// Enterキーでカテゴリ追加
document.getElementById('newCategoryInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addCategory();
  }
});

// モーダル外クリックで閉じる
document.getElementById('categoryModal').addEventListener('click', (e) => {
  if (e.target.id === 'categoryModal') {
    closeCategoryModal();
  }
});

// ショートカット設定モーダル関連
document.getElementById('shortcutSettingsBtn').addEventListener('click', openShortcutModal);
document.getElementById('closeShortcutModal').addEventListener('click', closeShortcutModal);
document.getElementById('resetShortcutsBtn').addEventListener('click', resetShortcuts);
document.getElementById('saveShortcutsBtn').addEventListener('click', () => {
  saveShortcutsToStorage();
  closeShortcutModal();
});

// モーダル外クリックで閉じる
document.getElementById('shortcutModal').addEventListener('click', (e) => {
  if (e.target.id === 'shortcutModal') {
    closeShortcutModal();
  }
});

// モーダル内のキーボードイベント（キャプチャフェーズで先に処理）
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('shortcutModal');
  if (modal.classList.contains('active') && editingShortcutId) {
    handleModalKeyDown(e);
  }
}, true);

// グローバルキーボードイベント
document.addEventListener('keydown', handleGlobalKeyDown);

// 初期化
initialize();
loadShortcuts();

