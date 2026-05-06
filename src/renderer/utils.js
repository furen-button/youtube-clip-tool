/**
 * ユーティリティ関数
 * 副作用なし・DOM 非依存の純粋関数群
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

// 時間を「HH:MM:SS.mmm」形式にフォーマット（微調整・タイムラインハンドル等の精密表示用）
function formatTimeWithMillis(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00:00.000';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
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

/**
 * カタカナをひらがなに変換
 * @param {string} str - 変換する文字列
 * @returns {string} ひらがなに変換された文字列
 */
function katakanaToHiragana(str) {
  return str.replace(/[ァ-ヶ]/g, (match) => {
    const charCode = match.charCodeAt(0) - 0x60;
    return String.fromCharCode(charCode);
  });
}

/**
 * トースト通知を表示
 */
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

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

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    removeToast(toast);
  });

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
