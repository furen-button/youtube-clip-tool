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
const normalizeCheckbox = document.getElementById('normalizeCheckbox');
const zoomToTrimBtn = document.getElementById('zoomToTrimBtn');
const resetZoomBtn = document.getElementById('resetZoomBtn');

// トリミング関連の要素
const clipTimeline = document.getElementById('clipTimeline');
const clipTrack = document.getElementById('clipTrack');
const clipSelection = document.getElementById('clipSelection');
const clipHandleStart = document.getElementById('clipHandleStart');
const clipHandleEnd = document.getElementById('clipHandleEnd');
const clipPlayhead = document.getElementById('clipPlayhead');
const clipStartTimeLabel = document.getElementById('clipStartTime');
const clipEndTimeLabel = document.getElementById('clipEndTime');
// 全体ビュー（オーバービュー）の要素
const clipOverview = document.getElementById('clipOverview');
const clipOverviewTrack = document.getElementById('clipOverviewTrack');
const clipOverviewSelection = document.getElementById('clipOverviewSelection');
const clipOverviewViewport = document.getElementById('clipOverviewViewport');
const clipOverviewPlayhead = document.getElementById('clipOverviewPlayhead');
const clipOverviewStart = document.getElementById('clipOverviewStart');
const clipOverviewEnd = document.getElementById('clipOverviewEnd');
const clipOverviewRange = document.getElementById('clipOverviewRange');
const setStartBtn = document.getElementById('setStartBtn');
const setEndBtn = document.getElementById('setEndBtn');
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
// メインタイムラインバーは [viewStartTime, viewEndTime] の範囲を表示する
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

// コメント密度関連
const commentDensityContainer = document.getElementById('commentDensityContainer');
const commentDensityCanvas = document.getElementById('commentDensityCanvas');
const loadCommentsBtn = document.getElementById('loadCommentsBtn');
const downloadCommentsBtn = document.getElementById('downloadCommentsBtn');
let commentDensityData = null; // 密度データキャッシュ
let commentDensityVisible = false;

// 盛り上がり検出関連
const hotspotSection = document.getElementById('hotspotSection');
const hotspotThreshold = document.getElementById('hotspotThreshold');
const hotspotThresholdValue = document.getElementById('hotspotThresholdValue');
const hotspotCount = document.getElementById('hotspotCount');
const hotspotList = document.getElementById('hotspotList');
let detectedHotspots = []; // 検出された盛り上がり箇所
let liveChatComments = []; // 盛り上がりホバー時に表示するパース済みコメント
let liveChatCommentsVideoId = null; // 上記キャッシュの対象 videoId

// カテゴリ設定
const defaultCategories = ['面白い', '感動', '驚き', '癒し', '学び', 'その他'];
let availableCategories = [...defaultCategories];

/**
 * 入力履歴管理ユーティリティ
 * datalistと連動して、入力値を localStorage に保存・サジェスト表示する
 */
const InputHistory = {
  MAX: 20,
  STORAGE_PREFIX: 'inputHistory_',

  load(key) {
    try {
      const raw = localStorage.getItem(this.STORAGE_PREFIX + key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('履歴の読み込みエラー:', e);
      return [];
    }
  },

  save(key, value) {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    let list = this.load(key).filter(v => v !== trimmed);
    list.unshift(trimmed);
    if (list.length > this.MAX) list = list.slice(0, this.MAX);
    try {
      localStorage.setItem(this.STORAGE_PREFIX + key, JSON.stringify(list));
    } catch (e) {
      console.error('履歴の保存エラー:', e);
    }
  },

  remove(key, value) {
    const list = this.load(key).filter(v => v !== value);
    try {
      localStorage.setItem(this.STORAGE_PREFIX + key, JSON.stringify(list));
    } catch (e) {}
  },

  /**
   * .preset-chips コンテナに履歴をチップで描画
   * @param {string} key - 履歴のキー
   * @param {HTMLElement} container - コンテナ要素
   * @param {(value: string) => void} onApply - チップクリック時のコールバック
   * @param {() => void} [onAfterChange] - 削除後の追加処理（datalistリフレッシュ等）
   */
  renderChips(key, container, onApply, onAfterChange) {
    const list = this.load(key);
    container.innerHTML = '';
    list.forEach(value => {
      const chip = document.createElement('span');
      chip.className = 'preset-chip';
      chip.title = value;

      const label = document.createElement('span');
      label.className = 'preset-chip__label';
      label.textContent = value;
      chip.appendChild(label);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'preset-chip__remove';
      remove.textContent = '×';
      remove.title = '履歴から削除';
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        this.remove(key, value);
        this.renderChips(key, container, onApply, onAfterChange);
        if (onAfterChange) onAfterChange();
      });
      chip.appendChild(remove);

      chip.addEventListener('click', () => onApply(value));
      container.appendChild(chip);
    });
  },

  // input要素ごとのrefresh関数を保持（重複バインド防止用）
  _bound: new Map(),

  /**
   * input要素をdatalist履歴と紐付け、自動保存を有効にする
   * 同じinputに対する2度目以降の呼び出しはrefreshのみ実行する（重複イベント防止）
   * @param {HTMLInputElement} input - 対象のinput要素
   * @param {string} key - 履歴のキー
   * @param {object} options - { saveOnEnter, saveOnBlur, datalistId }
   */
  bind(input, key, options = {}) {
    const { saveOnEnter = true, saveOnBlur = true } = options;
    const datalistId = options.datalistId || `${input.id}-history`;
    let datalist = document.getElementById(datalistId);
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = datalistId;
      document.body.appendChild(datalist);
    }
    input.setAttribute('list', datalistId);

    const refresh = () => {
      const items = this.load(key);
      datalist.innerHTML = items
        .map(v => `<option value="${escapeHtml(v)}">`)
        .join('');
    };

    // すでにバインド済みなら refresh だけ呼んで終わる
    if (this._bound.has(input)) {
      refresh();
      return this._bound.get(input);
    }

    refresh();

    if (saveOnBlur) {
      input.addEventListener('blur', () => {
        this.save(key, input.value);
        refresh();
      });
    }
    if (saveOnEnter) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.save(key, input.value);
          refresh();
        }
      });
    }

    const handle = { refresh };
    this._bound.set(input, handle);
    return handle;
  },
};

/**
 * テキストプリセット管理（セリフ・メモなど用）
 * チップ形式で表示し、クリックで入力欄に挿入、×で削除
 */
