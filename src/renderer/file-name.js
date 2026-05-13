/**
 * ファイル名テンプレート・メタデータ入力・エクスポート
 *
 * 依存: utils.js (escapeHtml, showToast, katakanaToHiragana)
 *       dom-elements.js (videoIdInput, fileNameInput, serifInput, ...)
 *       storage.js (InputHistory)
 */

/**
 * 出力ファイル名テンプレート機能
 * トークン置換でファイル名（およびサブディレクトリ）を生成する。
 * テンプレート内の "/" はサブフォルダとして扱われる。
 */
const FileNameTemplate = {
  STORAGE_KEY: 'fileNameTemplate',
  DEFAULT: '{videoId}_{startAt}-{endAt}',

  TOKENS: [
    { key: 'videoId',      desc: 'YouTube Video ID',      example: 'dQw4w9WgXcQ' },
    { key: 'videoTitle',   desc: '動画タイトル',           example: 'Never_Gonna_Give_You_Up' },
    { key: 'channelTitle', desc: 'チャンネル名',           example: 'RickAstleyVEVO' },
    { key: 'publishDate',  desc: '公開日 (YYYY-MM-DD)',   example: '2009-10-25' },
    { key: 'downloadDate', desc: 'ダウンロード日',         example: '2026-04-28' },
    { key: 'startAt',      desc: '開始時間（6桁0詰め秒）', example: '000010' },
    { key: 'endAt',        desc: '終了時間（6桁0詰め秒）', example: '000040' },
    { key: 'startAtClock', desc: '開始時間 (HH-MM-SS)',   example: '00-00-10' },
    { key: 'endAtClock',   desc: '終了時間 (HH-MM-SS)',   example: '00-00-40' },
    { key: 'duration',     desc: '長さ（秒、4桁0詰め）',  example: '0030' },
    { key: 'serif',        desc: 'セリフ／クリップタイトル', example: 'こんにちは' },
    { key: 'categories',   desc: 'カテゴリ（_区切り）',    example: '面白い_感動' },
  ],

  get() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      return saved && saved.trim() ? saved : this.DEFAULT;
    } catch (e) {
      return this.DEFAULT;
    }
  },

  set(template) {
    try {
      localStorage.setItem(this.STORAGE_KEY, template);
    } catch (e) {
      console.error('テンプレートの保存に失敗:', e);
    }
  },

  reset() {
    try { localStorage.removeItem(this.STORAGE_KEY); } catch (e) {}
  },

  sanitizeTokenValue(value) {
    if (value === undefined || value === null) return '';
    let s = String(value);
    s = s.replace(/[<>:"|?*\x00-\x1f/\\]/g, '_');
    s = s.replace(/_+/g, '_');
    return s.trim();
  },

  normalizePath(rawPath) {
    const parts = rawPath
      .split('/')
      .map(s => s.replace(/[<>:"|?*\x00-\x1f\\]/g, '_').replace(/^[\s.]+|[\s.]+$/g, '').trim())
      .filter(s => s.length > 0);
    return parts.join('/');
  },

  resolve(template, ctx) {
    if (!template || typeof template !== 'string') template = this.DEFAULT;

    let result = template;
    for (const { key } of this.TOKENS) {
      const placeholder = `{${key}}`;
      if (!result.includes(placeholder)) continue;
      const value = this.sanitizeTokenValue(ctx[key]);
      result = result.split(placeholder).join(value);
    }

    return this.normalizePath(result);
  },
};

/**
 * テンプレート解決用コンテキストを現在の状態から構築
 */
function buildTemplateContext() {
  const videoId = (videoIdInput && videoIdInput.value || '').trim() || (metadata.videoId || '');
  const m = (currentVideoFile && currentVideoFile.metadata) || {};

  let publishDate = '';
  if (m.uploadDate && /^\d{8}$/.test(m.uploadDate)) {
    publishDate = `${m.uploadDate.slice(0,4)}-${m.uploadDate.slice(4,6)}-${m.uploadDate.slice(6,8)}`;
  } else if (m.uploadDate) {
    publishDate = String(m.uploadDate);
  }

  let downloadDate = '';
  if (m.downloadedAt) {
    const d = new Date(m.downloadedAt);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      downloadDate = `${y}-${mo}-${dd}`;
    }
  }

  const startSec = Math.max(0, Math.floor(trimState.startTime || 0));
  const endSec = Math.max(0, Math.floor(trimState.endTime || 0));
  const dur = Math.max(0, endSec - startSec);

  const formatClock = (sec) => {
    const h = Math.floor(sec / 3600);
    const mn = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2,'0')}-${String(mn).padStart(2,'0')}-${String(s).padStart(2,'0')}`;
  };

  return {
    videoId,
    videoTitle: m.title || '',
    channelTitle: m.uploader || '',
    publishDate,
    downloadDate,
    startAt: String(startSec).padStart(6, '0'),
    endAt: String(endSec).padStart(6, '0'),
    startAtClock: formatClock(startSec),
    endAtClock: formatClock(endSec),
    duration: String(dur).padStart(4, '0'),
    serif: (metadata.serif || '').trim(),
    categories: (metadata.categories || []).join('_'),
  };
}

function autoGenerateFileName() {
  if (!videoPlayer.duration) return;

  const fileName = FileNameTemplate.resolve(
    FileNameTemplate.get(),
    buildTemplateContext()
  );

  if (!fileName) return;

  fileNameInput.value = fileName;
  metadata.fileName = fileName;
}

function autoGenerateClipUrl() {
  const videoId = videoIdInput.value.trim();

  if (!videoId || !videoPlayer.duration) {
    return;
  }

  const startSec = Math.floor(trimState.startTime);
  const clipUrl = `https://youtube.com/watch?v=${videoId}&t=${startSec}s`;

  clipUrlInput.value = clipUrl;
  metadata.clipUrl = clipUrl;
}

/**
 * 現在の動画から YouTube URL を解決する
 */
function resolveYouTubeUrlForCurrentVideo() {
  if (!currentVideoFile) return '';
  let url = (currentVideoFile.metadata && currentVideoFile.metadata.url) || '';
  if (url) return url;
  const vid = (currentVideoFile.metadata && currentVideoFile.metadata.videoId)
    || (currentVideoFile.name && currentVideoFile.name.match(/([a-zA-Z0-9_-]{11})/)?.[1])
    || metadata.videoId;
  return vid ? `https://www.youtube.com/watch?v=${vid}` : '';
}

/**
 * yt-dlp コマンド文字列を生成する
 */
function buildExportCommand(url, startTime, endTime, fileName) {
  const start = Number(startTime).toFixed(3);
  const end = Number(endTime).toFixed(3);
  const outPath = `output/movies/${fileName}.mp4`;
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  return [
    'yt-dlp',
    '-f', q('bv*+ba/b'),
    '--download-sections', q(`*${start}-${end}`),
    '--force-keyframes-at-cuts',
    '--recode-video', 'mp4',
    '--no-playlist',
    '--no-part',
    '-o', q(outPath),
    q(url)
  ].join(' ');
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

  const ruby = katakanaToHiragana(serif);
  rubyInput.value = ruby;
  metadata.ruby = ruby;

  showToast('ルビを自動生成しました', 'success');
});

// クリップ範囲の音声認識でセリフ＋ルビを自動入力
transcribeSerifBtn.addEventListener('click', async () => {
  if (!currentVideoFile || !currentVideoFile.path) {
    showToast('動画を読み込んでください', 'warning');
    return;
  }
  if (!videoPlayer.duration) {
    showToast('動画を読み込んでください', 'warning');
    return;
  }
  if (trimState.endTime <= trimState.startTime) {
    showToast('トリミング範囲を設定してください', 'warning');
    return;
  }

  const prevDisabled = transcribeSerifBtn.disabled;
  const prevLabel = transcribeSerifBtn.textContent;
  transcribeSerifBtn.disabled = true;
  transcribeSerifBtn.textContent = '⏳';
  try {
    const text = await window.electronAPI.transcribeClip(
      currentVideoFile.path,
      trimState.startTime,
      trimState.endTime
    );
    const cleaned = (text || '').trim();
    if (!cleaned) {
      showToast('音声認識結果が空でした', 'warning');
      return;
    }
    serifInput.value = cleaned;
    metadata.serif = cleaned;
    const ruby = katakanaToHiragana(cleaned);
    rubyInput.value = ruby;
    metadata.ruby = ruby;
    showToast('セリフとルビを生成しました', 'success');
  } catch (err) {
    console.error(err);
    showToast(`音声認識に失敗: ${err.message || err}`, 'error');
  } finally {
    transcribeSerifBtn.disabled = prevDisabled;
    transcribeSerifBtn.textContent = prevLabel;
  }
});

// メタデータの保存（JSON）
saveMetadataBtn.addEventListener('click', async () => {
  metadata.videoId = videoIdInput.value.trim();
  metadata.fileName = fileNameInput.value.trim();
  metadata.serif = serifInput.value.trim();
  metadata.ruby = rubyInput.value.trim();
  metadata.clipUrl = clipUrlInput.value.trim();
  metadata.memo = memoInput.value.trim();

  const exportUrl = resolveYouTubeUrlForCurrentVideo();
  const saveFileName = metadata.fileName || 'metadata';
  const exportCommand = exportUrl
    ? buildExportCommand(exportUrl, trimState.startTime, trimState.endTime, saveFileName)
    : null;

  const saveData = {
    ...metadata,
    trimming: {
      startTime: trimState.startTime,
      endTime: trimState.endTime,
      duration: trimState.duration,
      command: exportCommand
    },
    videoFile: currentVideoFile,
    createdAt: new Date().toISOString()
  };

  try {
    const result = await window.electronAPI.saveMetadata(saveData, metadata.fileName || 'metadata');

    if (result.success) {
      showToast(`メタデータを保存しました\n保存先: ${result.filePath}`, 'success', 5000);
      if (metadata.videoId) InputHistory.save('videoId', metadata.videoId);
      if (metadata.serif) InputHistory.save('serif', metadata.serif);
    } else {
      showToast(`保存に失敗しました: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('保存エラー:', error);
    showToast(`保存に失敗しました: ${error.message}`, 'error');
  }
});

// 動画を書き出し
exportVideoBtn.addEventListener('click', async () => {
  if (!currentVideoFile) {
    showToast('動画を読み込んでください', 'warning');
    return;
  }

  if (!videoPlayer.duration || trimState.duration <= 0) {
    showToast('トリミング範囲を設定してください', 'warning');
    return;
  }

  const fileName = fileNameInput.value.trim() || metadata.fileName;
  if (!fileName) {
    showToast('ファイル名を入力してください', 'warning');
    return;
  }

  const url = resolveYouTubeUrlForCurrentVideo();
  if (!url) {
    showToast('YouTubeのURLまたは動画IDを特定できませんでした', 'error');
    return;
  }

  try {
    exportVideoBtn.disabled = true;
    exportVideoBtn.textContent = '書き出し中...';

    window.electronAPI.onExportProgress((info) => {
      if (info && typeof info === 'object') {
        if (info.stage === 'encoding') {
          exportVideoBtn.textContent = '再エンコード中...';
        } else if (typeof info.percentage === 'number') {
          exportVideoBtn.textContent = `DL中 ${Math.floor(info.percentage)}%`;
        }
      }
    });

    showToast('YouTubeから指定区間をダウンロードして書き出します', 'info');

    const result = await window.electronAPI.exportVideo(
      url,
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
    exportVideoBtn.disabled = false;
    exportVideoBtn.textContent = '動画を書き出し (MP4)';
    if (window.electronAPI.removeExportProgressListener) {
      window.electronAPI.removeExportProgressListener();
    }
  }
});

// メタデータのクリア
clearMetadataBtn.addEventListener('click', () => {
  if (!confirm('メタデータをクリアしますか？')) {
    return;
  }

  videoIdInput.value = '';
  fileNameInput.value = '';
  serifInput.value = '';
  rubyInput.value = '';
  clipUrlInput.value = '';
  memoInput.value = '';

  metadata.categories = [];
  categoryButtons.querySelectorAll('.btn-category').forEach(btn => {
    btn.classList.remove('active');
  });
  updateSelectedCategories();

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
serifInput.addEventListener('input', (e) => {
  metadata.serif = e.target.value.trim();
  autoGenerateFileName();
});
rubyInput.addEventListener('input', (e) => metadata.ruby = e.target.value.trim());
clipUrlInput.addEventListener('input', (e) => metadata.clipUrl = e.target.value.trim());
memoInput.addEventListener('input', (e) => metadata.memo = e.target.value.trim());

// ============================================================
// ファイル名テンプレート設定モーダル
// ============================================================

function openFileNameTemplateModal() {
  const modal = document.getElementById('fileNameTemplateModal');
  modal.classList.add('active');

  const input = document.getElementById('fileNameTemplateInput');
  input.value = FileNameTemplate.get();

  renderTokenCards();
  updateFileNameTemplatePreview();

  input.oninput = updateFileNameTemplatePreview;

  setTimeout(() => input.focus(), 50);
}

function closeFileNameTemplateModal() {
  document.getElementById('fileNameTemplateModal').classList.remove('active');
}

function renderTokenCards() {
  const container = document.getElementById('fileNameTemplateTokens');
  container.innerHTML = '';

  FileNameTemplate.TOKENS.forEach(token => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'token-card';
    card.title = `クリックでテンプレートに「{${token.key}}」を挿入`;
    card.innerHTML = `
      <span class="token-card__name">{${escapeHtml(token.key)}}</span>
      <span class="token-card__desc">${escapeHtml(token.desc)}</span>
      <span class="token-card__example">例: ${escapeHtml(token.example)}</span>
    `;
    card.addEventListener('click', () => {
      insertTokenAtCursor(`{${token.key}}`);
    });
    container.appendChild(card);
  });
}

function insertTokenAtCursor(text) {
  const input = document.getElementById('fileNameTemplateInput');
  const start = input.selectionStart || 0;
  const end = input.selectionEnd || 0;
  const value = input.value;
  input.value = value.slice(0, start) + text + value.slice(end);
  const newPos = start + text.length;
  input.focus();
  input.setSelectionRange(newPos, newPos);
  updateFileNameTemplatePreview();
}

function updateFileNameTemplatePreview() {
  const input = document.getElementById('fileNameTemplateInput');
  const previewEl = document.querySelector('.filename-template-preview');
  const previewValueEl = document.getElementById('fileNameTemplatePreview');

  const template = input.value;

  let ctx;
  if (videoPlayer.duration && currentVideoFile) {
    ctx = buildTemplateContext();
  } else {
    ctx = {};
    FileNameTemplate.TOKENS.forEach(t => { ctx[t.key] = t.example; });
  }

  const resolved = FileNameTemplate.resolve(template, ctx);

  if (!resolved) {
    previewValueEl.textContent = '（空 — 有効なテンプレートを入力してください）';
    previewEl.classList.add('invalid');
  } else {
    previewValueEl.textContent = `${resolved}.mp4`;
    previewEl.classList.remove('invalid');
  }
}

function saveFileNameTemplate() {
  const input = document.getElementById('fileNameTemplateInput');
  const template = input.value.trim();

  if (!template) {
    showToast('テンプレートを入力してください', 'warning');
    return;
  }

  const sampleCtx = {};
  FileNameTemplate.TOKENS.forEach(t => { sampleCtx[t.key] = t.example; });
  const resolved = FileNameTemplate.resolve(template, sampleCtx);
  if (!resolved) {
    showToast('解決後のファイル名が空になります。テンプレートを確認してください', 'error');
    return;
  }

  FileNameTemplate.set(template);
  if (videoPlayer.duration) autoGenerateFileName();
  closeFileNameTemplateModal();
  showToast('ファイル名テンプレートを保存しました', 'success');
}

function resetFileNameTemplate() {
  if (!confirm('ファイル名テンプレートを既定値に戻しますか？')) return;
  FileNameTemplate.reset();
  document.getElementById('fileNameTemplateInput').value = FileNameTemplate.DEFAULT;
  updateFileNameTemplatePreview();
  if (videoPlayer.duration) autoGenerateFileName();
  showToast('ファイル名テンプレートを既定値に戻しました', 'success');
}

// ファイル名テンプレートモーダルのイベント
document.getElementById('fileNameTemplateBtn').addEventListener('click', openFileNameTemplateModal);
document.getElementById('closeFileNameTemplateModal').addEventListener('click', closeFileNameTemplateModal);
document.getElementById('saveFileNameTemplateBtn').addEventListener('click', saveFileNameTemplate);
document.getElementById('resetFileNameTemplateBtn').addEventListener('click', resetFileNameTemplate);

document.querySelectorAll('.filename-template-preset-buttons [data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById('fileNameTemplateInput');
    input.value = btn.dataset.preset;
    updateFileNameTemplatePreview();
    input.focus();
  });
});

document.getElementById('fileNameTemplateModal').addEventListener('click', (e) => {
  if (e.target.id === 'fileNameTemplateModal') {
    closeFileNameTemplateModal();
  }
});
