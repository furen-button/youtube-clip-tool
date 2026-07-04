/**
 * コメント密度・盛り上がり検出
 * ライブチャットデータを密度グラフで可視化し、盛り上がり区間をチップで表示する。
 *
 * 依存: utils.js (escapeHtml, formatTimeShort, showToast)
 *       dom-elements.js (commentDensityContainer, commentDensityCanvas, loadCommentsBtn,
 *                        downloadCommentsBtn, hotspotSection, hotspotThreshold,
 *                        hotspotThresholdValue, hotspotCount, hotspotList, videoIdInput)
 */

// コメント密度関連の状態
let commentDensityData = null;
let commentDensityVisible = false;

// 盛り上がり検出関連の状態
let detectedHotspots = [];
let liveChatComments = [];
let liveChatCommentsVideoId = null;

/**
 * 動画切り替え時にコメント密度・盛り上がり関連の状態と UI を初期化する。
 */
function resetCommentStateForVideoSwitch() {
  commentDensityData = null;
  commentDensityVisible = false;
  if (commentDensityContainer) commentDensityContainer.style.display = 'none';

  detectedHotspots = [];
  if (hotspotSection) hotspotSection.style.display = 'none';
  if (hotspotList) hotspotList.innerHTML = '';
  if (hotspotCount) hotspotCount.textContent = '';
  if (clipOverviewHotspots) clipOverviewHotspots.innerHTML = '';
  if (clipTimelineHotspots) clipTimelineHotspots.innerHTML = '';

  liveChatComments = [];
  liveChatCommentsVideoId = null;
  if (typeof HotspotTooltip !== 'undefined' && HotspotTooltip && HotspotTooltip.hide) {
    HotspotTooltip.hide();
  }
}

/**
 * コメント関連ボタンの見た目を更新
 */
