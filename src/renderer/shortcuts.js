/**
 * キーボードショートカット・フレーム微調整
 * ショートカット設定の読み書き、モーダル管理、グローバルキーイベント処理
 *
 * 依存: utils.js (showToast)
 *       dom-elements.js (setStartBtn, setEndBtn, loopCheckbox, saveMetadataBtn, exportVideoBtn, ...)
 */

// デフォルトのショートカット設定
const defaultShortcuts = {
  playPause:       { key: 'Space',        ctrl: false, shift: false, alt: false, action: '再生/一時停止',    description: '動画の再生と一時停止を切り替え' },
  frameBack1:      { key: 'ArrowLeft',    ctrl: false, shift: false, alt: false, action: '1フレーム戻る',   description: '再生位置を1フレーム前に移動' },
  frameForward1:   { key: 'ArrowRight',   ctrl: false, shift: false, alt: false, action: '1フレーム進む',   description: '再生位置を1フレーム後に移動' },
  frameBack15:     { key: 'ArrowLeft',    ctrl: false, shift: true,  alt: false, action: '15フレーム戻る',  description: '再生位置を15フレーム前に移動' },
  frameForward15:  { key: 'ArrowRight',   ctrl: false, shift: true,  alt: false, action: '15フレーム進む',  description: '再生位置を15フレーム後に移動' },
  setStart:        { key: 'BracketLeft',  ctrl: false, shift: false, alt: false, action: '開始位置を設定',  description: '現在の再生位置をトリミング開始位置に設定' },
  setEnd:          { key: 'BracketRight', ctrl: false, shift: false, alt: false, action: '終了位置を設定',  description: '現在の再生位置をトリミング終了位置に設定' },
  toggleLoop:      { key: 'KeyL',         ctrl: false, shift: false, alt: false, action: 'ループ切り替え',   description: 'トリミング範囲のループ再生を切り替え' },
  startMinusLarge: { key: 'KeyQ',         ctrl: false, shift: false, alt: false, action: '開始-大フレーム', description: 'トリミング開始位置を大フレーム数前に移動' },
  startMinusSmall: { key: 'KeyW',         ctrl: false, shift: false, alt: false, action: '開始-小フレーム', description: 'トリミング開始位置を小フレーム数前に移動' },
  startPlusSmall:  { key: 'KeyE',         ctrl: false, shift: false, alt: false, action: '開始+小フレーム', description: 'トリミング開始位置を小フレーム数後に移動' },
  startPlusLarge:  { key: 'KeyR',         ctrl: false, shift: false, alt: false, action: '開始+大フレーム', description: 'トリミング開始位置を大フレーム数後に移動' },
  endMinusLarge:   { key: 'KeyA',         ctrl: false, shift: false, alt: false, action: '終了-大フレーム', description: 'トリミング終了位置を大フレーム数前に移動' },
  endMinusSmall:   { key: 'KeyS',         ctrl: false, shift: false, alt: false, action: '終了-小フレーム', description: 'トリミング終了位置を小フレーム数前に移動' },
  endPlusSmall:    { key: 'KeyD',         ctrl: false, shift: false, alt: false, action: '終了+小フレーム', description: 'トリミング終了位置を小フレーム数後に移動' },
  endPlusLarge:    { key: 'KeyF',         ctrl: false, shift: false, alt: false, action: '終了+大フレーム', description: 'トリミング終了位置を大フレーム数後に移動' },
  zoomCycle:       { key: 'KeyX',         ctrl: false, shift: false, alt: false, action: 'ズーム倍率切り替え', description: 'トリミング範囲のパディング（5秒/1分/5分）を切り替え' },
  hotspotPrev:     { key: 'Comma',        ctrl: false, shift: false, alt: false, action: '前の盛り上がりへ',   description: '現在位置より前の盛り上がりへ再生位置を移動（密度ON時）' },
  hotspotNext:     { key: 'Period',       ctrl: false, shift: false, alt: false, action: '次の盛り上がりへ',   description: '現在位置より後の盛り上がりへ再生位置を移動（密度ON時）' },
  saveMetadata:    { key: 'KeyS',         ctrl: true,  shift: false, alt: false, action: 'メタデータ保存',  description: 'メタデータをJSON形式で保存' },
  exportVideo:     { key: 'KeyE',         ctrl: true,  shift: false, alt: false, action: '動画エクスポート', description: 'トリミング済み動画をMP4形式で書き出し' },
  openSettings:    { key: 'KeyK',         ctrl: false, shift: false, alt: false, action: 'ショートカット設定', description: 'このショートカット設定画面を開く' },
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
  'Comma': ',',
  'Period': '.',
  'Enter': 'Enter',
  'Escape': 'Esc',
  'Backspace': 'Backspace',
  'Tab': 'Tab',
};

