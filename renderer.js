/**
 * レンダラープロセス - オーケストレーター
 *
 * このファイルはグローバル状態の宣言と、動画検索/ダウンロード/再生、
 * カテゴリ管理、初期化、トリミング調整などのコアロジックを保持する。
 *
 * 機能別モジュールは src/renderer/ 以下に分割されている:
 *   utils.js         — 純粋ユーティリティ（escapeHtml, formatXxx, showToast 等）
 *   dom-elements.js  — DOM 要素取得（const videoPlayer = getElementById(...) 等）
 *   storage.js       — InputHistory, TextPresets
 *   file-name.js     — FileNameTemplate, autoGenerateFileName, エクスポート, モーダル
 *   waveform.js      — WaveSurfer 波形表示
 *   clip-timeline.js — クリップタイムライン・再生ヘッドアニメーション
 *   comments.js      — コメント密度・盛り上がり検出
 *   shortcuts.js     — キーボードショートカット・フレーム微調整
 *   layout.js        — ColumnResizer（3列幅リサイザ）
 */

// ============================================================
// グローバル状態変数
// ============================================================

// 微調整フレーム設定
let fineTuneSettings = {
  smallFrames: 1,
  largeFrames: 15
};

// トリミング状態
let trimState = {
  startTime: 0,
  endTime: 0,
  duration: 0,
  isLooping: true
};

// クリップタイムラインの表示範囲（波形のズーム範囲と同期）
let clipViewState = {
  viewStartTime: 0,
  viewEndTime: 0
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

// ============================================================
// カテゴリ管理
// ============================================================

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

function saveCategories() {
  try {
    localStorage.setItem('availableCategories', JSON.stringify(availableCategories));
  } catch (error) {
    console.error('カテゴリの保存エラー:', error);
  }
}

function renderCategoryButtons() {
  categoryButtons.innerHTML = '';

  availableCategories.forEach(category => {
    const button = document.createElement('button');
    button.className = 'btn-category';
    button.dataset.category = category;
    button.textContent = category;

    if (metadata.categories.includes(category)) {
      button.classList.add('active');
    }

    categoryButtons.appendChild(button);
  });
}

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

  selectedCategoriesDiv.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.category;
      metadata.categories = metadata.categories.filter(c => c !== category);

      const categoryBtn = Array.from(categoryButtons.querySelectorAll('.btn-category'))
        .find(b => b.dataset.category === category);
      if (categoryBtn) {
        categoryBtn.classList.remove('active');
      }

      updateSelectedCategories();
    });
  });
}

// カテゴリボタンのクリックイベント
categoryButtons.addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-category')) {
    const category = e.target.dataset.category;

    e.target.classList.toggle('active');

    if (metadata.categories.includes(category)) {
      metadata.categories = metadata.categories.filter(c => c !== category);
    } else {
      metadata.categories.push(category);
    }

    updateSelectedCategories();
  }
});

// ============================================================
// カテゴリ設定モーダル
// ============================================================

