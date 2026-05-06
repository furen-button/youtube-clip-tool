/**
 * レイアウト管理
 * ColumnResizer: 編集タブの3列幅をドラッグで調整し localStorage に永続化
 */

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
