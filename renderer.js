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

// WaveSurferインスタンス
let wavesurfer = null;
let waveformVisible = false;

// トリミング状態
let trimState = {
  startTime: 0,
  endTime: 0,
  duration: 0,
  isLooping: false
};

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
}

// 範囲ハイライトの表示を更新
function updateRangeHighlight() {
  const startPercent = parseFloat(startSlider.value);
  const endPercent = parseFloat(endSlider.value);
  
  rangeHighlight.style.left = `${startPercent}%`;
  rangeHighlight.style.width = `${endPercent - startPercent}%`;
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
    alert('開始位置は終了位置より前に設定してください');
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
    alert('終了位置は開始位置より後に設定してください');
  }
});

// トリミング範囲を再生
playTrimmedBtn.addEventListener('click', () => {
  if (!videoPlayer.duration) return;
  
  videoPlayer.currentTime = trimState.startTime;
  videoPlayer.play();
  trimState.isLooping = true;
});

// トリミング設定をリセット
resetTrimBtn.addEventListener('click', () => {
  if (!videoPlayer.duration) return;
  
  startSlider.value = 0;
  endSlider.value = 100;
  trimState.isLooping = false;
  updateTrimDisplay();
});

// 動画の再生位置を監視してトリミング範囲でループ
videoPlayer.addEventListener('timeupdate', () => {
  if (trimState.isLooping && videoPlayer.currentTime >= trimState.endTime) {
    videoPlayer.currentTime = trimState.startTime;
  }
});

// 動画が一時停止したらループを停止
videoPlayer.addEventListener('pause', () => {
  trimState.isLooping = false;
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

  // 波形がロードされたら
  wavesurfer.on('ready', () => {
    waveformLoading.style.display = 'none';
    console.log('WaveSurfer ready');
  });

  // 波形クリックで再生位置を変更して再生
  wavesurfer.on('click', (relativeX) => {
    // relativeXは0-1の範囲の相対位置
    const newTime = relativeX * videoPlayer.duration;
    console.log('Waveform clicked at:', newTime);
    videoPlayer.currentTime = newTime;
    if (videoPlayer.paused) {
      videoPlayer.play().catch(e => console.error('再生エラー:', e));
    }
  });
  
  // interactionイベント
  wavesurfer.on('interaction', (newTime) => {
    console.log('Waveform interaction at:', newTime);
    videoPlayer.currentTime = newTime;
    if (videoPlayer.paused) {
      videoPlayer.play().catch(e => console.error('再生エラー:', e));
    }
  });

  // エラーハンドリング
  wavesurfer.on('error', (error) => {
    console.error('WaveSurfer error:', error);
    waveformLoading.style.display = 'none';
    waveformLoading.textContent = '波形の生成に失敗しました';
  });

  return wavesurfer;
}

// 波形上のトリミング範囲を更新（将来の拡張用）
function updateWaveformRegion() {
  // Regionsプラグインを使用する場合はここで実装
  // 現時点では未実装
}

// 波形表示を切り替え
function toggleWaveform() {
  if (!videoPlayer.src) {
    alert('動画を選択してください');
    return;
  }

  waveformVisible = !waveformVisible;

  if (waveformVisible) {
    // 波形を表示
    waveformContainer.style.display = 'block';
    waveformLoading.style.display = 'block';
    waveformLoading.textContent = '波形を生成中...';
    toggleWaveformBtn.textContent = '波形を非表示';

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
    if (wavesurfer) {
      wavesurfer.destroy();
      wavesurfer = null;
    }
  }
}

// 正規化チェックボックスの変更
normalizeCheckbox.addEventListener('change', () => {
  if (wavesurfer && waveformVisible) {
    // 波形を再生成
    toggleWaveform().then(() => {
      if (waveformVisible) {
        setTimeout(() => toggleWaveform(), 100);
      }
    });
  }
});

// 波形表示ボタンのクリック
toggleWaveformBtn.addEventListener('click', toggleWaveform);