function openCategoryModal() {
  document.getElementById('categoryModal').classList.add('active');
  renderCategoryList();
}

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.remove('active');
  document.getElementById('newCategoryInput').value = '';
}

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

  container.querySelectorAll('.btn-edit-category').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      const oldCategory = btn.dataset.category;
      const newCategory = prompt('カテゴリ名を変更してください:', oldCategory);

      if (newCategory && newCategory.trim() !== '') {
        const trimmedCategory = newCategory.trim();

        if (availableCategories.includes(trimmedCategory) && trimmedCategory !== oldCategory) {
          showToast('そのカテゴリは既に存在します', 'warning');
          return;
        }

        availableCategories[index] = trimmedCategory;

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

  container.querySelectorAll('.btn-delete-category').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      const category = availableCategories[index];

      if (confirm(`「${category}」を削除しますか？`)) {
        availableCategories.splice(index, 1);
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

function addCategory() {
  const input = document.getElementById('newCategoryInput');
  const category = input.value.trim();

  if (!category) {
    showToast('カテゴリ名を入力してください', 'warning');
    return;
  }

  if (availableCategories.includes(category)) {
    showToast('そのカテゴリは既に存在します', 'warning');
    return;
  }

  availableCategories.push(category);
  saveCategories();
  renderCategoryList();
  renderCategoryButtons();

  input.value = '';
  showToast('カテゴリを追加しました', 'success');
}

function resetCategories() {
  if (confirm('カテゴリをデフォルトに戻しますか？\n現在のカテゴリ設定は失われます。')) {
    availableCategories = [...defaultCategories];
    metadata.categories = metadata.categories.filter(c => availableCategories.includes(c));

    saveCategories();
    renderCategoryList();
    renderCategoryButtons();
    updateSelectedCategories();
    showToast('カテゴリをデフォルトに戻しました', 'success');
  }
}

// ============================================================
// 微調整フレーム設定
// ============================================================

function loadFineTuneSettings() {
  try {
    const saved = localStorage.getItem('fineTuneSettings');
    if (saved) {
      fineTuneSettings = JSON.parse(saved);
    }
  } catch (error) {
    console.error('微調整設定の読み込みエラー:', error);
    fineTuneSettings = { smallFrames: 1, largeFrames: 15 };
  }
}

function saveFineTuneSettings() {
  try {
    localStorage.setItem('fineTuneSettings', JSON.stringify(fineTuneSettings));
  } catch (error) {
    console.error('微調整設定の保存エラー:', error);
  }
}

function updateFineTuneButtonLabels() {
  const small = fineTuneSettings.smallFrames;
  const large = fineTuneSettings.largeFrames;

  document.getElementById('smallFramesValue').textContent = small;
  document.getElementById('largeFramesValue').textContent = large;

  const getKeyDisplay = (shortcutId, defaultKey) => {
    const shortcut = shortcuts[shortcutId];
    if (shortcut && shortcut.key) {
      return formatKeyName(shortcut.key);
    }
    return defaultKey;
  };

  const startMinusLargeBtn = document.getElementById('startMinusLargeFrameBtn');
  const startMinusSmallBtn = document.getElementById('startMinusSmallFrameBtn');
  const startPlusSmallBtn = document.getElementById('startPlusSmallFrameBtn');
  const startPlusLargeBtn = document.getElementById('startPlusLargeFrameBtn');

  const keyStartMinusLarge = getKeyDisplay('startMinusLarge', 'Q');
  const keyStartMinusSmall = getKeyDisplay('startMinusSmall', 'W');
  const keyStartPlusSmall = getKeyDisplay('startPlusSmall', 'E');
  const keyStartPlusLarge = getKeyDisplay('startPlusLarge', 'R');

  startMinusLargeBtn.innerHTML = `<kbd>${keyStartMinusLarge}</kbd> -${large}F`;
  startMinusLargeBtn.title = `-${large}フレーム (${keyStartMinusLarge})`;
  startMinusSmallBtn.innerHTML = `<kbd>${keyStartMinusSmall}</kbd> -${small}F`;
  startMinusSmallBtn.title = `-${small}フレーム (${keyStartMinusSmall})`;
  startPlusSmallBtn.innerHTML = `<kbd>${keyStartPlusSmall}</kbd> +${small}F`;
  startPlusSmallBtn.title = `+${small}フレーム (${keyStartPlusSmall})`;
  startPlusLargeBtn.innerHTML = `<kbd>${keyStartPlusLarge}</kbd> +${large}F`;
  startPlusLargeBtn.title = `+${large}フレーム (${keyStartPlusLarge})`;

  const endMinusLargeBtn = document.getElementById('endMinusLargeFrameBtn');
  const endMinusSmallBtn = document.getElementById('endMinusSmallFrameBtn');
  const endPlusSmallBtn = document.getElementById('endPlusSmallFrameBtn');
  const endPlusLargeBtn = document.getElementById('endPlusLargeFrameBtn');

  const keyEndMinusLarge = getKeyDisplay('endMinusLarge', 'A');
  const keyEndMinusSmall = getKeyDisplay('endMinusSmall', 'S');
  const keyEndPlusSmall = getKeyDisplay('endPlusSmall', 'D');
  const keyEndPlusLarge = getKeyDisplay('endPlusLarge', 'F');

  endMinusLargeBtn.innerHTML = `<kbd>${keyEndMinusLarge}</kbd> -${large}F`;
  endMinusLargeBtn.title = `-${large}フレーム (${keyEndMinusLarge})`;
  endMinusSmallBtn.innerHTML = `<kbd>${keyEndMinusSmall}</kbd> -${small}F`;
  endMinusSmallBtn.title = `-${small}フレーム (${keyEndMinusSmall})`;
  endPlusSmallBtn.innerHTML = `<kbd>${keyEndPlusSmall}</kbd> +${small}F`;
  endPlusSmallBtn.title = `+${small}フレーム (${keyEndPlusSmall})`;
  endPlusLargeBtn.innerHTML = `<kbd>${keyEndPlusLarge}</kbd> +${large}F`;
  endPlusLargeBtn.title = `+${large}フレーム (${keyEndPlusLarge})`;
}

// ============================================================
// タブ / ステータス
// ============================================================

function switchTab(tabName) {
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });

  const selectedButton = document.querySelector(`.tab-button[data-tab="${tabName}"]`);
  const selectedContent = document.getElementById(`${tabName}Tab`);

  if (selectedButton) selectedButton.classList.add('active');
  if (selectedContent) selectedContent.classList.add('active');
}

function showStatus(message, type) {
  downloadStatus.textContent = message;
  downloadStatus.className = 'status-message';
  if (type) {
    downloadStatus.classList.add(type);
  }
}

// タブボタンのイベントリスナー
document.querySelectorAll('.tab-button').forEach(button => {
  button.addEventListener('click', () => {
    switchTab(button.dataset.tab);
  });
});

// ============================================================
// YouTube 検索
// ============================================================

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
      InputHistory.save('searchQuery', query);
      refreshSearchHistoryChips();
      InputHistory.bind(searchQuery, 'searchQuery').refresh();
    } else {
      searchResults.innerHTML = `<p class="error">検索に失敗しました: ${result.error}</p>`;
    }
  } catch (error) {
    searchResults.innerHTML = `<p class="error">エラーが発生しました: ${error.message}</p>`;
  } finally {
    searchBtn.disabled = false;
  }
}

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