function updateCommentButtons() {
  const hasChat = currentVideoFile && currentVideoFile.hasLiveChat;
  if (hasChat) {
    loadCommentsBtn.classList.remove('btn-warning');
    loadCommentsBtn.classList.add('btn-success');
    loadCommentsBtn.textContent = '💬 密度';
    loadCommentsBtn.title = 'ライブチャットコメント密度の表示切替（DL済み）';
    downloadCommentsBtn.title = 'ライブチャットを再ダウンロード（既に取得済み）';
  } else {
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
    if (!autoMode && commentDensityVisible && commentDensityData) {
      commentDensityContainer.style.display = 'none';
      hotspotSection.style.display = 'none';
      commentDensityVisible = false;
      loadCommentsBtn.textContent = '💬 密度';
      showToast('コメント密度表示をOFFにしました', 'info');
      return;
    }

    if (autoMode && commentDensityVisible && commentDensityData) {
      return;
    }

    loadCommentsBtn.textContent = '読込中...';
    loadCommentsBtn.disabled = true;

    const duration = videoPlayer.duration;
    let intervalSec = 5;
    if (duration > 7200) intervalSec = 30;
    else if (duration > 3600) intervalSec = 15;
    else if (duration > 1800) intervalSec = 10;

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

  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const { density, maxCount } = commentDensityData;
  const videoDuration = videoPlayer.duration || 1;

  ctx.clearRect(0, 0, width, height);

  if (density.length === 0 || maxCount === 0) return;

  const barCount = density.length;

  for (let i = 0; i < barCount; i++) {
    const bucket = density[i];
    const xStart = (bucket.startTime / videoDuration) * width;
    const xEnd = (bucket.endTime / videoDuration) * width;
    const barWidth = Math.max(xEnd - xStart, 1);

    const ratio = bucket.count / maxCount;
    const barHeight = ratio * (height - 4);

    const color = getDensityColor(ratio);

    ctx.fillStyle = color;
    ctx.fillRect(xStart, height - barHeight - 2, barWidth, barHeight);
  }

  const avgRatio = commentDensityData.avgCount / maxCount;
  const avgY = height - (avgRatio * (height - 4)) - 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, avgY);
  ctx.lineTo(width, avgY);
  ctx.stroke();
  ctx.setLineDash([]);

  const threshold = parseFloat(hotspotThreshold.value) || 2.0;
  const thresholdCount = commentDensityData.avgCount * threshold;
  if (thresholdCount <= maxCount) {
    const thresholdRatio = thresholdCount / maxCount;
    const thresholdY = height - (thresholdRatio * (height - 4)) - 2;
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(0, thresholdY);
    ctx.lineTo(width, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 盛り上がり箇所のハイライト描画
  if (detectedHotspots && detectedHotspots.length > 0) {
    detectedHotspots.forEach(hs => {
      const xStart = (hs.startTime / videoDuration) * width;
      const xEnd = (hs.endTime / videoDuration) * width;
      ctx.fillStyle = 'rgba(255, 200, 50, 0.15)';
      ctx.fillRect(xStart, 0, Math.max(xEnd - xStart, 2), height);
    });
  }
}

function getDensityColor(ratio) {
  let r, g, b;
  if (ratio < 0.5) {
    const t = ratio * 2;
    r = Math.round(50 + t * 205);
    g = Math.round(100 + t * 155);
    b = Math.round(200 - t * 200);
  } else {
    const t = (ratio - 0.5) * 2;
    r = 255;
    g = Math.round(255 - t * 200);
    b = Math.round(t * 30);
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
      if (currentVideoFile) {
        currentVideoFile.hasLiveChat = true;
      }
      updateCommentButtons();
      commentDensityData = null;
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
  drawCommentDensity();
});

/**
 * 盛り上がり箇所を検出してリスト表示
 */
function detectAndShowHotspots() {
  if (!commentDensityData || !commentDensityData.density) {
    detectedHotspots = [];
    hotspotList.innerHTML = '';
    hotspotCount.textContent = '';
    renderOverviewHotspots();
    renderTimelineHotspots();
    return;
  }

  const threshold = parseFloat(hotspotThreshold.value) || 2.0;
  const { density, avgCount, maxCount, intervalSec } = commentDensityData;
  const thresholdCount = avgCount * threshold;

  const hotspots = [];
  let currentGroup = null;

  for (const bucket of density) {
    if (bucket.count >= thresholdCount) {
      if (currentGroup) {
        currentGroup.endTime = bucket.endTime;
        currentGroup.peakCount = Math.max(currentGroup.peakCount, bucket.count);
        currentGroup.totalCount += bucket.count;
        currentGroup.bucketCount++;
      } else {
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

  hotspots.sort((a, b) => b.peakCount - a.peakCount);
  detectedHotspots = hotspots;

  renderOverviewHotspots();
  renderTimelineHotspots();

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
 */
const HotspotTooltip = {
  el: null,
  currentChip: null,
  MAX_COMMENTS: 60,
  HIDE_DELAY_MS: 180,
  _hideTimer: null,

  _ensureEl() {
    if (this.el) return this.el;
    this.el = document.createElement('div');
    this.el.className = 'hotspot-tooltip';
    this.el.hidden = true;
    document.body.appendChild(this.el);

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
    if (top < margin) top = rect.bottom + 8;
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

  if (HotspotTooltip.currentChip !== chip) return;
  HotspotTooltip.show(chip, hs.startTime, hs.endTime);
});

hotspotList.addEventListener('mouseout', (e) => {
  const chip = e.target.closest('.hotspot-chip');
  if (!chip) return;
  if (chip.contains(e.relatedTarget)) return;
  HotspotTooltip.scheduleHide();
});

/**
 * 盛り上がり箇所にジャンプ（onclick="jumpToHotspot(...)" から呼ばれるグローバル関数）
 */
function jumpToHotspot(startTime, endTime) {
  if (!videoPlayer.duration) return;

  const center = (startTime + endTime) / 2;
  applyCenteredRange(center, 15, '盛り上がり箇所をループ範囲に設定');
}

/**
 * 盛り上がりマーカーをオーバービュー（動画全長のミニマップ）に描画する。
 * マーカーはクリックでその盛り上がりを±15秒の候補範囲に設定する。
 */
function renderOverviewHotspots() {
  if (!clipOverviewHotspots) return;

  const duration = videoPlayer.duration || 0;
  if (!duration || !detectedHotspots || detectedHotspots.length === 0) {
    clipOverviewHotspots.innerHTML = '';
    return;
  }

  const maxCount = commentDensityData ? commentDensityData.maxCount : 0;
  clipOverviewHotspots.innerHTML = detectedHotspots.map((hs) => {
    const leftPct = (hs.startTime / duration) * 100;
    const widthPct = Math.max(0.4, ((hs.endTime - hs.startTime) / duration) * 100);
    const intensity = maxCount ? hs.peakCount / maxCount : 0;
    const cls = intensity > 0.7 ? 'is-hot' : 'is-warm';
    return `<span class="clip-overview__hotspot ${cls}" ` +
      `style="left:${leftPct}%; width:${widthPct}%;" ` +
      `data-start="${hs.startTime}" data-end="${hs.endTime}" ` +
      `title="盛り上がり ${escapeHtml(formatTimeShort(hs.startTime))} 〜 ${escapeHtml(formatTimeShort(hs.endTime))} / ピーク${hs.peakCount}"></span>`;
  }).join('');
}

/**
 * メインタイムライン（ズーム/パンする表示範囲）に盛り上がりマーカーを描画する。
 * オーバービューと違い現在の表示範囲 (clipViewState) 基準で位置を計算し、範囲外は描画しない。
 * 表示範囲が変わるたび updateClipTimelineUI() から再描画される。
 */
function renderTimelineHotspots() {
  if (!clipTimelineHotspots) return;

  const duration = videoPlayer.duration || 0;
  if (!duration || !detectedHotspots || detectedHotspots.length === 0) {
    clipTimelineHotspots.innerHTML = '';
    return;
  }

  const viewStart = clipViewState.viewStartTime;
  const viewEnd = clipViewState.viewEndTime || duration;
  const viewDur = Math.max(0.001, viewEnd - viewStart);
  const maxCount = commentDensityData ? commentDensityData.maxCount : 0;

  clipTimelineHotspots.innerHTML = detectedHotspots.map((hs) => {
    const leftPct = ((hs.startTime - viewStart) / viewDur) * 100;
    const rightPct = ((hs.endTime - viewStart) / viewDur) * 100;
    if (rightPct < 0 || leftPct > 100) return ''; // 表示範囲外は描画しない
    const clampedLeft = Math.max(0, leftPct);
    const clampedWidth = Math.max(0.4, Math.min(100, rightPct) - clampedLeft);
    const intensity = maxCount ? hs.peakCount / maxCount : 0;
    const cls = intensity > 0.7 ? 'is-hot' : 'is-warm';
    return `<span class="clip-timeline__hotspot ${cls}" ` +
      `style="left:${clampedLeft}%; width:${clampedWidth}%;" ` +
      `data-start="${hs.startTime}" data-end="${hs.endTime}" ` +
      `title="盛り上がり ${escapeHtml(formatTimeShort(hs.startTime))} 〜 ${escapeHtml(formatTimeShort(hs.endTime))} / ピーク${hs.peakCount}"></span>`;
  }).join('');
}

/**
 * 現在の再生位置から時系列で前/次の盛り上がりへ再生ヘッドを移動する（トリミング範囲は変更しない）。
 * @param {number} direction -1: 前へ / +1: 次へ
 */
function jumpToAdjacentHotspot(direction) {
  if (!videoPlayer.duration) return;
  if (!commentDensityVisible || !detectedHotspots || detectedHotspots.length === 0) {
    showToast('先に「💬 密度」をONにして盛り上がりを検出してください', 'warning');
    return;
  }

  // detectedHotspots は peakCount 降順なので、時系列（startTime 昇順）に並べ替えてから探す
  const ordered = [...detectedHotspots].sort((a, b) => a.startTime - b.startTime);
  const cur = videoPlayer.currentTime;
  const EPS = 0.3; // 現在位置とほぼ同じ箇所を飛ばすための許容秒

  let target = null;
  let idx = -1;
  if (direction > 0) {
    idx = ordered.findIndex(hs => hs.startTime > cur + EPS);
    if (idx !== -1) target = ordered[idx];
  } else {
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (ordered[i].startTime < cur - EPS) { target = ordered[i]; idx = i; break; }
    }
  }

  if (!target) {
    showToast(direction > 0 ? 'これより後の盛り上がりはありません' : 'これより前の盛り上がりはありません', 'info', 2000);
    return;
  }

  videoPlayer.currentTime = target.startTime;
  if (videoPlayer.paused) {
    videoPlayer.play().catch(err => console.error('再生エラー:', err));
  }
  showToast(`盛り上がり ${idx + 1}/${ordered.length}（${formatTimeShort(target.startTime)}）`, 'info', 2000);
}

// 盛り上がりの前後ジャンプボタン
if (hotspotPrevBtn) hotspotPrevBtn.addEventListener('click', () => jumpToAdjacentHotspot(-1));
if (hotspotNextBtn) hotspotNextBtn.addEventListener('click', () => jumpToAdjacentHotspot(1));

// オーバービュー上の盛り上がりマーカークリックで候補範囲に設定（イベント委譲）
if (clipOverviewHotspots) {
  clipOverviewHotspots.addEventListener('click', (e) => {
    const marker = e.target.closest('.clip-overview__hotspot');
    if (!marker) return;
    e.stopPropagation(); // オーバービューの seek クリックを抑止
    jumpToHotspot(parseFloat(marker.dataset.start), parseFloat(marker.dataset.end));
  });
}

// メインタイムライン上の盛り上がりマーカークリックで候補範囲に設定（イベント委譲）
if (clipTimelineHotspots) {
  clipTimelineHotspots.addEventListener('click', (e) => {
    const marker = e.target.closest('.clip-timeline__hotspot');
    if (!marker) return;
    e.stopPropagation(); // メインタイムラインのクリック動作を抑止
    jumpToHotspot(parseFloat(marker.dataset.start), parseFloat(marker.dataset.end));
  });
}

// ウィンドウリサイズ時にCanvas再描画
window.addEventListener('resize', () => {
  if (commentDensityVisible && commentDensityData) {
    drawCommentDensity();
  }
});