function formatKeyName(key) {
  if (keyCodeToKeyName[key]) return keyCodeToKeyName[key];
  if (key.startsWith('Key')) return key.replace('Key', '');
  if (key.startsWith('Digit')) return key.replace('Digit', '');
  return key;
}

function getShortcutString(shortcut) {
  const parts = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.shift) parts.push('Shift');
  if (shortcut.alt) parts.push('Alt');
  parts.push(formatKeyName(shortcut.key));
  return parts.join(' + ');
}

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

function saveShortcutsToStorage() {
  try {
    localStorage.setItem('keyboardShortcuts', JSON.stringify(shortcuts));
    updateFineTuneButtonLabels();
    renderShortcutLegend();
    showToast('ショートカット設定を保存しました', 'success');
  } catch (error) {
    console.error('ショートカット設定の保存に失敗:', error);
    showToast('ショートカット設定の保存に失敗しました', 'error');
  }
}

function resetShortcuts() {
  if (!confirm('ショートカット設定をデフォルトに戻しますか？')) {
    return;
  }
  shortcuts = { ...defaultShortcuts };
  saveShortcutsToStorage();
  renderShortcutList();
  renderShortcutLegend();
  updateFineTuneButtonLabels();
  showToast('ショートカット設定をデフォルトに戻しました', 'success');
}

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

  shortcutList.querySelectorAll('.btn-edit-shortcut').forEach(btn => {
    btn.addEventListener('click', (e) => {
      editShortcut(e.target.dataset.id);
    });
  });
}

function editShortcut(id) {
  editingShortcutId = id;
  renderShortcutList();

  const editingTitle = document.getElementById('editingShortcutTitle');
  editingTitle.style.display = 'block';
  editingTitle.textContent = `「${shortcuts[id].action}」のキーを押してください`;

  showToast('新しいキーを押してください（Escでキャンセル）', 'info');
}

function finishEditingShortcut() {
  editingShortcutId = null;
  renderShortcutList();

  const editingTitle = document.getElementById('editingShortcutTitle');
  editingTitle.style.display = 'none';
}

function handleModalKeyDown(e) {
  if (!editingShortcutId) return;

  if (e.code === 'Escape') {
    finishEditingShortcut();
    showToast('編集をキャンセルしました', 'info');
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
    return;
  }

  const currentShortcut = shortcuts[editingShortcutId];
  if (!currentShortcut) {
    console.error('Invalid shortcut ID:', editingShortcutId);
    finishEditingShortcut();
    return;
  }

  const newShortcut = {
    ...currentShortcut,
    key: e.code,
    ctrl: e.ctrlKey || e.metaKey,
    shift: e.shiftKey,
    alt: e.altKey,
  };

  shortcuts[editingShortcutId] = newShortcut;

  highlightKey(e.code);

  const message = `「${currentShortcut.action}」を ${getShortcutString(newShortcut)} に設定しました`;

  finishEditingShortcut();
  showToast(message, 'success');
}

