/**
 * クリップタイムライン
 * メインタイムライン・オーバービュー・サムネイルプレビュー・再生ヘッドアニメーション
 *
 * 依存: utils.js (formatTimeWithMillis, formatTimeShort, showToast)
 *       dom-elements.js (clipTimeline, clipTrack, clipHandleStart, ...)
 */

// タイムラインクリックモード（"seek" | "range15" | "range30"）
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

// クリップタイムラインバーの表示を更新
function updateClipTimelineUI() {
  const videoDuration = videoPlayer.duration || 0;
  if (!videoDuration) return;

  const viewStart = clipViewState.viewStartTime;
  const viewEnd = clipViewState.viewEndTime || videoDuration;
  const viewDuration = Math.max(0.001, viewEnd - viewStart);

  const startPercent = ((trimState.startTime - viewStart) / viewDuration) * 100;
  const endPercent = ((trimState.endTime - viewStart) / viewDuration) * 100;

  const clampedStart = Math.max(-1, Math.min(101, startPercent));
  const clampedEnd = Math.max(-1, Math.min(101, endPercent));

  clipHandleStart.style.left = `${clampedStart}%`;
  clipHandleEnd.style.left = `${clampedEnd}%`;

  const selStart = Math.max(0, Math.min(100, startPercent));
  const selEnd = Math.max(0, Math.min(100, endPercent));
  clipSelection.style.left = `${selStart}%`;
  clipSelection.style.width = `${Math.max(0, selEnd - selStart)}%`;

  const startVisible = startPercent >= 0 && startPercent <= 100;
  const endVisible = endPercent >= 0 && endPercent <= 100;
  clipHandleStart.style.opacity = startVisible ? '1' : '0.3';
  clipHandleEnd.style.opacity = endVisible ? '1' : '0.3';

  clipStartTimeLabel.textContent = formatTimeWithMillis(trimState.startTime);
  clipEndTimeLabel.textContent = formatTimeWithMillis(trimState.endTime);

  updateClipOverviewUI();
}

// 全体ビュー（オーバービュー）の表示を更新
function updateClipOverviewUI() {
  const videoDuration = videoPlayer.duration || 0;
  if (!videoDuration) return;

  const selStartPct = (trimState.startTime / videoDuration) * 100;
  const selEndPct = (trimState.endTime / videoDuration) * 100;
  clipOverviewSelection.style.left = `${selStartPct}%`;
  clipOverviewSelection.style.width = `${Math.max(0.2, selEndPct - selStartPct)}%`;

  const viewStart = clipViewState.viewStartTime;
  const viewEnd = clipViewState.viewEndTime || videoDuration;
  const viewStartPct = (viewStart / videoDuration) * 100;
  const viewEndPct = (viewEnd / videoDuration) * 100;
  clipOverviewViewport.style.left = `${viewStartPct}%`;
  clipOverviewViewport.style.width = `${Math.max(0.5, viewEndPct - viewStartPct)}%`;

  clipOverviewStart.textContent = formatTimeShort(viewStart);
  clipOverviewEnd.textContent = formatTimeShort(viewEnd);
  const viewDur = viewEnd - viewStart;
  if (Math.abs(viewDur - videoDuration) < 0.5) {
    clipOverviewRange.textContent = '全体表示中';
  } else {
    clipOverviewRange.textContent = `表示範囲: ${formatTimeShort(viewDur)}`;
  }
}

/**
 * タイムラインクリック時の共通処理
 * 修飾キー > クリックモードの優先順で動作を決定
 */
function handleTimelineClick(time, event) {
  if (!videoPlayer.duration) return;

  if (event.shiftKey) {
    applyCenteredRange(time, 15, 'クリック位置を中心に範囲設定');
    return;
  }
  if (event.altKey) {
    applyCenteredRange(time, 30, 'クリック位置を中心に範囲設定');
    return;
  }

  if (timelineClickMode === 'range15') {
    applyCenteredRange(time, 15, 'クリック位置を中心に範囲設定');
    return;
  }
  if (timelineClickMode === 'range30') {
    applyCenteredRange(time, 30, 'クリック位置を中心に範囲設定');
    return;
  }

  videoPlayer.currentTime = time;
  if (videoPlayer.paused) {
    videoPlayer.play().catch(err => console.error('再生エラー:', err));
  }
}

/**
 * タイムラインクリックモードを設定し、UIに反映する
 */