function setDownloadUrl(url) {
  downloadUrl.value = url;
  downloadUrl.scrollIntoView({ behavior: 'smooth' });
}

function openInBrowser(url) {
  require('electron').shell.openExternal(url);
}

// ============================================================
// ダウンロード
// ============================================================

async function downloadVideo() {
  const url = downloadUrl.value.trim();
  if (!url) {
    showStatus('YouTube URLを入力してください', 'error');
    return;
  }

  await openFormatSelectModal(url);
}

async function startDownloadWithFormat(url, formatId) {
  downloadBtn.disabled = true;
  downloadProgress.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = '0%';
  showStatus('', '');

  window.electronAPI.onDownloadProgress((progress) => {
    const percentage = Math.round(progress.percentage);
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${percentage}%`;
  });

  try {
    const options = formatId ? { format: formatId } : {};
    const result = await window.electronAPI.downloadVideo(url, options);

    if (result.success) {
      const filePath = result.data && typeof result.data.filePath === 'string'
        ? result.data.filePath
        : '';
      const hasTemplateLiteralPath = /%\([^)]+\)s/.test(filePath);

      if (!filePath || hasTemplateLiteralPath) {
        showStatus('ダウンロードは完了しましたが保存先の特定に失敗しました', 'warning');
      } else {
        showStatus(`ダウンロードが完了しました: ${filePath}`, 'success');
      }
      progressBar.style.width = '100%';
      progressText.textContent = '100%';

      InputHistory.save('downloadUrl', url);

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
    setTimeout(() => {
      downloadProgress.style.display = 'none';
    }, 3000);
  }
}

async function openFormatSelectModal(url) {
  const modal = document.getElementById('formatSelectModal');
  const loadingEl = document.getElementById('formatModalLoading');
  const errorEl = document.getElementById('formatModalError');
  const contentEl = document.getElementById('formatModalContent');

  modal.classList.add('active');
  loadingEl.style.display = 'block';
  errorEl.style.display = 'none';
  contentEl.style.display = 'none';

  try {
    const result = await window.electronAPI.getVideoInfo(url);
    if (!result.success) throw new Error(result.error);

    renderFormatModal(url, result.data);
    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
  } catch (error) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.textContent = `動画情報の取得に失敗しました: ${error.message}`;
    console.error('getVideoInfo error:', error);
  }
}

function closeFormatSelectModal() {
  document.getElementById('formatSelectModal').classList.remove('active');
}

function renderFormatModal(url, info) {
  const infoEl = document.getElementById('formatVideoInfo');
  const durationStr = formatDuration(info.duration);
  const viewStr = info.viewCount ? formatNumber(info.viewCount) + '回' : '不明';
  infoEl.innerHTML = `
    <img class="format-video-info__thumb" src="${escapeHtml(info.thumbnail || '')}" alt="" onerror="this.style.visibility='hidden'">
    <div class="format-video-info__meta">
      <div class="format-video-info__title">${escapeHtml(info.title || '')}</div>
      <div class="format-video-info__details">
        <span>${escapeHtml(info.uploader || '不明')}</span>
        <span>長さ: ${durationStr}</span>
        <span>視聴: ${viewStr}</span>
      </div>
    </div>
  `;

  const options = pickFormatOptions(info.formats || [], info.duration || 0);
  const listEl = document.getElementById('formatList');
  listEl.innerHTML = '';

  const autoBtn = createFormatButton({
    isAuto: true,
    label: '自動（mp4 最高品質）',
    details: 'yt-dlp 既定（bestvideo[ext=mp4]+bestaudio[ext=m4a]/best）',
    sizeBytes: null,
    formatId: null,
  });
  listEl.appendChild(autoBtn);

  if (options.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:14px; color:#a0aec0; font-size:0.85rem;';
    empty.textContent = '解析できる画質情報がありませんでした。「自動」でダウンロードしてください。';
    listEl.appendChild(empty);
  } else {
    options.forEach(opt => {
      listEl.appendChild(createFormatButton(opt));
    });
  }

  listEl.querySelectorAll('.format-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const formatId = btn.dataset.formatId || null;
      closeFormatSelectModal();
      startDownloadWithFormat(url, formatId);
    });
  });
}

function createFormatButton(opt) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'format-option' + (opt.isAuto ? ' format-option--auto' : '');
  if (opt.formatId) btn.dataset.formatId = opt.formatId;

  const sizeText = opt.sizeBytes ? formatFileSize(opt.sizeBytes) : '?';
  const TWO_GIB = 2 * 1024 * 1024 * 1024;
  const ONE_GIB = 1024 * 1024 * 1024;
  let sizeClass = '';
  let warnIcon = '';
  if (opt.sizeBytes && opt.sizeBytes > TWO_GIB) {
    sizeClass = 'format-option__size--big';
    warnIcon = '<span class="format-option__warn-icon" title="2GiBを超えるため再生時に問題が出る可能性">⚠</span>';
  } else if (opt.sizeBytes && opt.sizeBytes > ONE_GIB) {
    sizeClass = 'format-option__size--warn';
  }

  const resoLabel = opt.isAuto ? '⭐ 自動' : (opt.label || `${opt.height}p`);
  const detailsLabel = opt.details || buildFormatDetails(opt);

  btn.innerHTML = `
    <span class="format-option__resolution">${escapeHtml(resoLabel)}</span>
    <span class="format-option__details">${escapeHtml(detailsLabel)}</span>
    <span class="format-option__size ${sizeClass}">${sizeText}${warnIcon}</span>
    <span class="format-option__action">DL →</span>
  `;
  return btn;
}

function buildFormatDetails(opt) {
  const parts = [];
  if (opt.ext) parts.push(opt.ext);
  if (opt.fps) parts.push(`${opt.fps}fps`);
  if (opt.vcodec) parts.push(simplifyCodec(opt.vcodec));
  if (opt.acodec && opt.acodec !== 'none') parts.push(simplifyCodec(opt.acodec));
  return parts.join(' · ');
}

function simplifyCodec(codec) {
  if (!codec) return '';
  if (codec.startsWith('avc1')) return 'h264';
  if (codec.startsWith('vp9')) return 'vp9';
  if (codec.startsWith('av01')) return 'av1';
  if (codec.startsWith('mp4a')) return 'aac';
  if (codec.startsWith('opus')) return 'opus';
  return codec.split('.')[0];
}

function pickFormatOptions(formats, durationSec) {
  if (!Array.isArray(formats) || formats.length === 0) return [];

  const videos = formats.filter(f => f.vcodec && f.vcodec !== 'none' && f.height);
  const audios = formats.filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'));

  const bestAudio = audios.reduce((best, f) => {
    if (!best) return f;
    return (f.tbr || 0) > (best.tbr || 0) ? f : best;
  }, null);

  const byHeight = new Map();
  for (const f of videos) {
    const h = f.height;
    const cur = byHeight.get(h);
    if (!cur) {
      byHeight.set(h, f);
    } else {
      const curIsMp4 = cur.ext === 'mp4';
      const fIsMp4 = f.ext === 'mp4';
      if (fIsMp4 && !curIsMp4) byHeight.set(h, f);
      else if (fIsMp4 === curIsMp4 && (f.tbr || 0) > (cur.tbr || 0)) byHeight.set(h, f);
    }
  }

  const options = [];
  for (const v of byHeight.values()) {
    const hasAudio = v.acodec && v.acodec !== 'none';
    let formatId, sizeBytes, audioForLabel;

    if (hasAudio) {
      formatId = v.formatId;
      sizeBytes = v.filesize || v.filesizeApprox || estimateSize(v.tbr, durationSec);
      audioForLabel = v;
    } else if (bestAudio) {
      formatId = `${v.formatId}+${bestAudio.formatId}`;
      const vSize = v.filesize || v.filesizeApprox || estimateSize(v.tbr, durationSec);
      const aSize = bestAudio.filesize || bestAudio.filesizeApprox || estimateSize(bestAudio.tbr, durationSec);
      sizeBytes = (vSize || 0) + (aSize || 0);
      audioForLabel = bestAudio;
    } else {
      formatId = v.formatId;
      sizeBytes = v.filesize || v.filesizeApprox || estimateSize(v.tbr, durationSec);
      audioForLabel = null;
    }

    options.push({
      formatId,
      label: `${v.height}p`,
      height: v.height,
      ext: v.ext,
      vcodec: v.vcodec,
      acodec: audioForLabel ? audioForLabel.acodec : null,
      fps: v.fps,
      sizeBytes: sizeBytes || null,
    });
  }

  options.sort((a, b) => b.height - a.height);
  return options;
}

function estimateSize(tbrKbps, durationSec) {
  if (!tbrKbps || !durationSec) return null;
  return Math.round((tbrKbps * 1000 / 8) * durationSec);
}

// ============================================================
// ダウンロード済み動画管理
// ============================================================

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

function displayDownloadedVideos(files) {
  if (files.length === 0) {
    downloadedVideos.innerHTML = '<p>ダウンロード済みの動画がありません</p>';
    return;
  }

  const sortedFiles = [...files].sort((a, b) => {
    const dateA = a.metadata?.downloadedAt
      ? new Date(a.metadata.downloadedAt)
      : new Date(a.stats.mtime);
    const dateB = b.metadata?.downloadedAt
      ? new Date(b.metadata.downloadedAt)
      : new Date(b.stats.mtime);
    return dateB - dateA;
  });

  downloadedVideos.innerHTML = sortedFiles.map((file, index) => {
    const meta = file.metadata;

    if (meta) {
      return `
        <div class="video-item-card">
          <img src="${escapeHtml(meta.thumbnail)}" alt="${escapeHtml(meta.title)}" class="video-item-thumbnail" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22113%22%3E%3Crect fill=%22%23ddd%22 width=%22200%22 height=%22113%22/%3E%3C/svg%3E'">
          <div class="video-item-content">
            <div class="video-item-title">${escapeHtml(meta.title)}</div>
            <div class="video-item-metadata">
              <div class="metadata-row"><span class="metadata-label">チャンネル:</span><span>${escapeHtml(meta.uploader)}</span></div>
              <div class="metadata-row"><span class="metadata-label">再生時間:</span><span>${formatDuration(meta.duration)}</span></div>
              <div class="metadata-row"><span class="metadata-label">視聴回数:</span><span>${formatNumber(meta.viewCount)}</span></div>
              <div class="metadata-row"><span class="metadata-label">ダウンロード日時:</span><span>${new Date(meta.downloadedAt).toLocaleString('ja-JP')}</span></div>
              <div class="metadata-row"><span class="metadata-label">ファイルサイズ:</span><span>${formatFileSize(file.stats.size)}</span></div>
              <div class="metadata-row"><span class="metadata-label">コメント:</span><span class="badge ${file.hasLiveChat ? 'badge-success' : 'badge-muted'}">${file.hasLiveChat ? 'DL済み' : '未取得'}</span></div>
            </div>
            <button class="btn btn-primary video-item-play-btn" onclick="playVideo(${index})">
              再生
            </button>
          </div>
        </div>
      `;
    } else {
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

  window.downloadedFilesList = sortedFiles;
}

async function playVideo(fileIndex) {
  if (!window.downloadedFilesList || !window.downloadedFilesList[fileIndex]) {
    console.error('ファイルが見つかりません');
    return;
  }

  const file = window.downloadedFilesList[fileIndex];
  const filePath = file.path;

  // 動画切り替え時は前回動画のコメント密度・盛り上がりの状態を破棄
  resetCommentStateForVideoSwitch();

  currentVideoFile = {
    name: file.name,
    path: filePath,
    size: file.stats.size,
    hasLiveChat: file.hasLiveChat || false,
    metadata: file.metadata || null
  };

  const videoIdMatch = file.name.match(/([a-zA-Z0-9_-]{11})/);
  if (videoIdMatch) {
    videoIdInput.value = videoIdMatch[1];
    metadata.videoId = videoIdMatch[1];
  }

  console.log('Loading video:', filePath);

  try {
    const result = await window.electronAPI.loadVideoFile(filePath);

    if (!result.success) {
      throw new Error(result.error);
    }

    const blob = new Blob([result.data], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    if (videoPlayer.src && videoPlayer.src.startsWith('blob:')) {
      URL.revokeObjectURL(videoPlayer.src);
    }

    videoPlayer.src = url;
    const thumbVideo = document.getElementById('thumbnailVideo');
    if (thumbVideo) {
      thumbVideo.src = url;
    }
    previewSection.style.display = 'block';
    videoPlayer.style.display = 'block';
    document.getElementById('videoToolbar').style.display = 'flex';
    document.getElementById('editTabMessage').style.display = 'none';

    switchTab('edit');

    previewSection.scrollIntoView({ behavior: 'smooth' });

    videoPlayer.onerror = (e) => {
      console.error('動画の読み込みに失敗しました:', e);
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

      autoGenerateFileName();
      autoGenerateClipUrl();

      updateCommentButtons();

      showWaveform();

      if (currentVideoFile && currentVideoFile.hasLiveChat) {
        setTimeout(() => loadAndShowCommentDensity(true), 500);
      }
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

// ============================================================
// トリミング調整
// ============================================================

// トリミング時間表示を更新（複数モジュールの UI を連動させるオーケストレーター）
function updateTrimDisplay() {
  trimState.duration = trimState.endTime - trimState.startTime;

  updateClipTimelineUI();
  updateWaveformRegion();
  updateWaveformZoom();
  autoGenerateFileName();
  autoGenerateClipUrl();
  updateClipPanel();
}

// クリップパネルは削除済み。クラッシュ防止のためダミー関数を残す。
function updateClipPanel() {}

// トリミングの初期化（動画読み込み後に呼ばれる）
function initTrimSliders() {
  if (!videoPlayer.duration) return;

  const duration = videoPlayer.duration;
  trimState.startTime = 0;
  trimState.endTime = duration;

  clipViewState.viewStartTime = 0;
  clipViewState.viewEndTime = duration;

  updateTrimDisplay();
  initClipTimeline();
}

/**
 * 指定した時間を中心に ±range 秒のトリミング範囲を作成し、ループ再生する
 */
function applyCenteredRange(centerTime, range, toastLabel = '範囲を設定') {
  if (!videoPlayer.duration) return;

  const duration = videoPlayer.duration;
  const newStart = Math.max(0, centerTime - range);
  const newEnd = Math.min(duration, centerTime + range);

  trimState.startTime = newStart;
  trimState.endTime = newEnd;
  trimState.isLooping = true;
  loopCheckbox.checked = true;

  updateTrimDisplay();

  videoPlayer.currentTime = newStart;
  videoPlayer.play().catch(e => console.error('再生エラー:', e));

  showToast(
    `${toastLabel}: ${formatTimeShort(newStart)} 〜 ${formatTimeShort(newEnd)} (±${range}秒)`,
    'info',
    2500
  );
}

// 動画のメタデータ読み込み後にスライダーを初期化
videoPlayer.addEventListener('loadedmetadata', () => {
  initTrimSliders();
});

// ============================================================
// 初期化
// ============================================================

function initialize() {
  loadCategories();
  renderCategoryButtons();
  loadFineTuneSettings();
  updateFineTuneButtonLabels();
  initInputHistories();
  initTextPresets();
  loadTimelineClickMode();
  setTimelineClickMode(timelineClickMode);
  updateSelectedCategories();

  document.querySelectorAll('.btn-mode[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      setTimelineClickMode(btn.dataset.mode);
    });
  });

  const rangeFromCurrent = (range) => {
    if (!videoPlayer.duration) {
      showToast('動画を読み込んでください', 'warning');
      return;
    }
    applyCenteredRange(videoPlayer.currentTime, range, '現在位置を中心に範囲設定');
  };
  document.getElementById('rangeFromCurrent15Btn').addEventListener('click', () => rangeFromCurrent(15));
  document.getElementById('rangeFromCurrent30Btn').addEventListener('click', () => rangeFromCurrent(30));

  initQuickAddCategory();
}

function initQuickAddCategory() {
  const input = document.getElementById('quickAddCategoryInput');
  const btn = document.getElementById('quickAddCategoryBtn');
  if (!input || !btn) return;

  const addAndSelect = () => {
    const value = input.value.trim();
    if (!value) {
      showToast('カテゴリ名を入力してください', 'warning');
      input.focus();
      return;
    }

    if (availableCategories.includes(value)) {
      if (!metadata.categories.includes(value)) {
        metadata.categories.push(value);
      }
      const existing = Array.from(categoryButtons.querySelectorAll('.btn-category'))
        .find(b => b.dataset.category === value);
      if (existing) existing.classList.add('active');
      updateSelectedCategories();
      input.value = '';
      showToast(`「${value}」を選択しました`, 'success', 1500);
      return;
    }

    availableCategories.push(value);
    saveCategories();
    metadata.categories.push(value);

    renderCategoryButtons();
    updateSelectedCategories();

    input.value = '';
    showToast(`カテゴリ「${value}」を追加しました`, 'success');
  };

  btn.addEventListener('click', addAndSelect);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addAndSelect();
    }
  });
}

function initInputHistories() {
  InputHistory.bind(searchQuery, 'searchQuery');
  InputHistory.bind(downloadUrl, 'downloadUrl');
  InputHistory.bind(videoIdInput, 'videoId', { saveOnEnter: false });
  InputHistory.bind(serifInput, 'serif', { saveOnEnter: false });

  refreshSearchHistoryChips();
}

function refreshSearchHistoryChips() {
  const container = document.getElementById('searchHistoryChips');
  if (!container) return;
  InputHistory.renderChips(
    'searchQuery',
    container,
    (value) => {
      searchQuery.value = value;
      searchVideos();
    },
    () => {
      InputHistory.bind(searchQuery, 'searchQuery').refresh();
    }
  );
}

let _textPresetsInitialized = false;
let _renderSerifChips = null;
let _renderMemoChips = null;

function initTextPresets() {
  const serifChips = document.getElementById('serifPresetChips');
  const memoChips = document.getElementById('memoPresetChips');
  const serifSaveBtn = document.getElementById('serifSavePresetBtn');
  const memoSaveBtn = document.getElementById('memoSavePresetBtn');

  _renderSerifChips = () => {
    TextPresets.render('serif', serifChips, (value) => {
      serifInput.value = value;
      metadata.serif = value;
      serifInput.dispatchEvent(new Event('input', { bubbles: true }));
      showToast('セリフプリセットを適用しました', 'success', 1500);
    });
  };
  _renderMemoChips = () => {
    TextPresets.render('memo', memoChips, (value) => {
      memoInput.value = value;
      metadata.memo = value;
      memoInput.dispatchEvent(new Event('input', { bubbles: true }));
      showToast('メモプリセットを適用しました', 'success', 1500);
    });
  };

  _renderSerifChips();
  _renderMemoChips();

  if (_textPresetsInitialized) return;
  _textPresetsInitialized = true;

  serifSaveBtn.addEventListener('click', () => {
    const value = serifInput.value.trim();
    if (!value) {
      showToast('セリフを入力してください', 'warning');
      return;
    }
    if (TextPresets.add('serif', value)) {
      _renderSerifChips();
      showToast('セリフをプリセットに保存しました', 'success');
    } else {
      showToast('既に登録済みのプリセットです', 'info');
    }
  });

  memoSaveBtn.addEventListener('click', () => {
    const value = memoInput.value.trim();
    if (!value) {
      showToast('メモを入力してください', 'warning');
      return;
    }
    if (TextPresets.add('memo', value)) {
      _renderMemoChips();
      showToast('メモをプリセットに保存しました', 'success');
    } else {
      showToast('既に登録済みのプリセットです', 'info');
    }
  });
}

// ============================================================
// 全設定リセット
// ============================================================

function resetAllSettings() {
  if (!confirm('全ての設定をデフォルトに戻しますか？\n\n以下の設定がリセットされます：\n・カテゴリ設定\n・キーボードショートカット\n・微調整フレーム設定\n・入力履歴（検索/URL/Video ID/セリフ）\n・テキストプリセット（セリフ/メモ）\n・タイムラインクリックモード\n・ファイル名テンプレート\n・編集タブの列幅\n\nこの操作は取り消せません。')) {
    return;
  }

  try {
    localStorage.removeItem('availableCategories');
    localStorage.removeItem('keyboardShortcuts');
    localStorage.removeItem('fineTuneSettings');
    localStorage.removeItem('timelineClickMode');
    localStorage.removeItem(FileNameTemplate.STORAGE_KEY);
    ColumnResizer.reset();

    ['searchQuery', 'downloadUrl', 'videoId', 'serif'].forEach(key => {
      localStorage.removeItem(InputHistory.STORAGE_PREFIX + key);
    });

    ['serif', 'memo'].forEach(key => {
      localStorage.removeItem(TextPresets.STORAGE_PREFIX + key);
    });

    availableCategories = [...defaultCategories];
    metadata.categories = metadata.categories.filter(c => availableCategories.includes(c));
    renderCategoryList();
    renderCategoryButtons();
    updateSelectedCategories();

    shortcuts = { ...defaultShortcuts };
    renderShortcutList();

    fineTuneSettings = { smallFrames: 1, largeFrames: 15 };
    updateFineTuneButtonLabels();

    setTimelineClickMode('seek');

    initInputHistories();
    initTextPresets();

    showToast('全ての設定をデフォルトに戻しました', 'success');
  } catch (error) {
    console.error('設定のリセットに失敗:', error);
    showToast('設定のリセットに失敗しました', 'error');
  }
}

// ============================================================
// イベントリスナー
// ============================================================

searchBtn.addEventListener('click', searchVideos);
searchQuery.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') searchVideos();
});

downloadBtn.addEventListener('click', downloadVideo);
downloadUrl.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') downloadVideo();
});

refreshBtn.addEventListener('click', loadDownloadedVideos);

window.addEventListener('DOMContentLoaded', () => {
  loadDownloadedVideos();
});

// 微調整フレーム設定の+/-ボタン
document.getElementById('smallFramesMinus').addEventListener('click', () => {
  if (fineTuneSettings.smallFrames > 1) {
    fineTuneSettings.smallFrames--;
    saveFineTuneSettings();
    updateFineTuneButtonLabels();
    showToast(`小フレーム数: ${fineTuneSettings.smallFrames}`, 'info');
  }
});
document.getElementById('smallFramesPlus').addEventListener('click', () => {
  if (fineTuneSettings.smallFrames < 30) {
    fineTuneSettings.smallFrames++;
    saveFineTuneSettings();
    updateFineTuneButtonLabels();
    showToast(`小フレーム数: ${fineTuneSettings.smallFrames}`, 'info');
  }
});
document.getElementById('largeFramesMinus').addEventListener('click', () => {
  if (fineTuneSettings.largeFrames > 1) {
    fineTuneSettings.largeFrames--;
    saveFineTuneSettings();
    updateFineTuneButtonLabels();
    showToast(`大フレーム数: ${fineTuneSettings.largeFrames}`, 'info');
  }
});
document.getElementById('largeFramesPlus').addEventListener('click', () => {
  if (fineTuneSettings.largeFrames < 60) {
    fineTuneSettings.largeFrames++;
    saveFineTuneSettings();
    updateFineTuneButtonLabels();
    showToast(`大フレーム数: ${fineTuneSettings.largeFrames}`, 'info');
  }
});

// 全設定リセットボタン
document.getElementById('resetAllSettingsBtn').addEventListener('click', resetAllSettings);

// カテゴリ設定モーダル関連
document.getElementById('categorySettingsBtn').addEventListener('click', openCategoryModal);
document.getElementById('closeCategoryModal').addEventListener('click', closeCategoryModal);
document.getElementById('closeCategoryModalBtn').addEventListener('click', closeCategoryModal);
document.getElementById('addCategoryBtn').addEventListener('click', addCategory);
document.getElementById('resetCategoriesBtn').addEventListener('click', resetCategories);

document.getElementById('newCategoryInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addCategory();
});

document.getElementById('categoryModal').addEventListener('click', (e) => {
  if (e.target.id === 'categoryModal') closeCategoryModal();
});

// 画質選択モーダル関連
document.getElementById('closeFormatModal').addEventListener('click', closeFormatSelectModal);
document.getElementById('cancelFormatBtn').addEventListener('click', closeFormatSelectModal);
document.getElementById('formatSelectModal').addEventListener('click', (e) => {
  if (e.target.id === 'formatSelectModal') closeFormatSelectModal();
});

// ============================================================
// カスタム動画ツールバー
// ============================================================

(function initVideoToolbar() {
  const playPauseBtn = document.getElementById('playPauseBtn');
  const iconPlay = playPauseBtn.querySelector('.icon-play');
  const iconPause = playPauseBtn.querySelector('.icon-pause');
  const currentTimeEl = document.getElementById('videoCurrentTime');
  const totalTimeEl = document.getElementById('videoTotalTime');
  const seekBar = document.getElementById('videoSeekBar');
  const speedSelect = document.getElementById('playbackSpeedSelect');
  const muteBtn = document.getElementById('muteBtn');
  const iconVolume = muteBtn.querySelector('.icon-volume');
  const iconMute = muteBtn.querySelector('.icon-mute');
  const volumeBar = document.getElementById('volumeBar');
  const fullscreenBtn = document.getElementById('fullscreenBtn');

  let isSeeking = false;

  playPauseBtn.addEventListener('click', () => {
    if (!videoPlayer.src) return;
    if (videoPlayer.paused) {
      videoPlayer.play().catch(e => console.error('再生エラー:', e));
    } else {
      videoPlayer.pause();
    }
  });

  videoPlayer.addEventListener('play', () => {
    iconPlay.style.display = 'none';
    iconPause.style.display = '';
  });
  videoPlayer.addEventListener('pause', () => {
    iconPlay.style.display = '';
    iconPause.style.display = 'none';
  });

  const updateTimeDisplay = () => {
    currentTimeEl.textContent = formatTimeShort(videoPlayer.currentTime || 0);
    totalTimeEl.textContent = formatTimeShort(videoPlayer.duration || 0);
    if (!isSeeking && videoPlayer.duration) {
      seekBar.value = String(Math.round((videoPlayer.currentTime / videoPlayer.duration) * 1000));
    }
  };
  videoPlayer.addEventListener('timeupdate', updateTimeDisplay);
  videoPlayer.addEventListener('loadedmetadata', updateTimeDisplay);
  videoPlayer.addEventListener('durationchange', updateTimeDisplay);

  seekBar.addEventListener('input', () => {
    if (!videoPlayer.duration) return;
    isSeeking = true;
    const ratio = parseInt(seekBar.value, 10) / 1000;
    videoPlayer.currentTime = ratio * videoPlayer.duration;
  });
  seekBar.addEventListener('change', () => { isSeeking = false; });

  speedSelect.addEventListener('change', () => {
    const rate = parseFloat(speedSelect.value);
    if (!isNaN(rate) && rate > 0) {
      videoPlayer.playbackRate = rate;
      showToast(`再生速度: ${rate}x`, 'info', 1200);
    }
  });

  muteBtn.addEventListener('click', () => {
    videoPlayer.muted = !videoPlayer.muted;
  });
  videoPlayer.addEventListener('volumechange', () => {
    const muted = videoPlayer.muted || videoPlayer.volume === 0;
    iconVolume.style.display = muted ? 'none' : '';
    iconMute.style.display = muted ? '' : 'none';
    volumeBar.value = String(videoPlayer.muted ? 0 : videoPlayer.volume);
  });

  volumeBar.addEventListener('input', () => {
    const v = parseFloat(volumeBar.value);
    videoPlayer.volume = isNaN(v) ? 1 : v;
    if (v > 0 && videoPlayer.muted) videoPlayer.muted = false;
  });

  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(e => console.error('フルスクリーン解除エラー:', e));
    } else {
      videoPlayer.requestFullscreen?.().catch(e => console.error('フルスクリーンエラー:', e));
    }
  });

  document.getElementById('screenshotBtn').addEventListener('click', takeScreenshot);
})();

async function takeScreenshot() {
  if (!videoPlayer.duration || !videoPlayer.videoWidth) {
    showToast('動画を読み込んでください', 'warning');
    return;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = videoPlayer.videoWidth;
    canvas.height = videoPlayer.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');

    const tplCtx = buildTemplateContext();
    const currentSec = Math.max(0, Math.floor(videoPlayer.currentTime));
    tplCtx.startAt = String(currentSec).padStart(6, '0');
    tplCtx.endAt = tplCtx.startAt;
    const h = Math.floor(currentSec / 3600);
    const m = Math.floor((currentSec % 3600) / 60);
    const s = currentSec % 60;
    const clock = `${String(h).padStart(2,'0')}-${String(m).padStart(2,'0')}-${String(s).padStart(2,'0')}`;
    tplCtx.startAtClock = clock;
    tplCtx.endAtClock = clock;
    tplCtx.duration = '0000';

    const fileName = FileNameTemplate.resolve(FileNameTemplate.get(), tplCtx) ||
      `${tplCtx.videoId || 'screenshot'}_${tplCtx.startAt}`;

    const result = await window.electronAPI.saveScreenshot(dataUrl, fileName);
    if (result.success) {
      showToast(`スクリーンショットを保存しました\n${result.filePath}`, 'success', 4000);
    } else {
      showToast(`保存に失敗しました: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('スクリーンショット保存エラー:', error);
    showToast(`スクリーンショット保存エラー: ${error.message}`, 'error');
  }
}

// ============================================================
// 起動
// ============================================================

initialize();
loadShortcuts();
ColumnResizer.init();
