/**
 * DOM 要素取得
 * すべての const domEl = document.getElementById(...) をここで宣言し、
 * 後続のモジュールファイルから参照できるようにする。
 * このファイルは他のすべての src/renderer/*.js よりも前にロードされる必要がある。
 */

// 検索・ダウンロード
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

// 波形表示
const waveformContainer = document.getElementById('waveform');
const waveformLoading = document.getElementById('waveformLoading');
const normalizeCheckbox = document.getElementById('normalizeCheckbox');
const zoomToTrimBtn = document.getElementById('zoomToTrimBtn');
const resetZoomBtn = document.getElementById('resetZoomBtn');

// クリップタイムライン
const clipTimeline = document.getElementById('clipTimeline');
const clipTrack = document.getElementById('clipTrack');
const clipSelection = document.getElementById('clipSelection');
const clipHandleStart = document.getElementById('clipHandleStart');
const clipHandleEnd = document.getElementById('clipHandleEnd');
const clipPlayhead = document.getElementById('clipPlayhead');
const clipStartTimeLabel = document.getElementById('clipStartTime');
const clipEndTimeLabel = document.getElementById('clipEndTime');

// オーバービュー
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

// メタデータ
const videoIdInput = document.getElementById('videoId');
const fileNameInput = document.getElementById('fileName');
const serifInput = document.getElementById('serif');
const rubyInput = document.getElementById('ruby');
const rubyBackdrop = document.getElementById('rubyBackdrop');
const clipUrlInput = document.getElementById('clipUrl');
const memoInput = document.getElementById('memo');
const categoryButtons = document.getElementById('categoryButtons');
const selectedCategoriesDiv = document.getElementById('selectedCategories');
const generateFileNameBtn = document.getElementById('generateFileNameBtn');
const generateRubyBtn = document.getElementById('generateRubyBtn');
const transcribeSerifBtn = document.getElementById('transcribeSerifBtn');
const saveMetadataBtn = document.getElementById('saveMetadataBtn');
const clearMetadataBtn = document.getElementById('clearMetadataBtn');
const exportVideoBtn = document.getElementById('exportVideoBtn');

// コメント密度
const commentDensityContainer = document.getElementById('commentDensityContainer');
const commentDensityCanvas = document.getElementById('commentDensityCanvas');
const loadCommentsBtn = document.getElementById('loadCommentsBtn');
const downloadCommentsBtn = document.getElementById('downloadCommentsBtn');

// 盛り上がり検出
const hotspotSection = document.getElementById('hotspotSection');
const hotspotThreshold = document.getElementById('hotspotThreshold');
const hotspotThresholdValue = document.getElementById('hotspotThresholdValue');
const hotspotCount = document.getElementById('hotspotCount');
const hotspotList = document.getElementById('hotspotList');