function highlightKey(code) {
  if (!simpleKeyboard) return;

  let buttonName = code;
  if (code.startsWith('Key')) {
    buttonName = code.replace('Key', '').toLowerCase();
  } else if (code.startsWith('Digit')) {
    buttonName = code.replace('Digit', '');
  } else if (code === 'Space')        buttonName = '{space}';
  else if (code === 'Enter')          buttonName = '{enter}';
  else if (code === 'Backspace')      buttonName = '{bksp}';
  else if (code === 'Tab')            buttonName = '{tab}';
  else if (code === 'ArrowLeft')      buttonName = '{arrowleft}';
  else if (code === 'ArrowRight')     buttonName = '{arrowright}';
  else if (code === 'ArrowUp')        buttonName = '{arrowup}';
  else if (code === 'ArrowDown')      buttonName = '{arrowdown}';
  else if (code === 'BracketLeft')    buttonName = '[';
  else if (code === 'BracketRight')   buttonName = ']';

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

function handleGlobalKeyDown(e) {
  if (editingShortcutId) return;

  const modal = document.getElementById('shortcutModal');
  if (modal.classList.contains('active')) return;

  const activeElement = document.activeElement;
  if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') return;

  const videoLoaded = currentVideoFile !== null;

  Object.entries(shortcuts).forEach(([id, shortcut]) => {
    if (
      e.code === shortcut.key &&
      (e.ctrlKey || e.metaKey) === shortcut.ctrl &&
      e.shiftKey === shortcut.shift &&
      e.altKey === shortcut.alt
    ) {
      e.preventDefault();
      e.stopPropagation();
      executeShortcutAction(id, videoLoaded);
    }
  });
}

function executeShortcutAction(actionId, videoLoaded) {
  switch (actionId) {
    case 'playPause':
      if (!videoLoaded) return;
      if (videoPlayer.paused) { videoPlayer.play(); } else { videoPlayer.pause(); }
      break;
    case 'frameBack1':      if (!videoLoaded) return; adjustTime(-1);  break;
    case 'frameForward1':   if (!videoLoaded) return; adjustTime(1);   break;
    case 'frameBack15':     if (!videoLoaded) return; adjustTime(-15); break;
    case 'frameForward15':  if (!videoLoaded) return; adjustTime(15);  break;
    case 'setStart':        if (!videoLoaded) return; setStartBtn.click(); break;
    case 'setEnd':          if (!videoLoaded) return; setEndBtn.click();   break;
    case 'toggleLoop':
      if (!videoLoaded) return;
      loopCheckbox.checked = !loopCheckbox.checked;
      trimState.isLooping = loopCheckbox.checked;
      showToast(`ループ再生を${trimState.isLooping ? 'オン' : 'オフ'}にしました`, 'info');
      break;
    case 'zoomCycle':          if (!videoLoaded) return; cycleZoomPadding(); break;
    case 'hotspotPrev':        if (!videoLoaded) return; jumpToAdjacentHotspot(-1); break;
    case 'hotspotNext':        if (!videoLoaded) return; jumpToAdjacentHotspot(1);  break;
    case 'startMinusLarge':    if (!videoLoaded) return; adjustStartTime(-fineTuneSettings.largeFrames); break;
    case 'startMinusSmall':    if (!videoLoaded) return; adjustStartTime(-fineTuneSettings.smallFrames); break;
    case 'startPlusSmall':     if (!videoLoaded) return; adjustStartTime(fineTuneSettings.smallFrames);  break;
    case 'startPlusLarge':     if (!videoLoaded) return; adjustStartTime(fineTuneSettings.largeFrames);  break;
    case 'endMinusLarge':      if (!videoLoaded) return; adjustEndTime(-fineTuneSettings.largeFrames);   break;
    case 'endMinusSmall':      if (!videoLoaded) return; adjustEndTime(-fineTuneSettings.smallFrames);   break;
    case 'endPlusSmall':       if (!videoLoaded) return; adjustEndTime(fineTuneSettings.smallFrames);    break;
    case 'endPlusLarge':       if (!videoLoaded) return; adjustEndTime(fineTuneSettings.largeFrames);    break;
    case 'saveMetadata':       if (!videoLoaded) return; saveMetadataBtn.click();  break;
    case 'exportVideo':        if (!videoLoaded) return; exportVideoBtn.click();   break;
    case 'openSettings':       openShortcutModal(); break;
  }
}

// フレーム単位の時間調整（再生位置をずらすショートカット）
function adjustTime(frames) {
  const frameTime = 1 / 30;
  const newTime = Math.max(0, Math.min(videoPlayer.duration, videoPlayer.currentTime + frames * frameTime));
  videoPlayer.currentTime = newTime;

  if (wavesurfer && waveformVisible) {
    wavesurfer.setTime(newTime);
  }
}

// フレームレート（通常30fps）
const DEFAULT_FRAME_RATE = 30;

function framesToSeconds(frames, frameRate = DEFAULT_FRAME_RATE) {
  return frames / frameRate;
}

// 開始位置の微調整
function adjustStartTime(frames) {
  if (!videoPlayer.duration) return;

  const adjustSeconds = framesToSeconds(frames);
  let newStartTime = trimState.startTime + adjustSeconds;
  newStartTime = Math.max(0, Math.min(newStartTime, trimState.endTime - 0.1));

  trimState.startTime = newStartTime;
  updateTrimDisplay();

  trimState.isLooping = true;
  loopCheckbox.checked = true;
  videoPlayer.currentTime = newStartTime;
  videoPlayer.play().catch(e => console.error('再生エラー:', e));
}

// 終了位置の微調整
function adjustEndTime(frames) {
  if (!videoPlayer.duration) return;

  const adjustSeconds = framesToSeconds(frames);
  let newEndTime = trimState.endTime + adjustSeconds;
  newEndTime = Math.max(trimState.startTime + 0.1, Math.min(newEndTime, videoPlayer.duration));

  trimState.endTime = newEndTime;
  updateTrimDisplay();

  trimState.isLooping = true;
  loopCheckbox.checked = true;
  const playbackTime = Math.max(trimState.endTime - 2, trimState.startTime);
  videoPlayer.currentTime = playbackTime;
  videoPlayer.play().catch(e => console.error('再生エラー:', e));
}

function openShortcutModal() {
  const modal = document.getElementById('shortcutModal');
  modal.classList.add('active');

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

function closeShortcutModal() {
  document.getElementById('shortcutModal').classList.remove('active');
  editingShortcutId = null;
}

// 微調整フレームボタンのイベント
document.getElementById('startMinusLargeFrameBtn').addEventListener('click', () => adjustStartTime(-fineTuneSettings.largeFrames));
document.getElementById('startMinusSmallFrameBtn').addEventListener('click', () => adjustStartTime(-fineTuneSettings.smallFrames));
document.getElementById('startPlusSmallFrameBtn').addEventListener('click',  () => adjustStartTime(fineTuneSettings.smallFrames));
document.getElementById('startPlusLargeFrameBtn').addEventListener('click',  () => adjustStartTime(fineTuneSettings.largeFrames));
document.getElementById('endMinusLargeFrameBtn').addEventListener('click',   () => adjustEndTime(-fineTuneSettings.largeFrames));
document.getElementById('endMinusSmallFrameBtn').addEventListener('click',   () => adjustEndTime(-fineTuneSettings.smallFrames));
document.getElementById('endPlusSmallFrameBtn').addEventListener('click',    () => adjustEndTime(fineTuneSettings.smallFrames));
document.getElementById('endPlusLargeFrameBtn').addEventListener('click',    () => adjustEndTime(fineTuneSettings.largeFrames));

// ショートカット設定モーダル関連
document.getElementById('shortcutSettingsBtn').addEventListener('click', openShortcutModal);
document.getElementById('closeShortcutModal').addEventListener('click', closeShortcutModal);
document.getElementById('resetShortcutsBtn').addEventListener('click', resetShortcuts);
document.getElementById('saveShortcutsBtn').addEventListener('click', () => {
  saveShortcutsToStorage();
  closeShortcutModal();
});
document.getElementById('shortcutModal').addEventListener('click', (e) => {
  if (e.target.id === 'shortcutModal') closeShortcutModal();
});

// モーダル内のキーボードイベント（キャプチャフェーズで先に処理）
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('shortcutModal');
  if (modal.classList.contains('active') && editingShortcutId) {
    handleModalKeyDown(e);
  }
}, true);