function setTimelineClickMode(mode) {
  if (!['seek', 'range15', 'range30'].includes(mode)) return;
  timelineClickMode = mode;
  saveTimelineClickMode();

  document.querySelectorAll('.btn-mode[data-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

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

  let activeHandle = null;
  let dragStartX = 0;
  let dragStartStartTime = 0;
  let dragStartEndTime = 0;
  let dragStartViewStart = 0;
  let dragStartViewEnd = 0;

  function getTimeFromX(clientX) {
    const rect = clipTrack.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const ratio = x / rect.width;
    const viewStart = clipViewState.viewStartTime;
    const viewEnd = clipViewState.viewEndTime || (videoPlayer.duration || 0);
    return viewStart + ratio * (viewEnd - viewStart);
  }

  function getOverviewTimeFromX(clientX) {
    const rect = clipOverviewTrack.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return (x / rect.width) * (videoPlayer.duration || 0);
  }

  clipHandleStart.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    activeHandle = 'start';
    clipHandleStart.setPointerCapture(e.pointerId);
  });

  clipHandleEnd.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    activeHandle = 'end';
    clipHandleEnd.setPointerCapture(e.pointerId);
  });

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

  clipOverviewViewport.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    activeHandle = 'overview-viewport';
    dragStartX = e.clientX;
    dragStartViewStart = clipViewState.viewStartTime;
    dragStartViewEnd = clipViewState.viewEndTime;
    clipOverviewViewport.setPointerCapture(e.pointerId);
  });

  clipOverviewTrack.addEventListener('click', (e) => {
    if (e.target === clipOverviewViewport) return;
    if (!videoPlayer.duration) return;
    const time = getOverviewTimeFromX(e.clientX);
    handleTimelineClick(time, e);
  });

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

      if (newStart < 0) { newStart = 0; newEnd = rangeDuration; }
      if (newEnd > duration) { newEnd = duration; newStart = duration - rangeDuration; }

      trimState.startTime = newStart;
      trimState.endTime = newEnd;
      updateTrimDisplay();
    } else if (activeHandle === 'overview-viewport') {
      const overviewRect = clipOverviewTrack.getBoundingClientRect();
      const deltaX = e.clientX - dragStartX;
      const deltaTime = (deltaX / overviewRect.width) * duration;
      const viewDur = dragStartViewEnd - dragStartViewStart;

      let newViewStart = dragStartViewStart + deltaTime;
      let newViewEnd = dragStartViewEnd + deltaTime;

      if (newViewStart < 0) { newViewStart = 0; newViewEnd = viewDur; }
      if (newViewEnd > duration) { newViewEnd = duration; newViewStart = duration - viewDur; }

      setClipView(newViewStart, newViewEnd, true);
    }
  });

  document.addEventListener('pointerup', (e) => {
    if (!activeHandle) return;

    const wasHandle = activeHandle;
    activeHandle = null;
    clipSelection.style.cursor = 'grab';

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

  clipTrack.addEventListener('click', (e) => {
    if (e.target === clipHandleStart || e.target === clipHandleEnd ||
        e.target === clipSelection || e.target.closest('.clip-timeline__handle')) return;
    const time = getTimeFromX(e.clientX);
    handleTimelineClick(time, e);
  });

  initThumbnailPreview(clipTrack, getTimeFromX);
  initThumbnailPreview(clipOverviewTrack, getOverviewTimeFromX);
}

/**
 * メインタイムラインの表示範囲を設定
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
 */
function initThumbnailPreview(trackEl, timeFromX) {
  const tooltip = document.getElementById('clipThumbnailTooltip');
  const canvas = document.getElementById('clipThumbnailCanvas');
  const timeLabel = document.getElementById('clipThumbnailTime');
  const ctx = canvas.getContext('2d');

  let pendingTime = null;
  let isCapturing = false;

  async function captureFrame(time) {
    const thumbVideo = document.getElementById('thumbnailVideo');
    if (!thumbVideo || !thumbVideo.duration) return;

    isCapturing = true;
    return new Promise((resolve) => {
      const onSeeked = () => {
        try {
          ctx.drawImage(thumbVideo, 0, 0, canvas.width, canvas.height);
        } catch (e) {}
        thumbVideo.removeEventListener('seeked', onSeeked);
        isCapturing = false;
        resolve();
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

    tooltip.style.display = 'block';
    tooltip.style.left = `${e.clientX}px`;
    const rect = trackEl.getBoundingClientRect();
    tooltip.style.top = `${rect.top}px`;
    timeLabel.textContent = formatTimeShort(time);

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

  if (currentTime < trimState.endTime) {
    trimState.startTime = currentTime;
    updateTrimDisplay();

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

  if (currentTime > trimState.startTime) {
    trimState.endTime = currentTime;
    updateTrimDisplay();

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

// 再生位置を監視してトリミング範囲でループ
setInterval(() => {
  if (trimState.isLooping && videoPlayer.currentTime >= trimState.endTime) {
    videoPlayer.currentTime = trimState.startTime;
  }
}, 1000 / 60);

// 動画が一時停止したらループを停止
videoPlayer.addEventListener('pause', () => {
  trimState.isLooping = false;
  loopCheckbox.checked = false;
});