const TextPresets = {
  MAX: 30,
  STORAGE_PREFIX: 'textPresets_',

  load(key) {
    try {
      const raw = localStorage.getItem(this.STORAGE_PREFIX + key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  save(key, list) {
    try {
      localStorage.setItem(this.STORAGE_PREFIX + key, JSON.stringify(list));
    } catch (e) {
      console.error('プリセットの保存エラー:', e);
    }
  },

  add(key, value) {
    const trimmed = (value || '').trim();
    if (!trimmed) return false;
    let list = this.load(key);
    if (list.includes(trimmed)) return false;
    list.unshift(trimmed);
    if (list.length > this.MAX) list = list.slice(0, this.MAX);
    this.save(key, list);
    return true;
  },

  remove(key, value) {
    const list = this.load(key).filter(v => v !== value);
    this.save(key, list);
  },

  /**
   * チップコンテナにプリセット一覧を描画
   * @param {string} key - プリセットのキー
   * @param {HTMLElement} container - .preset-chips 要素
   * @param {(value: string) => void} onApply - チップクリック時のコールバック
   */
  render(key, container, onApply) {
    const list = this.load(key);
    container.innerHTML = '';
    list.forEach(value => {
      const chip = document.createElement('span');
      chip.className = 'preset-chip';
      chip.title = value;

      const label = document.createElement('span');
      label.className = 'preset-chip__label';
      label.textContent = value;
      chip.appendChild(label);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'preset-chip__remove';
      remove.textContent = '×';
      remove.title = 'プリセットを削除';
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        this.remove(key, value);
        this.render(key, container, onApply);
      });
      chip.appendChild(remove);

      chip.addEventListener('click', () => onApply(value));
      container.appendChild(chip);
    });
  },
};

/**
 * 出力ファイル名テンプレート機能
 * トークン置換でファイル名（およびサブディレクトリ）を生成する。
 * テンプレート内の "/" はサブフォルダとして扱われる。
 */
const FileNameTemplate = {
  STORAGE_KEY: 'fileNameTemplate',
  DEFAULT: '{videoId}_{startAt}-{endAt}',

  /**
   * トークン定義一覧（モーダル表示・ヘルプ・解決処理で共用）
   */
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

  /**
   * トークンの値として安全な文字列に変換する。
   * パス区切り文字（/, \）はトークン値内では _ に置換し、テンプレートの "/" だけが
   * サブディレクトリ扱いとなるようにする。
   */
  sanitizeTokenValue(value) {
    if (value === undefined || value === null) return '';
    let s = String(value);
    // パス区切り・予約文字・制御文字を _ に置換
    s = s.replace(/[<>:"|?*\x00-\x1f/\\]/g, '_');
    // 連続する _ を圧縮
    s = s.replace(/_+/g, '_');
    return s.trim();
  },

  /**
   * テンプレート全体をパス（フォルダ含む）として正規化する。
   * - "/" はサブフォルダ区切り
   * - 各セグメントの先頭末尾の空白／ドットを削除
   * - 空セグメントを除去
   */
  normalizePath(rawPath) {
    const parts = rawPath
      .split('/')
      .map(s => s.replace(/[<>:"|?*\x00-\x1f\\]/g, '_').replace(/^[\s.]+|[\s.]+$/g, '').trim())
      .filter(s => s.length > 0);
    return parts.join('/');
  },

  /**
   * テンプレートをコンテキストで解決して、ファイル名（パス）を生成する。
   * @param {string} template
   * @param {object} ctx
   * @returns {string}
   */
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

  // 公開日: yt-dlp形式 (YYYYMMDD) を YYYY-MM-DD に整形
  let publishDate = '';
  if (m.uploadDate && /^\d{8}$/.test(m.uploadDate)) {
    publishDate = `${m.uploadDate.slice(0,4)}-${m.uploadDate.slice(4,6)}-${m.uploadDate.slice(6,8)}`;
  } else if (m.uploadDate) {
    publishDate = String(m.uploadDate);
  }

  // ダウンロード日: ISO -> YYYY-MM-DD
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
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2,'0')}-${String(m).padStart(2,'0')}-${String(s).padStart(2,'0')}`;
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

/**
 * タイムラインクリックモード（"seek" | "range15" | "range30"）
 * タイムラインバー/オーバービューをクリックした際の動作を切り替える
 * デフォルトは ±30秒 範囲設定（クリップ作成のメインフローに最適化）
 */
let timelineClickMode = 'range30';
function loadTimelineClickMode() {
  try {
    const saved = localStorage.getItem('timelineClickMode');
    if (saved && ['seek', 'range15', 'range30'].includes(saved)) {
      timelineClickMode = saved;
    }
  } catch (e) {}
}
function saveTimelineClickMode() {
  try { localStorage.setItem('timelineClickMode', timelineClickMode); } catch (e) {}
}

/**
 * 初期化処理
 */
function initialize() {
  // カテゴリをlocalStorageから読み込み
  loadCategories();

  // カテゴリボタンを生成
  renderCategoryButtons();

  // 微調整フレーム設定を読み込み
  loadFineTuneSettings();

  // 微調整ボタンのラベルを更新
  updateFineTuneButtonLabels();

  // 入力履歴の紐付け
  initInputHistories();

  // テキストプリセットの初期化
  initTextPresets();

  // タイムラインクリックモードを復元
  loadTimelineClickMode();
  setTimelineClickMode(timelineClickMode);

  // クリックモードボタンのイベント設定
  document.querySelectorAll('.btn-mode[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      setTimelineClickMode(btn.dataset.mode);
    });
  });

  // 現在位置から ±15/±30秒 範囲を作成するボタン
  const rangeFromCurrent = (range) => {
    if (!videoPlayer.duration) {
      showToast('動画を読み込んでください', 'warning');
      return;
    }
    applyCenteredRange(videoPlayer.currentTime, range, '現在位置を中心に範囲設定');
  };
  document.getElementById('rangeFromCurrent15Btn').addEventListener('click', () => rangeFromCurrent(15));
  document.getElementById('rangeFromCurrent30Btn').addEventListener('click', () => rangeFromCurrent(30));

  // メタデータフォームからカテゴリを直接追加
  initQuickAddCategory();
}

/**
 * メタデータフォーム内の「カテゴリ クイック追加」入力欄
 * 入力 + Enter または「＋ 追加」ボタンで availableCategories に追加し、選択状態にする
 */
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

    // 既存カテゴリなら選択状態のみ更新
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

    // 新規追加
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

/**
 * 入力履歴を各input要素に紐付け
 */
function initInputHistories() {
  InputHistory.bind(searchQuery, 'searchQuery');
  InputHistory.bind(downloadUrl, 'downloadUrl');
  InputHistory.bind(videoIdInput, 'videoId', { saveOnEnter: false });
  InputHistory.bind(serifInput, 'serif', { saveOnEnter: false });

  // 検索履歴をチップで可視化
  refreshSearchHistoryChips();
}

/**
 * 検索履歴チップを再描画
 */
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
      // 削除後は datalist も更新
      InputHistory.bind(searchQuery, 'searchQuery').refresh();
    }
  );
}

/**
 * テキストプリセット（セリフ・メモ）の初期化
 * 重複イベント防止のため、初回呼び出し時にのみイベントを登録する
 */
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
 * 微調整フレーム設定をlocalStorageから読み込み
 */
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

/**
 * 微調整フレーム設定をlocalStorageに保存
 */
function saveFineTuneSettings() {
  try {
    localStorage.setItem('fineTuneSettings', JSON.stringify(fineTuneSettings));
  } catch (error) {
    console.error('微調整設定の保存エラー:', error);
  }
}

/**
 * 微調整ボタンのラベルを更新
 */
function updateFineTuneButtonLabels() {
  const small = fineTuneSettings.smallFrames;
  const large = fineTuneSettings.largeFrames;
  
  // 設定値の表示を更新
  document.getElementById('smallFramesValue').textContent = small;
  document.getElementById('largeFramesValue').textContent = large;
  
  // ショートカットキーの表示名を取得
  const getKeyDisplay = (shortcutId, defaultKey) => {
    const shortcut = shortcuts[shortcutId];
    if (shortcut && shortcut.key) {
      return formatKeyName(shortcut.key);
    }
    return defaultKey;
  };
  
  // 開始位置ボタンのラベルとタイトルを更新
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
  
  // 終了位置ボタンのラベルとタイトルを更新
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
      // 検索成功時に履歴へ保存・チップを更新
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
 * 動画をダウンロード（画質選択モーダル経由）
 * 1. URL から動画情報を取得
 * 2. 画質選択モーダルを表示
 * 3. ユーザーが選んだ format ID で yt-dlp を実行
 */
async function downloadVideo() {
  const url = downloadUrl.value.trim();
  if (!url) {
    showStatus('YouTube URLを入力してください', 'error');
    return;
  }

  await openFormatSelectModal(url);
}

/**
 * 選択された format ID でダウンロードを開始
 * @param {string} url - YouTube動画のURL
 * @param {string|null} formatId - yt-dlp の format selector（null は既定値を使用）
 */
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
      showStatus(`ダウンロードが完了しました: ${result.data.filePath}`, 'success');
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

/**
 * 画質選択モーダルを開いて動画情報を取得・表示する
 */
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

/**
 * 動画情報をモーダルに描画し、画質オプションを生成する
 */
function renderFormatModal(url, info) {
  // 動画情報ヘッダー
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

  // 画質オプション一覧を生成
  const options = pickFormatOptions(info.formats || [], info.duration || 0);
  const listEl = document.getElementById('formatList');
  listEl.innerHTML = '';

  // 「自動（最高品質）」を先頭に追加
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

  // ボタンクリック → ダウンロード開始
  listEl.querySelectorAll('.format-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const formatId = btn.dataset.formatId || null;
      closeFormatSelectModal();
      startDownloadWithFormat(url, formatId);
    });
  });
}

/**
 * 1つの画質オプションをボタン要素として生成
 */
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

/**
 * フォーマット詳細を組み立てる（拡張子・コーデック・fps）
 */
function buildFormatDetails(opt) {
  const parts = [];
  if (opt.ext) parts.push(opt.ext);
  if (opt.fps) parts.push(`${opt.fps}fps`);
  if (opt.vcodec) parts.push(simplifyCodec(opt.vcodec));
  if (opt.acodec && opt.acodec !== 'none') parts.push(simplifyCodec(opt.acodec));
  return parts.join(' · ');
}

/**
 * コーデック文字列を短く整形（avc1.640028 → h264 など）
 */
function simplifyCodec(codec) {
  if (!codec) return '';
  if (codec.startsWith('avc1')) return 'h264';
  if (codec.startsWith('vp9')) return 'vp9';
  if (codec.startsWith('av01')) return 'av1';
  if (codec.startsWith('mp4a')) return 'aac';
  if (codec.startsWith('opus')) return 'opus';
  return codec.split('.')[0];
}

/**
 * yt-dlp formats 配列から画質ごとに代表フォーマットを選び、
 * サイズを推定してオプションリストを返す。
 *
 * @param {Array} formats - yt-dlp の formats 配列
 * @param {number} durationSec - 動画の長さ（秒）— サイズ推定に使用
 * @returns {Array<{formatId, height, ext, vcodec, acodec, fps, sizeBytes, label}>}
 */
function pickFormatOptions(formats, durationSec) {
  if (!Array.isArray(formats) || formats.length === 0) return [];

  // 動画ストリーム（vcodec が none でない）と音声ストリームを分離
  const videos = formats.filter(f => f.vcodec && f.vcodec !== 'none' && f.height);
  const audios = formats.filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'));

  // 最良の音声フォーマット（後でvideo-onlyとマージするため）
  const bestAudio = audios.reduce((best, f) => {
    if (!best) return f;
    return (f.tbr || 0) > (best.tbr || 0) ? f : best;
  }, null);

  // 解像度（height）ごとに最高ビットレートのフォーマットを選択
  const byHeight = new Map();
  for (const f of videos) {
    const h = f.height;
    const cur = byHeight.get(h);
    // 同一解像度では mp4 を優先 → ビットレートが高いもの
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
      // 単独で音声入りの統合フォーマット
      formatId = v.formatId;
      sizeBytes = v.filesize || v.filesizeApprox || estimateSize(v.tbr, durationSec);
      audioForLabel = v;
    } else if (bestAudio) {
      // video-only + best audio をマージ
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

  // 高画質順にソート
  options.sort((a, b) => b.height - a.height);
  return options;
}

/**
 * ビットレート（kbps）と長さ（秒）からファイルサイズを推定する。
 * @returns {number|null} バイト数（情報不足時は null）
 */
function estimateSize(tbrKbps, durationSec) {
  if (!tbrKbps || !durationSec) return null;
  return Math.round((tbrKbps * 1000 / 8) * durationSec);
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
              <div class="metadata-row">
                <span class="metadata-label">コメント:</span>
                <span class="badge ${file.hasLiveChat ? 'badge-success' : 'badge-muted'}">${file.hasLiveChat ? 'DL済み' : '未取得'}</span>
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

  // 動画切り替え時は前回動画のコメント密度・盛り上がりの状態を破棄
  resetCommentStateForVideoSwitch();

  // 現在の動画ファイル情報を保存
  currentVideoFile = {
    name: file.name,
    path: filePath,
    size: file.stats.size,
    hasLiveChat: file.hasLiveChat || false,
    metadata: file.metadata || null
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
    // サムネイルプレビュー用video にも同じURLをセット
    const thumbVideo = document.getElementById('thumbnailVideo');
    if (thumbVideo) {
      thumbVideo.src = url;
    }
    previewSection.style.display = 'block';
    videoPlayer.style.display = 'block';
    document.getElementById('videoToolbar').style.display = 'flex';
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
      
      // コメントボタンの見た目を更新
      updateCommentButtons();
      
      // 波形を自動表示
      showWaveform();
      
      // コメントDL済みなら密度を自動表示
      if (currentVideoFile && currentVideoFile.hasLiveChat) {
        // 波形ready後にコメント密度を表示（少し待つ）
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

// 再生時間をフォーマット (HH:MM:SS)
function formatDuration(seconds) {
  // 0秒は有効値として扱う（null/undefined/NaN/負値のみ「不明」）
  if (seconds == null || isNaN(seconds) || seconds < 0) return '不明';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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

// 時間を「HH:MM:SS.mmm」形式にフォーマット（微調整・タイムラインハンドル等の精密表示用）
function formatTimeWithMillis(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00:00.000';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

// トリミング時間表示を更新
function updateTrimDisplay() {
  const videoDuration = videoPlayer.duration || 0;
  
  trimState.duration = trimState.endTime - trimState.startTime;
  
  // タイムラインバーの表示を更新
  updateClipTimelineUI();
  
  // 波形のregionを更新
  updateWaveformRegion();
  
  // 波形のズームを更新
  updateWaveformZoom();
  
  // ファイル名を自動更新
  autoGenerateFileName();
  
  // クリップURLを自動更新
  autoGenerateClipUrl();
  
  // クリップパネルを更新
  updateClipPanel();
}

// クリップタイムラインバーの表示を更新
function updateClipTimelineUI() {
  const videoDuration = videoPlayer.duration || 0;
  if (!videoDuration) return;
  
  const viewStart = clipViewState.viewStartTime;
  const viewEnd = clipViewState.viewEndTime || videoDuration;
  const viewDuration = Math.max(0.001, viewEnd - viewStart);
  
  // メインタイムライン: viewStart〜viewEnd の範囲を 0%〜100% にマッピング
  const startPercent = ((trimState.startTime - viewStart) / viewDuration) * 100;
  const endPercent = ((trimState.endTime - viewStart) / viewDuration) * 100;
  
  // 表示範囲外でもハンドルが見切れないようclamp
  const clampedStart = Math.max(-1, Math.min(101, startPercent));
  const clampedEnd = Math.max(-1, Math.min(101, endPercent));
  
  clipHandleStart.style.left = `${clampedStart}%`;
  clipHandleEnd.style.left = `${clampedEnd}%`;
  
  // 選択範囲（表示範囲内のみ）
  const selStart = Math.max(0, Math.min(100, startPercent));
  const selEnd = Math.max(0, Math.min(100, endPercent));
  clipSelection.style.left = `${selStart}%`;
  clipSelection.style.width = `${Math.max(0, selEnd - selStart)}%`;
  
  // 表示範囲外なら半透明にしてユーザーに知らせる
  const startVisible = startPercent >= 0 && startPercent <= 100;
  const endVisible = endPercent >= 0 && endPercent <= 100;
  clipHandleStart.style.opacity = startVisible ? '1' : '0.3';
  clipHandleEnd.style.opacity = endVisible ? '1' : '0.3';
  
  // 時刻表示を更新
  clipStartTimeLabel.textContent = formatTimeWithMillis(trimState.startTime);
  clipEndTimeLabel.textContent = formatTimeWithMillis(trimState.endTime);
  
  // オーバービューも更新
  updateClipOverviewUI();
}

// 全体ビュー（オーバービュー）の表示を更新
function updateClipOverviewUI() {
  const videoDuration = videoPlayer.duration || 0;
  if (!videoDuration) return;
  
  // 選択範囲を全体に対する割合で表示
  const selStartPct = (trimState.startTime / videoDuration) * 100;
  const selEndPct = (trimState.endTime / videoDuration) * 100;
  clipOverviewSelection.style.left = `${selStartPct}%`;
  clipOverviewSelection.style.width = `${Math.max(0.2, selEndPct - selStartPct)}%`;
  
  // ビューポート（メインタイムラインの表示範囲）を全体に対して表示
  const viewStart = clipViewState.viewStartTime;
  const viewEnd = clipViewState.viewEndTime || videoDuration;
  const viewStartPct = (viewStart / videoDuration) * 100;
  const viewEndPct = (viewEnd / videoDuration) * 100;
  clipOverviewViewport.style.left = `${viewStartPct}%`;
  clipOverviewViewport.style.width = `${Math.max(0.5, viewEndPct - viewStartPct)}%`;
  
  // ラベル
  clipOverviewStart.textContent = formatTimeShort(viewStart);
  clipOverviewEnd.textContent = formatTimeShort(viewEnd);
  const viewDur = viewEnd - viewStart;
  if (Math.abs(viewDur - videoDuration) < 0.5) {
    clipOverviewRange.textContent = '全体表示中';
  } else {
    clipOverviewRange.textContent = `表示範囲: ${formatTimeShort(viewDur)}`;
  }
}

// クリップパネルは 3 列構成への変更で削除済み。
// 旧 updateClipPanel の呼び出し箇所が残っていてもクラッシュしないようにダミー関数を残す。
function updateClipPanel() {}

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
    // クリップタイムラインの表示範囲も波形と同期
    clipViewState.viewStartTime = displayStartTime;
    clipViewState.viewEndTime = displayEndTime;
    updateClipTimelineUI();
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

// トリミングの初期化
function initTrimSliders() {
  if (!videoPlayer.duration) return;
  
  const duration = videoPlayer.duration;
  trimState.startTime = 0;
  trimState.endTime = duration;
  
  // 表示範囲を全体に初期化
  clipViewState.viewStartTime = 0;
  clipViewState.viewEndTime = duration;
  
  updateTrimDisplay();
  initClipTimeline();
}

/**
 * タイムラインクリック時の共通処理
 * 修飾キー > クリックモードの優先順で動作を決定
 * @param {number} time - クリックされた位置の時間（秒）
 * @param {MouseEvent} event - クリックイベント
 */
function handleTimelineClick(time, event) {
  if (!videoPlayer.duration) return;

  // 修飾キーが優先（Shift=±15秒, Alt/Option=±30秒）
  if (event.shiftKey) {
    applyCenteredRange(time, 15, 'クリック位置を中心に範囲設定');
    return;
  }
  if (event.altKey) {
    applyCenteredRange(time, 30, 'クリック位置を中心に範囲設定');
    return;
  }

  // クリックモードに従って動作
  if (timelineClickMode === 'range15') {
    applyCenteredRange(time, 15, 'クリック位置を中心に範囲設定');
    return;
  }
  if (timelineClickMode === 'range30') {
    applyCenteredRange(time, 30, 'クリック位置を中心に範囲設定');
    return;
  }

  // デフォルト: 再生位置を移動
  videoPlayer.currentTime = time;
  if (videoPlayer.paused) {
    videoPlayer.play().catch(err => console.error('再生エラー:', err));
  }
}

/**
 * タイムラインクリックモードを設定し、UIに反映する
 * @param {'seek' | 'range15' | 'range30'} mode
 */
function setTimelineClickMode(mode) {
  if (!['seek', 'range15', 'range30'].includes(mode)) return;
  timelineClickMode = mode;
  saveTimelineClickMode();

  // ボタンのアクティブ状態を更新
  document.querySelectorAll('.btn-mode[data-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // タイムライン部のカーソルを変更（CSS class）
  const wrapper = document.querySelector('.clip-timeline-wrapper');
  if (wrapper) {
    wrapper.classList.toggle('timeline-mode-range', mode !== 'seek');
  }
}

/**
 * クリップタイムラインバーの初期化（ドラッグ処理）
 */
let clipTimelineInitialized = false;
function initClipTimeline() {
  if (clipTimelineInitialized) return;
  clipTimelineInitialized = true;
  
  let activeHandle = null; // 'start' | 'end' | 'selection' | 'overview-viewport' | null
  let dragStartX = 0;
  let dragStartStartTime = 0;
  let dragStartEndTime = 0;
  let dragStartViewStart = 0;
  let dragStartViewEnd = 0;

  // メインタイムラインの X座標 → 時間（表示範囲を考慮）
  function getTimeFromX(clientX) {
    const rect = clipTrack.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const ratio = x / rect.width;
    const viewStart = clipViewState.viewStartTime;
    const viewEnd = clipViewState.viewEndTime || (videoPlayer.duration || 0);
    return viewStart + ratio * (viewEnd - viewStart);
  }

  // オーバービューの X座標 → 時間（動画全体）
  function getOverviewTimeFromX(clientX) {
    const rect = clipOverviewTrack.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return (x / rect.width) * (videoPlayer.duration || 0);
  }

  // 開始ハンドルのドラッグ
  clipHandleStart.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    activeHandle = 'start';
    clipHandleStart.setPointerCapture(e.pointerId);
  });

  // 終了ハンドルのドラッグ
  clipHandleEnd.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    activeHandle = 'end';
    clipHandleEnd.setPointerCapture(e.pointerId);
  });

  // 選択範囲のドラッグ（全体移動）
  clipSelection.style.pointerEvents = 'auto';
  clipSelection.style.cursor = 'grab';
  clipSelection.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    activeHandle = 'selection';
    dragStartX = e.clientX;
    dragStartStartTime = trimState.startTime;
    dragStartEndTime = trimState.endTime;
    clipSelection.setPointerCapture(e.pointerId);
    clipSelection.style.cursor = 'grabbing';
  });

  // オーバービューのビューポートをドラッグして表示範囲を移動
  clipOverviewViewport.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    activeHandle = 'overview-viewport';
    dragStartX = e.clientX;
    dragStartViewStart = clipViewState.viewStartTime;
    dragStartViewEnd = clipViewState.viewEndTime;
    clipOverviewViewport.setPointerCapture(e.pointerId);
  });

  // オーバービューのトラッククリック
  // - 通常クリック: クリックモードに従って動作（移動 or ±15/30秒範囲設定）
  // - Shift+クリック: ±15秒で範囲設定（モード問わず）
  // - Alt+クリック: ±30秒で範囲設定（モード問わず）
  clipOverviewTrack.addEventListener('click', (e) => {
    if (e.target === clipOverviewViewport) return;
    if (!videoPlayer.duration) return;
    const time = getOverviewTimeFromX(e.clientX);
    handleTimelineClick(time, e);
  });

  // ドラッグ中の処理
  document.addEventListener('pointermove', (e) => {
    if (!activeHandle || !videoPlayer.duration) return;
    
    const duration = videoPlayer.duration;

    if (activeHandle === 'start') {
      let newStart = getTimeFromX(e.clientX);
      newStart = Math.max(0, Math.min(newStart, trimState.endTime - 0.1));
      trimState.startTime = newStart;
      updateTrimDisplay();
    } else if (activeHandle === 'end') {
      let newEnd = getTimeFromX(e.clientX);
      newEnd = Math.max(trimState.startTime + 0.1, Math.min(newEnd, duration));
      trimState.endTime = newEnd;
      updateTrimDisplay();
    } else if (activeHandle === 'selection') {
      const rect = clipTrack.getBoundingClientRect();
      const viewDur = (clipViewState.viewEndTime || duration) - clipViewState.viewStartTime;
      const deltaX = e.clientX - dragStartX;
      const deltaTime = (deltaX / rect.width) * viewDur;
      const rangeDuration = dragStartEndTime - dragStartStartTime;
      
      let newStart = dragStartStartTime + deltaTime;
      let newEnd = dragStartEndTime + deltaTime;
      
      if (newStart < 0) {
        newStart = 0;
        newEnd = rangeDuration;
      }
      if (newEnd > duration) {
        newEnd = duration;
        newStart = duration - rangeDuration;
      }
      
      trimState.startTime = newStart;
      trimState.endTime = newEnd;
      updateTrimDisplay();
    } else if (activeHandle === 'overview-viewport') {
      // ビューポートドラッグ → メインタイムラインの表示範囲を移動
      const overviewRect = clipOverviewTrack.getBoundingClientRect();
      const deltaX = e.clientX - dragStartX;
      const deltaTime = (deltaX / overviewRect.width) * duration;
      const viewDur = dragStartViewEnd - dragStartViewStart;
      
      let newViewStart = dragStartViewStart + deltaTime;
      let newViewEnd = dragStartViewEnd + deltaTime;
      
      if (newViewStart < 0) {
        newViewStart = 0;
        newViewEnd = viewDur;
      }
      if (newViewEnd > duration) {
        newViewEnd = duration;
        newViewStart = duration - viewDur;
      }
      
      setClipView(newViewStart, newViewEnd, true);
    }
  });

  // ドラッグ終了
  document.addEventListener('pointerup', (e) => {
    if (!activeHandle) return;
    
    const wasHandle = activeHandle;
    activeHandle = null;
    clipSelection.style.cursor = 'grab';
    
    // ドラッグ終了後に自動再生（ハンドル系のみ）
    if (wasHandle === 'start') {
      trimState.isLooping = true;
      loopCheckbox.checked = true;
      videoPlayer.currentTime = trimState.startTime;
      videoPlayer.play().catch(e => console.error('再生エラー:', e));
    } else if (wasHandle === 'end') {
      trimState.isLooping = true;
      loopCheckbox.checked = true;
      const playbackTime = Math.max(trimState.endTime - 2, trimState.startTime);
      videoPlayer.currentTime = playbackTime;
      videoPlayer.play().catch(e => console.error('再生エラー:', e));
    }
  });

  // メインタイムラインクリック
  // - 通常クリック: クリックモードに従って動作（移動 or ±15/30秒範囲設定）
  // - Shift+クリック: ±15秒で範囲設定（モード問わず）
  // - Alt+クリック: ±30秒で範囲設定（モード問わず）
  clipTrack.addEventListener('click', (e) => {
    if (e.target === clipHandleStart || e.target === clipHandleEnd ||
        e.target === clipSelection || e.target.closest('.clip-timeline__handle')) return;
    const time = getTimeFromX(e.clientX);
    handleTimelineClick(time, e);
  });

  // サムネイルプレビュー（メインタイムライン・オーバービュー両方）
  initThumbnailPreview(clipTrack, getTimeFromX);
  initThumbnailPreview(clipOverviewTrack, getOverviewTimeFromX);
}

/**
 * メインタイムラインの表示範囲を設定
 * @param {number} start - 表示開始時間（秒）
 * @param {number} end - 表示終了時間（秒）
 * @param {boolean} syncWavesurfer - 波形のズーム/スクロールも連動させるか
 */
function setClipView(start, end, syncWavesurfer = false) {
  const duration = videoPlayer.duration || 0;
  clipViewState.viewStartTime = Math.max(0, start);
  clipViewState.viewEndTime = Math.min(duration, end);
  updateClipTimelineUI();
  updateClipPlayhead();
  
  if (syncWavesurfer && wavesurfer) {
    try {
      const width = waveformContainer.clientWidth;
      const viewDur = clipViewState.viewEndTime - clipViewState.viewStartTime;
      if (viewDur > 0) {
        const zoomLevel = width / viewDur;
        wavesurfer.zoom(zoomLevel);
        wavesurfer.setScrollTime(clipViewState.viewStartTime);
      }
    } catch (error) {
      console.error('波形連動エラー:', error);
    }
  }
}

/**
 * タイムライン要素にホバーサムネイルプレビューを設定
 * @param {HTMLElement} trackEl - ホバー対象のトラック要素
 * @param {(clientX: number) => number} timeFromX - X座標から時刻に変換する関数
 */
function initThumbnailPreview(trackEl, timeFromX) {
  const tooltip = document.getElementById('clipThumbnailTooltip');
  const canvas = document.getElementById('clipThumbnailCanvas');
  const timeLabel = document.getElementById('clipThumbnailTime');
  const ctx = canvas.getContext('2d');
  
  let pendingTime = null;
  let isCapturing = false;
  let lastX = 0;
  
  // サムネイルvideoのフレームをキャンバスに描画
  async function captureFrame(time) {
    const thumbVideo = document.getElementById('thumbnailVideo');
    if (!thumbVideo || !thumbVideo.duration) return;
    
    isCapturing = true;
    return new Promise((resolve) => {
      const onSeeked = () => {
        try {
          ctx.drawImage(thumbVideo, 0, 0, canvas.width, canvas.height);
        } catch (e) {
          // フレーム未準備時は無視
        }
        thumbVideo.removeEventListener('seeked', onSeeked);
        isCapturing = false;
        resolve();
        // 待機していた最新時刻があればそちらをキャプチャ
        if (pendingTime !== null) {
          const next = pendingTime;
          pendingTime = null;
          captureFrame(next);
        }
      };
      thumbVideo.addEventListener('seeked', onSeeked);
      thumbVideo.currentTime = Math.max(0, Math.min(time, thumbVideo.duration - 0.001));
    });
  }
  
  trackEl.addEventListener('mousemove', (e) => {
    if (!videoPlayer.duration) return;
    
    const time = timeFromX(e.clientX);
    lastX = e.clientX;
    
    // ツールチップ位置・時刻表示は即座に更新
    tooltip.style.display = 'block';
    tooltip.style.left = `${e.clientX}px`;
    const rect = trackEl.getBoundingClientRect();
    tooltip.style.top = `${rect.top}px`;
    timeLabel.textContent = formatTimeShort(time);
    
    // フレームキャプチャはスロットリング
    if (isCapturing) {
      pendingTime = time;
    } else {
      captureFrame(time);
    }
  });
  
  trackEl.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
    pendingTime = null;
  });
}

// 再生ヘッドの更新
function updateClipPlayhead() {
  if (!videoPlayer.duration) return;
  const currentTime = videoPlayer.currentTime;
  const duration = videoPlayer.duration;
  
  // メインタイムライン: 表示範囲内なら表示
  const viewStart = clipViewState.viewStartTime;
  const viewEnd = clipViewState.viewEndTime || duration;
  const viewDur = Math.max(0.001, viewEnd - viewStart);
  const mainPercent = ((currentTime - viewStart) / viewDur) * 100;
  
  if (mainPercent >= 0 && mainPercent <= 100) {
    clipPlayhead.style.display = 'block';
    clipPlayhead.style.left = `${mainPercent}%`;
  } else {
    clipPlayhead.style.display = 'none';
  }
  
  // オーバービュー: 動画全体に対する位置
  const overviewPercent = (currentTime / duration) * 100;
  clipOverviewPlayhead.style.left = `${overviewPercent}%`;
}

// 再生ヘッドをtimeupdateで同期
videoPlayer.addEventListener('timeupdate', updateClipPlayhead);

// requestAnimationFrameで滑らかに再生ヘッドを更新
let playheadAnimationId = null;
function animatePlayhead() {
  updateClipPlayhead();
  if (!videoPlayer.paused) {
    playheadAnimationId = requestAnimationFrame(animatePlayhead);
  }
}
videoPlayer.addEventListener('play', () => {
  if (playheadAnimationId) cancelAnimationFrame(playheadAnimationId);
  animatePlayhead();
});
videoPlayer.addEventListener('pause', () => {
  if (playheadAnimationId) {
    cancelAnimationFrame(playheadAnimationId);
    playheadAnimationId = null;
  }
});

// 現在位置を開始位置に設定
setStartBtn.addEventListener('click', () => {
  if (!videoPlayer.duration) return;
  
  const currentTime = videoPlayer.currentTime;
  
  // 終了位置より前であることを確認
  if (currentTime < trimState.endTime) {
    trimState.startTime = currentTime;
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
  
  // 開始位置より後であることを確認
  if (currentTime > trimState.startTime) {
    trimState.endTime = currentTime;
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

// ループ再生チェックボックスの変更
loopCheckbox.addEventListener('change', () => {
  trimState.isLooping = loopCheckbox.checked;
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
document.getElementById('startMinusLargeFrameBtn').addEventListener('click', () => adjustStartTime(-fineTuneSettings.largeFrames));
document.getElementById('startMinusSmallFrameBtn').addEventListener('click', () => adjustStartTime(-fineTuneSettings.smallFrames));
document.getElementById('startPlusSmallFrameBtn').addEventListener('click', () => adjustStartTime(fineTuneSettings.smallFrames));
document.getElementById('startPlusLargeFrameBtn').addEventListener('click', () => adjustStartTime(fineTuneSettings.largeFrames));

// 終了位置の微調整
document.getElementById('endMinusLargeFrameBtn').addEventListener('click', () => adjustEndTime(-fineTuneSettings.largeFrames));
document.getElementById('endMinusSmallFrameBtn').addEventListener('click', () => adjustEndTime(-fineTuneSettings.smallFrames));
document.getElementById('endPlusSmallFrameBtn').addEventListener('click', () => adjustEndTime(fineTuneSettings.smallFrames));
document.getElementById('endPlusLargeFrameBtn').addEventListener('click', () => adjustEndTime(fineTuneSettings.largeFrames));

// 開始位置を調整
function adjustStartTime(frames) {
  if (!videoPlayer.duration) return;
  
  const adjustSeconds = framesToSeconds(frames);
  let newStartTime = trimState.startTime + adjustSeconds;
  
  // 範囲チェック
  newStartTime = Math.max(0, Math.min(newStartTime, trimState.endTime - 0.1));
  
  // trimStateを直接更新
  trimState.startTime = newStartTime;
  updateTrimDisplay();
  
  // ループ再生をONにして開始位置から再生
  trimState.isLooping = true;
  loopCheckbox.checked = true;
  videoPlayer.currentTime = newStartTime;
  videoPlayer.play().catch(e => console.error('再生エラー:', e));
}

// 終了位置を調整
function adjustEndTime(frames) {
  if (!videoPlayer.duration) return;
  
  const adjustSeconds = framesToSeconds(frames);
  let newEndTime = trimState.endTime + adjustSeconds;
  
  // 範囲チェック
  newEndTime = Math.max(trimState.startTime + 0.1, Math.min(newEndTime, videoPlayer.duration));
  
  // trimStateを直接更新
  trimState.endTime = newEndTime;
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
// precomputedPeaks: 事前生成したpeaksデータ（長時間動画でOOMを回避するため）
function initWaveSurfer(precomputedPeaks = null, videoDuration = null) {
  if (wavesurfer) {
    wavesurfer.destroy();
  }

  const wsOptions = {
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
  };

  // peaksを渡すとWaveSurferはWeb Audio APIによるデコードをスキップする
  if (precomputedPeaks && videoDuration) {
    wsOptions.peaks = [precomputedPeaks];
    wsOptions.duration = videoDuration;
  }

  wavesurfer = WaveSurfer.create(wsOptions);

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

      // タイムラインバーの表示を更新
      updateClipTimelineUI();
      // ファイル名・URL・クリップパネルも更新
      autoGenerateFileName();
      autoGenerateClipUrl();
      updateClipPanel();
      
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

  // 波形のスクロール/ズーム変更時にクリップタイムラインの表示範囲も同期
  wavesurfer.on('scroll', (visibleStartTime, visibleEndTime) => {
    if (typeof visibleStartTime === 'number' && typeof visibleEndTime === 'number') {
      clipViewState.viewStartTime = visibleStartTime;
      clipViewState.viewEndTime = visibleEndTime;
      updateClipTimelineUI();
    }
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

// 1時間以上の動画は事前生成peaksを使ってOOMクラッシュを回避する
const LONG_VIDEO_THRESHOLD_SEC = 3600;

// 波形表示を自動的に表示
async function showWaveform() {
  if (!videoPlayer.src) {
    return;
  }

  waveformVisible = true;
  waveformContainer.style.display = 'block';
  waveformLoading.style.display = 'block';
  waveformLoading.textContent = '波形を生成中...';
  zoomToTrimBtn.style.display = 'inline-block';
  resetZoomBtn.style.display = 'inline-block';

  try {
    const duration = videoPlayer.duration;
    const isLongVideo = isFinite(duration) && duration >= LONG_VIDEO_THRESHOLD_SEC;

    if (isLongVideo && currentVideoFile && currentVideoFile.path) {
      waveformLoading.textContent = '長時間動画の波形データを準備中...（初回は数十秒かかります）';
      const result = await window.electronAPI.generateWaveformPeaks(currentVideoFile.path);
      if (result.success) {
        initWaveSurfer(result.peaks, result.duration);
      } else {
        console.warn('波形Peaks生成失敗。フォールバックします:', result.error);
        waveformLoading.textContent = '波形を生成中...';
        initWaveSurfer();
      }
    } else {
      initWaveSurfer();
    }
  } catch (error) {
    console.error('波形の読み込みエラー:', error);
    waveformLoading.textContent = '波形の生成に失敗しました';
  }
}

// 正規化チェックボックスの変更
normalizeCheckbox.addEventListener('change', () => {
  if (wavesurfer && waveformVisible) {
    // 波形を再生成
    if (wavesurfer) {
      wavesurfer.destroy();
      wavesurfer = null;
      wavesurferRegions = null;
      trimRegion = null;
    }
    showWaveform();
  }
});

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

// ファイル名の自動生成関数（テンプレートに従って生成）
function autoGenerateFileName() {
  if (!videoPlayer.duration) return;

  const fileName = FileNameTemplate.resolve(
    FileNameTemplate.get(),
    buildTemplateContext()
  );

  // 解決後が空（必須トークンが空など）の場合は更新しない
  if (!fileName) return;

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

/**
 * 現在の動画から YouTube URL を解決する
 * 優先順位: メタデータの url → メタデータの videoId → ファイル名から抽出した videoId → metadata.videoId
 * @returns {string} 解決できなかった場合は空文字列
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
 * 「動画を書き出し」と同等の yt-dlp コマンド文字列を生成する。
 * 端末にそのまま貼り付けて実行できるようにシェルクォートする。
 * @param {string} url - YouTube URL
 * @param {number} startTime - 開始秒
 * @param {number} endTime - 終了秒
 * @param {string} fileName - 出力ファイル名（拡張子なし、サブディレクトリ可）
 * @returns {string}
 */
function buildExportCommand(url, startTime, endTime, fileName) {
  const start = Number(startTime).toFixed(3);
  const end = Number(endTime).toFixed(3);
  const outPath = `output/movies/${fileName}.mp4`;
  // POSIX シェル風シングルクォート。文字列中の ' は '\'' で閉じて再オープンする。
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

// メタデータの保存（JSON）
saveMetadataBtn.addEventListener('click', async () => {
  // フォームデータを収集
  metadata.videoId = videoIdInput.value.trim();
  metadata.fileName = fileNameInput.value.trim();
  metadata.serif = serifInput.value.trim();
  metadata.ruby = rubyInput.value.trim();
  metadata.clipUrl = clipUrlInput.value.trim();
  metadata.memo = memoInput.value.trim();

  // 書き出しコマンドを生成（URLが解決できる場合のみ）
  const exportUrl = resolveYouTubeUrlForCurrentVideo();
  const saveFileName = metadata.fileName || 'metadata';
  const exportCommand = exportUrl
    ? buildExportCommand(exportUrl, trimState.startTime, trimState.endTime, saveFileName)
    : null;

  // トリミング情報も含める
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
    // IPCを使ってoutput/jsonディレクトリに保存
    const result = await window.electronAPI.saveMetadata(saveData, metadata.fileName || 'metadata');

    if (result.success) {
      showToast(`メタデータを保存しました\n保存先: ${result.filePath}`, 'success', 5000);
      // 保存成功時に履歴へ追加
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

// 動画を書き出し（YouTubeから指定区間のみダウンロード + mp4再エンコード）
exportVideoBtn.addEventListener('click', async () => {
  // 動画が読み込まれているか確認
  if (!currentVideoFile) {
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

  // YouTube URL を解決する
  const url = resolveYouTubeUrlForCurrentVideo();
  if (!url) {
    showToast('YouTubeのURLまたは動画IDを特定できませんでした', 'error');
    return;
  }

  try {
    // ボタンを無効化
    exportVideoBtn.disabled = true;
    exportVideoBtn.textContent = '書き出し中...';

    // 進捗をトーストではなくボタン表示に反映する
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

    // YouTubeから区間ダウンロード + mp4再エンコード
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
    // ボタンを有効化
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
serifInput.addEventListener('input', (e) => {
  metadata.serif = e.target.value.trim();
  autoGenerateFileName();
});
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
  startMinusLarge: { key: 'KeyQ', ctrl: false, shift: false, alt: false, action: '開始-大フレーム', description: 'トリミング開始位置を大フレーム数前に移動' },
  startMinusSmall: { key: 'KeyW', ctrl: false, shift: false, alt: false, action: '開始-小フレーム', description: 'トリミング開始位置を小フレーム数前に移動' },
  startPlusSmall: { key: 'KeyE', ctrl: false, shift: false, alt: false, action: '開始+小フレーム', description: 'トリミング開始位置を小フレーム数後に移動' },
  startPlusLarge: { key: 'KeyR', ctrl: false, shift: false, alt: false, action: '開始+大フレーム', description: 'トリミング開始位置を大フレーム数後に移動' },
  endMinusLarge: { key: 'KeyA', ctrl: false, shift: false, alt: false, action: '終了-大フレーム', description: 'トリミング終了位置を大フレーム数前に移動' },
  endMinusSmall: { key: 'KeyS', ctrl: false, shift: false, alt: false, action: '終了-小フレーム', description: 'トリミング終了位置を小フレーム数前に移動' },
  endPlusSmall: { key: 'KeyD', ctrl: false, shift: false, alt: false, action: '終了+小フレーム', description: 'トリミング終了位置を小フレーム数後に移動' },
  endPlusLarge: { key: 'KeyF', ctrl: false, shift: false, alt: false, action: '終了+大フレーム', description: 'トリミング終了位置を大フレーム数後に移動' },
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
    updateFineTuneButtonLabels(); // 微調整ボタンのラベルを更新
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
  updateFineTuneButtonLabels(); // 微調整ボタンのラベルを更新
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
      
    case 'zoomCycle':
      if (!videoLoaded) return;
      cycleZoomPadding();
      break;
      
    case 'startMinusLarge':
      if (!videoLoaded) return;
      adjustStartTime(-fineTuneSettings.largeFrames);
      break;
      
    case 'startMinusSmall':
      if (!videoLoaded) return;
      adjustStartTime(-fineTuneSettings.smallFrames);
      break;
      
    case 'startPlusSmall':
      if (!videoLoaded) return;
      adjustStartTime(fineTuneSettings.smallFrames);
      break;
      
    case 'startPlusLarge':
      if (!videoLoaded) return;
      adjustStartTime(fineTuneSettings.largeFrames);
      break;
      
    case 'endMinusLarge':
      if (!videoLoaded) return;
      adjustEndTime(-fineTuneSettings.largeFrames);
      break;
      
    case 'endMinusSmall':
      if (!videoLoaded) return;
      adjustEndTime(-fineTuneSettings.smallFrames);
      break;
      
    case 'endPlusSmall':
      if (!videoLoaded) return;
      adjustEndTime(fineTuneSettings.smallFrames);
      break;
      
    case 'endPlusLarge':
      if (!videoLoaded) return;
      adjustEndTime(fineTuneSettings.largeFrames);
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

/**
 * 出力ファイル名テンプレート設定モーダル
 */
function openFileNameTemplateModal() {
  const modal = document.getElementById('fileNameTemplateModal');
  modal.classList.add('active');

  const input = document.getElementById('fileNameTemplateInput');
  input.value = FileNameTemplate.get();

  renderTokenCards();
  updateFileNameTemplatePreview();

  // 入力時にプレビューを更新
  input.oninput = updateFileNameTemplatePreview;

  setTimeout(() => input.focus(), 50);
}

function closeFileNameTemplateModal() {
  const modal = document.getElementById('fileNameTemplateModal');
  modal.classList.remove('active');
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

  // サンプルコンテキスト（実データがあれば優先、なければトークン定義の example を使用）
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

  // 解決後に空にならないかチェック
  const sampleCtx = {};
  FileNameTemplate.TOKENS.forEach(t => { sampleCtx[t.key] = t.example; });
  const resolved = FileNameTemplate.resolve(template, sampleCtx);
  if (!resolved) {
    showToast('解決後のファイル名が空になります。テンプレートを確認してください', 'error');
    return;
  }

  FileNameTemplate.set(template);
  // 現在編集中の動画があれば即座にファイル名を更新
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

// 全設定をリセット
function resetAllSettings() {
  if (!confirm('全ての設定をデフォルトに戻しますか？\n\n以下の設定がリセットされます：\n・カテゴリ設定\n・キーボードショートカット\n・微調整フレーム設定\n・入力履歴（検索/URL/Video ID/セリフ）\n・テキストプリセット（セリフ/メモ）\n・タイムラインクリックモード\n・ファイル名テンプレート\n・編集タブの列幅\n\nこの操作は取り消せません。')) {
    return;
  }

  try {
    // localStorageから全設定を削除
    localStorage.removeItem('availableCategories');
    localStorage.removeItem('keyboardShortcuts');
    localStorage.removeItem('fineTuneSettings');
    localStorage.removeItem('timelineClickMode');
    localStorage.removeItem(FileNameTemplate.STORAGE_KEY);
    ColumnResizer.reset();

    // 入力履歴をクリア
    ['searchQuery', 'downloadUrl', 'videoId', 'serif'].forEach(key => {
      localStorage.removeItem(InputHistory.STORAGE_PREFIX + key);
    });

    // テキストプリセットをクリア
    ['serif', 'memo'].forEach(key => {
      localStorage.removeItem(TextPresets.STORAGE_PREFIX + key);
    });

    // カテゴリをデフォルトに戻す
    availableCategories = [...defaultCategories];
    metadata.categories = metadata.categories.filter(c => availableCategories.includes(c));
    renderCategoryList();
    renderCategoryButtons();
    updateSelectedCategories();

    // ショートカットをデフォルトに戻す
    shortcuts = { ...defaultShortcuts };
    renderShortcutList();

    // 微調整フレーム設定をデフォルトに戻す
    fineTuneSettings = { smallFrames: 1, largeFrames: 15 };
    updateFineTuneButtonLabels();

    // クリックモードをseekに戻す
    setTimelineClickMode('seek');

    // datalist履歴とプリセットチップを再描画
    initInputHistories();
    initTextPresets();

    showToast('全ての設定をデフォルトに戻しました', 'success');
  } catch (error) {
    console.error('設定のリセットに失敗:', error);
    showToast('設定のリセットに失敗しました', 'error');
  }
}

// イベントリスナー設定

// 微調整フレーム設定の+-ボタン
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

// 画質選択モーダル関連
document.getElementById('closeFormatModal').addEventListener('click', closeFormatSelectModal);
document.getElementById('cancelFormatBtn').addEventListener('click', closeFormatSelectModal);
document.getElementById('formatSelectModal').addEventListener('click', (e) => {
  if (e.target.id === 'formatSelectModal') closeFormatSelectModal();
});

// 出力ファイル名テンプレート設定モーダル関連
document.getElementById('fileNameTemplateBtn').addEventListener('click', openFileNameTemplateModal);
document.getElementById('closeFileNameTemplateModal').addEventListener('click', closeFileNameTemplateModal);
document.getElementById('saveFileNameTemplateBtn').addEventListener('click', saveFileNameTemplate);
document.getElementById('resetFileNameTemplateBtn').addEventListener('click', resetFileNameTemplate);

// プリセットボタン: クリックでテンプレートを適用
document.querySelectorAll('.filename-template-preset-buttons [data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById('fileNameTemplateInput');
    input.value = btn.dataset.preset;
    updateFileNameTemplatePreview();
    input.focus();
  });
});

// モーダル外クリックで閉じる
document.getElementById('fileNameTemplateModal').addEventListener('click', (e) => {
  if (e.target.id === 'fileNameTemplateModal') {
    closeFileNameTemplateModal();
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

/**
 * ライブチャット コメント密度表示機能
 */

/**
 * コメント関連ボタンの見た目を更新
 */
/**
 * 動画切り替え時にコメント密度・盛り上がり関連の状態と UI を初期化する。
 * 前回動画のキャッシュ／チップが残ったまま新動画に持ち越されるのを防ぐ。
 */
function resetCommentStateForVideoSwitch() {
  // 密度データとキャンバスを破棄
  commentDensityData = null;
  commentDensityVisible = false;
  if (commentDensityContainer) commentDensityContainer.style.display = 'none';

  // 盛り上がりリストとチップを破棄
  detectedHotspots = [];
  if (hotspotSection) hotspotSection.style.display = 'none';
  if (hotspotList) hotspotList.innerHTML = '';
  if (hotspotCount) hotspotCount.textContent = '';

  // ツールチップ用コメントキャッシュを破棄して、開いていれば閉じる
  liveChatComments = [];
  liveChatCommentsVideoId = null;
  if (typeof HotspotTooltip !== 'undefined' && HotspotTooltip && HotspotTooltip.hide) {
    HotspotTooltip.hide();
  }
}

function updateCommentButtons() {
  const hasChat = currentVideoFile && currentVideoFile.hasLiveChat;
  if (hasChat) {
    // DL済み: 密度ボタンを目立たせる
    loadCommentsBtn.classList.remove('btn-warning');
    loadCommentsBtn.classList.add('btn-success');
    loadCommentsBtn.textContent = '💬 密度';
    loadCommentsBtn.title = 'ライブチャットコメント密度の表示切替（DL済み）';
    downloadCommentsBtn.title = 'ライブチャットを再ダウンロード（既に取得済み）';
  } else {
    // 未DL: 取得を促す
    loadCommentsBtn.classList.remove('btn-success');
    loadCommentsBtn.classList.add('btn-warning');
    loadCommentsBtn.textContent = '💬 密度';
    loadCommentsBtn.title = 'ライブチャットコメント密度を表示（先にDLが必要）';
    downloadCommentsBtn.title = 'ライブチャットを yt-dlp でダウンロード';
  }
}

/**
 * コメント密度データを読み込み、キャンバスに描画
 * @param {boolean} autoMode - trueの場合は自動表示（トグルしない）
 */
async function loadAndShowCommentDensity(autoMode = false) {
  const videoId = metadata.videoId || videoIdInput.value.trim();
  if (!videoId) {
    showToast('Video IDが設定されていません', 'warning');
    return;
  }

  if (!videoPlayer.duration) {
    showToast('動画を読み込んでください', 'warning');
    return;
  }

  try {
    // 密度すでに表示中ならトグルで非表示（自動モードではトグルしない）
    if (!autoMode && commentDensityVisible && commentDensityData) {
      commentDensityContainer.style.display = 'none';
      hotspotSection.style.display = 'none';
      commentDensityVisible = false;
      loadCommentsBtn.textContent = '💬 密度';
      showToast('コメント密度表示をOFFにしました', 'info');
      return;
    }

    // 自動モードで既に表示済みなら何もしない
    if (autoMode && commentDensityVisible && commentDensityData) {
      return;
    }

    loadCommentsBtn.textContent = '読込中...';
    loadCommentsBtn.disabled = true;

    // 動画の長さに応じて集計間隔を自動調整
    const duration = videoPlayer.duration;
    let intervalSec = 5;
    if (duration > 7200) intervalSec = 30;      // 2時間以上: 30秒間隔
    else if (duration > 3600) intervalSec = 15;  // 1時間以上: 15秒間隔
    else if (duration > 1800) intervalSec = 10;  // 30分以上: 10秒間隔

    const result = await window.electronAPI.getCommentDensity(videoId, intervalSec);

    if (!result.success || !result.data.exists) {
      showToast('コメントデータが見つかりません。↻ DLボタンで先にダウンロードしてください。', 'warning');
      loadCommentsBtn.textContent = '💬 密度';
      loadCommentsBtn.disabled = false;
      return;
    }

    commentDensityData = result.data;
    commentDensityVisible = true;
    commentDensityContainer.style.display = 'block';

    drawCommentDensity();

    // 盛り上がり検出を実行・表示
    hotspotSection.style.display = 'block';
    detectAndShowHotspots();

    loadCommentsBtn.textContent = '💬 ON';
    loadCommentsBtn.disabled = false;
    showToast(`コメント密度を表示（${result.data.totalComments}件, ${intervalSec}秒間隔）`, 'success');
  } catch (error) {
    console.error('コメント密度の読み込みエラー:', error);
    showToast(`コメント密度の読み込みに失敗: ${error.message}`, 'error');
    loadCommentsBtn.textContent = '💬 密度';
    loadCommentsBtn.disabled = false;
  }
}

/**
 * コメント密度をCanvasに描画
 */
function drawCommentDensity() {
  if (!commentDensityData || !commentDensityData.density) return;

  const canvas = commentDensityCanvas;
  const container = commentDensityContainer;
  const ctx = canvas.getContext('2d');

  // Canvas解像度をコンテナサイズに合わせる
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const { density, maxCount } = commentDensityData;
  const videoDuration = videoPlayer.duration || 1;

  // 背景クリア
  ctx.clearRect(0, 0, width, height);

  if (density.length === 0 || maxCount === 0) return;

  // 各バケットの棒グラフを描画
  const barCount = density.length;

  for (let i = 0; i < barCount; i++) {
    const bucket = density[i];
    // 動画全体に対するこのバケットの位置（0-1）
    const xStart = (bucket.startTime / videoDuration) * width;
    const xEnd = (bucket.endTime / videoDuration) * width;
    const barWidth = Math.max(xEnd - xStart, 1);

    // 高さ（密度に比例）
    const ratio = bucket.count / maxCount;
    const barHeight = ratio * (height - 4); // 上下2pxマージン

    // 色: 青(少) → 黄(中) → 赤(多) のグラデーション
    const color = getDensityColor(ratio);

    ctx.fillStyle = color;
    ctx.fillRect(xStart, height - barHeight - 2, barWidth, barHeight);
  }

  // 平均ラインを描画
  const avgRatio = commentDensityData.avgCount / maxCount;
  const avgY = height - (avgRatio * (height - 4)) - 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, avgY);
  ctx.lineTo(width, avgY);
  ctx.stroke();
  ctx.setLineDash([]);

  // 閾値ラインを描画
  const threshold = parseFloat(hotspotThreshold.value) || 2.0;
  const thresholdCount = commentDensityData.avgCount * threshold;
  if (thresholdCount <= maxCount) {
    const thresholdRatio = thresholdCount / maxCount;
    const thresholdY = height - (thresholdRatio * (height - 4)) - 2;
    ctx.strokeStyle = 'rgba(229, 62, 62, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(0, thresholdY);
    ctx.lineTo(width, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 盛り上がり箇所のハイライト描画
  if (detectedHotspots.length > 0) {
    for (const hotspot of detectedHotspots) {
      const xStart = (hotspot.startTime / videoDuration) * width;
      const xEnd = (hotspot.endTime / videoDuration) * width;
      const hsWidth = Math.max(xEnd - xStart, 2);

      // 三角マーカーを上部に描画
      ctx.fillStyle = 'rgba(229, 62, 62, 0.9)';
      const centerX = xStart + hsWidth / 2;
      ctx.beginPath();
      ctx.moveTo(centerX - 4, 0);
      ctx.lineTo(centerX + 4, 0);
      ctx.lineTo(centerX, 6);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/**
 * 密度比率から色を生成（青→黄→赤のグラデーション）
 * @param {number} ratio - 0〜1の比率
 * @returns {string} CSS色文字列
 */
function getDensityColor(ratio) {
  // 0: 青 → 0.5: 黄 → 1.0: 赤
  let r, g, b;
  if (ratio < 0.5) {
    const t = ratio * 2; // 0-1
    r = Math.round(50 + t * 205);   // 50 → 255
    g = Math.round(100 + t * 155);  // 100 → 255
    b = Math.round(200 - t * 200);  // 200 → 0
  } else {
    const t = (ratio - 0.5) * 2; // 0-1
    r = 255;
    g = Math.round(255 - t * 200);  // 255 → 55
    b = Math.round(t * 30);         // 0 → 30
  }
  return `rgba(${r}, ${g}, ${b}, 0.85)`;
}

/**
 * ライブチャットデータをダウンロード
 */
async function downloadLiveChatData() {
  const videoId = metadata.videoId || videoIdInput.value.trim();
  if (!videoId) {
    showToast('Video IDが設定されていません', 'warning');
    return;
  }

  const originalHTML = downloadCommentsBtn.innerHTML;
  try {
    downloadCommentsBtn.textContent = '...';
    downloadCommentsBtn.disabled = true;
    showToast('ライブチャットデータをダウンロード中...', 'info', 5000);

    const result = await window.electronAPI.downloadLiveChat(videoId);

    if (result.success) {
      showToast(`ライブチャットをダウンロードしました（${result.data.commentCount}件）`, 'success');
      // DL済み状態を更新
      if (currentVideoFile) {
        currentVideoFile.hasLiveChat = true;
      }
      updateCommentButtons();
      // ダウンロード後、密度表示を自動的にON
      commentDensityData = null; // キャッシュクリア
      liveChatComments = [];
      liveChatCommentsVideoId = null;
      await loadAndShowCommentDensity(true);
    } else {
      showToast(`ダウンロードに失敗: ${result.error}`, 'error');
    }
  } catch (error) {
    showToast(`ダウンロードエラー: ${error.message}`, 'error');
  } finally {
    downloadCommentsBtn.innerHTML = originalHTML;
    downloadCommentsBtn.disabled = false;
  }
}

// コメント密度ボタンのイベントリスナー
loadCommentsBtn.addEventListener('click', () => loadAndShowCommentDensity(false));
downloadCommentsBtn.addEventListener('click', downloadLiveChatData);

// 盛り上がり閾値スライダーのイベント
hotspotThreshold.addEventListener('input', () => {
  const val = parseFloat(hotspotThreshold.value);
  hotspotThresholdValue.textContent = `×${val.toFixed(1)}`;
  detectAndShowHotspots();
  drawCommentDensity(); // 閾値ライン再描画
});

/**
 * 盛り上がり箇所を検出してリスト表示
 */
function detectAndShowHotspots() {
  if (!commentDensityData || !commentDensityData.density) {
    detectedHotspots = [];
    hotspotList.innerHTML = '';
    hotspotCount.textContent = '';
    return;
  }

  const threshold = parseFloat(hotspotThreshold.value) || 2.0;
  const { density, avgCount, maxCount, intervalSec } = commentDensityData;
  const thresholdCount = avgCount * threshold;

  // 閾値を超える連続区間をグループ化
  const hotspots = [];
  let currentGroup = null;

  for (const bucket of density) {
    if (bucket.count >= thresholdCount) {
      if (currentGroup) {
        // 連続区間を拡張
        currentGroup.endTime = bucket.endTime;
        currentGroup.peakCount = Math.max(currentGroup.peakCount, bucket.count);
        currentGroup.totalCount += bucket.count;
        currentGroup.bucketCount++;
      } else {
        // 新しいグループ開始
        currentGroup = {
          startTime: bucket.startTime,
          endTime: bucket.endTime,
          peakCount: bucket.count,
          totalCount: bucket.count,
          bucketCount: 1
        };
      }
    } else {
      if (currentGroup) {
        hotspots.push(currentGroup);
        currentGroup = null;
      }
    }
  }
  if (currentGroup) {
    hotspots.push(currentGroup);
  }

  // ピークの高い順にソート
  hotspots.sort((a, b) => b.peakCount - a.peakCount);
  detectedHotspots = hotspots;

  // UIに結果を表示
  hotspotCount.textContent = `${hotspots.length}箇所検出`;

  if (hotspots.length === 0) {
    hotspotList.innerHTML = '<span style="font-size:0.8rem; color:#718096;">盛り上がり箇所なし（閾値を下げてください）</span>';
    return;
  }

  hotspotList.innerHTML = hotspots.map((hs, i) => {
    const intensity = hs.peakCount / maxCount;
    const chipClass = intensity > 0.7 ? 'hotspot-chip-hot' : 'hotspot-chip-warm';
    const durationSec = hs.endTime - hs.startTime;
    return `
      <button class="hotspot-chip ${chipClass}"
              data-hotspot-idx="${i}"
              onclick="jumpToHotspot(${hs.startTime}, ${hs.endTime})"
              title="ピーク: ${hs.peakCount}件/${intervalSec}秒 | 区間: ${formatTimeShort(hs.startTime)} ~ ${formatTimeShort(hs.endTime)}">
        <span class="hotspot-chip-time">${formatTimeShort(hs.startTime)}</span>
        <span class="hotspot-chip-count">${durationSec}s / ${hs.peakCount}peak</span>
      </button>
    `;
  }).join('');
}

/**
 * 盛り上がり区間内のコメントを表示するツールチップ
 * チップ hover 時に getLiveChatData を遅延ロードし、区間内コメントを一覧表示する。
 */
const HotspotTooltip = {
  el: null,
  currentChip: null,
  MAX_COMMENTS: 60,
  HIDE_DELAY_MS: 180, // チップ離脱からツールチップへ移動するための猶予
  _hideTimer: null,

  _ensureEl() {
    if (this.el) return this.el;
    this.el = document.createElement('div');
    this.el.className = 'hotspot-tooltip';
    this.el.hidden = true;
    document.body.appendChild(this.el);

    // ツールチップ上に乗ったら非表示予約をキャンセル、外れたら再予約
    this.el.addEventListener('mouseenter', () => this._cancelHide());
    this.el.addEventListener('mouseleave', () => this.scheduleHide());
    return this.el;
  },

  _cancelHide() {
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
  },

  scheduleHide() {
    this._cancelHide();
    this._hideTimer = setTimeout(() => this.hide(), this.HIDE_DELAY_MS);
  },

  async ensureComments(videoId) {
    if (!videoId) return false;
    if (liveChatCommentsVideoId === videoId && liveChatComments.length > 0) return true;
    try {
      const res = await window.electronAPI.getLiveChatData(videoId);
      if (res && res.success && res.data && res.data.exists) {
        liveChatComments = res.data.comments || [];
        liveChatCommentsVideoId = videoId;
        return true;
      }
    } catch (_) { /* noop */ }
    return false;
  },

  _renderHTML(startTime, endTime) {
    const inRange = liveChatComments.filter(
      c => c.offsetTimeSec >= startTime && c.offsetTimeSec <= endTime
    );
    const header = `<div class="hotspot-tooltip__header">${escapeHtml(formatTimeShort(startTime))} 〜 ${escapeHtml(formatTimeShort(endTime))} (${inRange.length}件)</div>`;

    if (inRange.length === 0) {
      return header + '<div class="hotspot-tooltip__empty">この区間のコメントは取得できていません</div>';
    }

    const shown = inRange.slice(0, this.MAX_COMMENTS);
    const list = shown.map((c) => {
      const t = formatTimeShort(c.offsetTimeSec);
      const cls = c.type === 'superchat' || c.type === 'supersticker'
        ? 'hotspot-tooltip__comment is-superchat'
        : 'hotspot-tooltip__comment';
      const amount = c.amount
        ? `<span class="hotspot-tooltip__amount">${escapeHtml(c.amount)}</span>`
        : '';
      return `<div class="${cls}">
        <span class="hotspot-tooltip__time">${escapeHtml(t)}</span>
        <span class="hotspot-tooltip__author">${escapeHtml(c.author || '')}${amount}</span>
        <span class="hotspot-tooltip__msg">${escapeHtml(c.message || '')}</span>
      </div>`;
    }).join('');
    const more = inRange.length > this.MAX_COMMENTS
      ? `<div class="hotspot-tooltip__more">…ほか ${inRange.length - this.MAX_COMMENTS} 件</div>`
      : '';
    return header + '<div class="hotspot-tooltip__list">' + list + '</div>' + more;
  },

  show(targetEl, startTime, endTime) {
    this._cancelHide();
    const el = this._ensureEl();
    el.innerHTML = this._renderHTML(startTime, endTime);
    el.hidden = false;

    // 一旦原点に置いてサイズを測ってからクランプ配置
    el.style.left = '0px';
    el.style.top = '0px';
    const rect = targetEl.getBoundingClientRect();
    const tip = el.getBoundingClientRect();
    const margin = 8;
    let left = rect.left + rect.width / 2 - tip.width / 2;
    let top = rect.top - tip.height - 8;
    if (left < margin) left = margin;
    if (left + tip.width > window.innerWidth - margin) {
      left = window.innerWidth - tip.width - margin;
    }
    if (top < margin) top = rect.bottom + 8; // 上に収まらないなら下に出す
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  },

  hide() {
    this._cancelHide();
    if (this.el) this.el.hidden = true;
    this.currentChip = null;
  }
};

// 盛り上がりチップ hover 時にツールチップを表示（イベント委譲）
hotspotList.addEventListener('mouseover', async (e) => {
  const chip = e.target.closest('.hotspot-chip');
  if (!chip) return;
  HotspotTooltip._cancelHide();
  HotspotTooltip.currentChip = chip;

  const idx = parseInt(chip.dataset.hotspotIdx, 10);
  const hs = detectedHotspots[idx];
  if (!hs) return;

  const videoId = (videoIdInput.value || '').trim() || metadata.videoId;
  await HotspotTooltip.ensureComments(videoId);

  // await 中に別チップへ移動 / 離脱した場合は表示しない
  if (HotspotTooltip.currentChip !== chip) return;
  HotspotTooltip.show(chip, hs.startTime, hs.endTime);
});

hotspotList.addEventListener('mouseout', (e) => {
  const chip = e.target.closest('.hotspot-chip');
  if (!chip) return;
  // チップ内の子要素間の移動はリーブ扱いにしない
  if (chip.contains(e.relatedTarget)) return;
  // ツールチップ側へ移動する場合があるので、即hideせず遅延させる
  HotspotTooltip.scheduleHide();
});

/**
 * 盛り上がり箇所にジャンプ（クリック時の処理）
 * 盛り上がり区間の中心 ±15 秒をトリミング範囲に設定し、ループ再生する
 * @param {number} startTime - 盛り上がり区間の開始時間（秒）
 * @param {number} endTime - 盛り上がり区間の終了時間（秒）
 */
function jumpToHotspot(startTime, endTime) {
  if (!videoPlayer.duration) return;

  const center = (startTime + endTime) / 2;
  applyCenteredRange(center, 15, '盛り上がり箇所をループ範囲に設定');
}

/**
 * 指定した時間を中心に ±range 秒のトリミング範囲を作成し、ループ再生する
 * @param {number} centerTime - 中心の時間（秒）
 * @param {number} range - 中心からの片側の長さ（秒）
 * @param {string} [toastLabel] - トースト表示時のラベル
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

/**
 * 標準的な時間フォーマット (HH:MM:SS) — 一般表示用
 * @param {number} seconds - 秒数
 * @returns {string} フォーマット済み文字列
 */
function formatTimeShort(seconds) {
  if (!seconds || isNaN(seconds)) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ウィンドウリサイズ時にCanvas再描画
window.addEventListener('resize', () => {
  if (commentDensityVisible && commentDensityData) {
    drawCommentDensity();
  }
});

/**
 * カスタム動画ツールバー
 * ネイティブの controls 属性を外し、動画の下に独立したコントロール群を表示する。
 * 動画フレームに UI が重ならない。
 */
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

  // 再生/一時停止トグル
  playPauseBtn.addEventListener('click', () => {
    if (!videoPlayer.src) return;
    if (videoPlayer.paused) {
      videoPlayer.play().catch(e => console.error('再生エラー:', e));
    } else {
      videoPlayer.pause();
    }
  });

  // 再生状態に応じてアイコン切替
  videoPlayer.addEventListener('play', () => {
    iconPlay.style.display = 'none';
    iconPause.style.display = '';
  });
  videoPlayer.addEventListener('pause', () => {
    iconPlay.style.display = '';
    iconPause.style.display = 'none';
  });

  // 時間表示の更新
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

  // シークバー
  seekBar.addEventListener('input', () => {
    if (!videoPlayer.duration) return;
    isSeeking = true;
    const ratio = parseInt(seekBar.value, 10) / 1000;
    videoPlayer.currentTime = ratio * videoPlayer.duration;
  });
  seekBar.addEventListener('change', () => { isSeeking = false; });

  // 再生速度
  speedSelect.addEventListener('change', () => {
    const rate = parseFloat(speedSelect.value);
    if (!isNaN(rate) && rate > 0) {
      videoPlayer.playbackRate = rate;
      showToast(`再生速度: ${rate}x`, 'info', 1200);
    }
  });

  // ミュート
  muteBtn.addEventListener('click', () => {
    videoPlayer.muted = !videoPlayer.muted;
  });
  videoPlayer.addEventListener('volumechange', () => {
    const muted = videoPlayer.muted || videoPlayer.volume === 0;
    iconVolume.style.display = muted ? 'none' : '';
    iconMute.style.display = muted ? '' : 'none';
    volumeBar.value = String(videoPlayer.muted ? 0 : videoPlayer.volume);
  });

  // 音量
  volumeBar.addEventListener('input', () => {
    const v = parseFloat(volumeBar.value);
    videoPlayer.volume = isNaN(v) ? 1 : v;
    if (v > 0 && videoPlayer.muted) videoPlayer.muted = false;
  });

  // フルスクリーン
  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(e => console.error('フルスクリーン解除エラー:', e));
    } else {
      videoPlayer.requestFullscreen?.().catch(e => console.error('フルスクリーンエラー:', e));
    }
  });

  // スクリーンショット
  document.getElementById('screenshotBtn').addEventListener('click', takeScreenshot);
})();

/**
 * 現在の再生フレームを PNG として保存する
 * ファイル名はテンプレート（{startAt}/{endAt} を現在時刻で上書き）で生成
 */
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

    // テンプレートコンテキストを構築（現在の再生位置で startAt/endAt を上書き）
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

// クリップパネルは削除されたため、関連イベントは不要。

/**
 * 編集タブの列幅リサイザ
 * - 1列目（動画）と3列目（メタデータ）の幅を CSS 変数で制御。
 * - リサイザをドラッグすると両端の固定幅を増減し、真ん中（トリミング）が残り全幅を取る。
 * - 設定は localStorage[editColumnWidths] に永続化（resetAllSettings の対象に追加）。
 */
const ColumnResizer = {
  STORAGE_KEY: 'editColumnWidths',
  MIN: 240,
  MAX: 900,
  DEFAULTS: { col1: 360, col3: 380 },

  init() {
    const layout = document.querySelector('.edit-layout--3col');
    if (!layout) return;

    // 保存値を反映
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}'); } catch (_) {}
    if (typeof stored.col1 === 'number') this._setVar(layout, '--col1-width', stored.col1);
    if (typeof stored.col3 === 'number') this._setVar(layout, '--col3-width', stored.col3);

    layout.querySelectorAll('.col-resizer').forEach((handle) => {
      handle.addEventListener('mousedown', (e) => this._onDragStart(e, handle, layout));
    });
  },

  _setVar(layout, name, px) {
    const clamped = Math.max(this.MIN, Math.min(this.MAX, px));
    layout.style.setProperty(name, `${clamped}px`);
    return clamped;
  },

  _save(layout) {
    const styles = getComputedStyle(layout);
    const col1 = parseFloat(styles.getPropertyValue('--col1-width'));
    const col3 = parseFloat(styles.getPropertyValue('--col3-width'));
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ col1, col3 }));
    } catch (_) {}
  },

  _onDragStart(e, handle, layout) {
    e.preventDefault();
    const which = handle.dataset.resizer; // '1' or '2'
    const startX = e.clientX;
    const styles = getComputedStyle(layout);
    const startCol1 = parseFloat(styles.getPropertyValue('--col1-width'));
    const startCol3 = parseFloat(styles.getPropertyValue('--col3-width'));
    handle.classList.add('is-dragging');
    document.body.classList.add('is-col-resizing');

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (which === '1') {
        this._setVar(layout, '--col1-width', startCol1 + dx);
      } else {
        // 右側のリサイザは右に動かすほど col3 が縮む
        this._setVar(layout, '--col3-width', startCol3 - dx);
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      handle.classList.remove('is-dragging');
      document.body.classList.remove('is-col-resizing');
      this._save(layout);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  reset() {
    const layout = document.querySelector('.edit-layout--3col');
    if (!layout) return;
    this._setVar(layout, '--col1-width', this.DEFAULTS.col1);
    this._setVar(layout, '--col3-width', this.DEFAULTS.col3);
    try { localStorage.removeItem(this.STORAGE_KEY); } catch (_) {}
  }
};

// 初期化
initialize();
loadShortcuts();
ColumnResizer.init();

