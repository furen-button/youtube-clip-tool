/**
 * 波形表示 (WaveSurfer)
 * WaveSurfer インスタンスの生成・Region 同期・ズーム管理
 *
 * 依存: utils.js (showToast)
 *       dom-elements.js (waveformContainer, waveformLoading, normalizeCheckbox, zoomToTrimBtn, resetZoomBtn)
 */

// WaveSurfer インスタンス
let wavesurfer = null;
let wavesurferRegions = null;
let trimRegion = null;
let waveformVisible = false;

// ズームパディング設定（秒）
const zoomPaddingLevels = [5, 60, 300]; // 5秒、1分、5分
let currentPaddingIndex = 0;
let zoomPadding = zoomPaddingLevels[currentPaddingIndex];

// 1時間以上の動画は事前生成peaksを使ってOOMクラッシュを回避する
const LONG_VIDEO_THRESHOLD_SEC = 3600;

// 波形をトリミング範囲にズーム
function updateWaveformZoom() {
  if (!wavesurfer || !videoPlayer.duration) return;

  const duration = videoPlayer.duration;
  const startTime = trimState.startTime;
  const endTime = trimState.endTime;
  const width = waveformContainer.clientWidth;

  const displayStartTime = Math.max(0, startTime - zoomPadding);
  const displayEndTime = Math.min(duration, endTime + zoomPadding);
  const displayDuration = displayEndTime - displayStartTime;
  const zoomLevel = width / displayDuration;

  try {
    wavesurfer.zoom(zoomLevel);
    wavesurfer.setScrollTime(displayStartTime);
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

  currentPaddingIndex = (currentPaddingIndex + 1) % zoomPaddingLevels.length;
  zoomPadding = zoomPaddingLevels[currentPaddingIndex];

  let paddingText;
  if (zoomPadding < 60) {
    paddingText = `${zoomPadding}秒`;
  } else if (zoomPadding < 3600) {
    paddingText = `${zoomPadding / 60}分`;
  } else {
    paddingText = `${zoomPadding / 3600}時間`;
  }

  updateWaveformZoom();
  showToast(`ズームパディング: ${paddingText}`, 'info');
}

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

  wavesurferRegions = wavesurfer.registerPlugin(WaveSurfer.Regions.create());

  wavesurfer.registerPlugin(WaveSurfer.Minimap.create({
    height: 30,
    waveColor: '#999',
    progressColor: '#667eea',
    cursorColor: '#e53e3e',
    barWidth: 1,
    barGap: 1
  }));

  if (videoPlayer.duration) {
    updateWaveformRegion();
  }

  let regionUpdateTimer = null;
  let regionUpdateType = null;

  wavesurferRegions.on('region-updated', (region) => {
    if (region.id === 'trim-region') {
      const oldStartTime = trimState.startTime;
      const oldEndTime = trimState.endTime;

      trimState.startTime = region.start;
      trimState.endTime = region.end;
      trimState.duration = region.end - region.start;

      if (Math.abs(region.start - oldStartTime) > 0.01) {
        regionUpdateType = 'start';
      } else if (Math.abs(region.end - oldEndTime) > 0.01) {
        regionUpdateType = 'end';
      }

      updateClipTimelineUI();
      autoGenerateFileName();
      autoGenerateClipUrl();
      updateClipPanel();

      if (regionUpdateTimer) {
        clearTimeout(regionUpdateTimer);
      }

      regionUpdateTimer = setTimeout(() => {
        trimState.isLooping = true;
        loopCheckbox.checked = true;

        if (regionUpdateType === 'start') {
          videoPlayer.currentTime = trimState.startTime;
        } else if (regionUpdateType === 'end') {
          const playbackTime = Math.max(trimState.endTime - 2, trimState.startTime);
          videoPlayer.currentTime = playbackTime;
        }

        videoPlayer.play().catch(e => console.error('再生エラー:', e));
        regionUpdateType = null;
      }, 300);
    }
  });

  wavesurfer.on('ready', () => {
    waveformLoading.style.display = 'none';
    console.log('WaveSurfer ready');
  });

  wavesurfer.on('scroll', (visibleStartTime, visibleEndTime) => {
    if (typeof visibleStartTime === 'number' && typeof visibleEndTime === 'number') {
      clipViewState.viewStartTime = visibleStartTime;
      clipViewState.viewEndTime = visibleEndTime;
      updateClipTimelineUI();
    }
  });

  wavesurfer.on('click', (relativeX) => {
    const newTime = relativeX * videoPlayer.duration;
    videoPlayer.currentTime = newTime;
    if (videoPlayer.paused) {
      videoPlayer.play().catch(e => console.error('再生エラー:', e));
    }
  });

  wavesurfer.on('interaction', (newTime) => {
    videoPlayer.currentTime = newTime;
    if (videoPlayer.paused) {
      videoPlayer.play().catch(e => console.error('再生エラー:', e));
    }
  });

  wavesurfer.on('error', (error) => {
    waveformLoading.style.display = 'none';
    waveformLoading.textContent = '波形の生成に失敗しました';
  });

  return wavesurfer;
}

// 波形上のトリミング範囲を更新
function updateWaveformRegion() {
  if (!wavesurferRegions || !videoPlayer.duration) return;

  if (trimRegion) {
    trimRegion.remove();
    trimRegion = null;
  }

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
    const duration = videoPlayer.duration;
    const width = waveformContainer.clientWidth;
    const zoomLevel = width / duration;
    wavesurfer.zoom(zoomLevel);
    wavesurfer.setScrollTime(0);
  } catch (error) {
    console.error('ズームリセットエラー:', error);
  }
});