// ============================================================
// 常時参照できるショートカット凡例（編集画面に ? で開閉表示）
// ============================================================

// 凡例のカテゴリ分け（現在の shortcuts からライブ生成し、リマップを反映）
const SHORTCUT_LEGEND_GROUPS = [
  { title: '再生・移動', ids: ['playPause', 'frameBack1', 'frameForward1', 'frameBack15', 'frameForward15', 'zoomCycle'] },
  { title: '探索', ids: ['hotspotPrev', 'hotspotNext'] },
  { title: 'トリミング', ids: ['setStart', 'setEnd', 'toggleLoop', 'startMinusLarge', 'startMinusSmall', 'startPlusSmall', 'startPlusLarge', 'endMinusLarge', 'endMinusSmall', 'endPlusSmall', 'endPlusLarge'] },
  { title: '保存・その他', ids: ['saveMetadata', 'exportVideo', 'openSettings'] },
];

function renderShortcutLegend() {
  const el = document.getElementById('shortcutLegend');
  if (!el) return;

  el.innerHTML = SHORTCUT_LEGEND_GROUPS.map(group => {
    const rows = group.ids
      .filter(id => shortcuts[id])
      .map(id => `
        <div class="shortcut-legend__row">
          <kbd class="shortcut-legend__key">${escapeHtml(getShortcutString(shortcuts[id]))}</kbd>
          <span class="shortcut-legend__action">${escapeHtml(shortcuts[id].action)}</span>
        </div>`)
      .join('');
    return `<div class="shortcut-legend__group">
      <div class="shortcut-legend__title">${escapeHtml(group.title)}</div>
      ${rows}
    </div>`;
  }).join('');
}

function loadShortcutLegendOpen() {
  try { return localStorage.getItem('shortcutLegendOpen') === '1'; } catch (e) { return false; }
}

function setShortcutLegendOpen(open) {
  const panel = document.getElementById('shortcutLegend');
  const btn = document.getElementById('shortcutLegendToggle');
  if (panel) panel.hidden = !open;
  if (btn) {
    btn.classList.toggle('active', open);
    btn.setAttribute('aria-expanded', String(open));
  }
  try { localStorage.setItem('shortcutLegendOpen', open ? '1' : '0'); } catch (e) {}
  if (open) renderShortcutLegend();
}

// 起動時に凡例の開閉状態を復元する（renderer.js の起動処理から loadShortcuts() の後に呼ぶ）
function initShortcutLegend() {
  const btn = document.getElementById('shortcutLegendToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const panel = document.getElementById('shortcutLegend');
      setShortcutLegendOpen(panel ? panel.hidden : true);
    });
  }
  setShortcutLegendOpen(loadShortcutLegendOpen());
}

// グローバルキーボードイベント
document.addEventListener('keydown', handleGlobalKeyDown);
