/**
 * チャンネルから探す（お気に入りチャンネル登録 + 年月ブラウズ + 並び替え）
 *
 * 依存: utils.js (escapeHtml, showToast, formatDuration, formatNumber)
 *       dom-elements.js (channelInput, addChannelBtn, favoriteChannelList, channelBrowser,
 *                        channelBrowserThumb, channelBrowserTitle, channelSortSelect,
 *                        monthPickerYear, monthPickerGrid, yearPrevBtn, yearNextBtn, channelResults)
 *       storage.js (FavoriteChannels)
 *       renderer.js (setDownloadUrl, openInBrowser) — 実行時に参照
 */

// 選択中チャンネルとブラウズ状態
let selectedChannel = null;      // { channelId, title, thumbnail }
let channelBrowseYear = null;    // 表示中の年
let channelBrowseMonth = null;   // 選択中の月 (1-12)、未選択は null
let lastChannelVideos = [];      // 直近に取得した動画（並び替え用に保持）

/**
 * お気に入りチャンネルのチップ一覧を描画
 */
function renderFavoriteChannels() {
  if (!favoriteChannelList) return;
  const list = FavoriteChannels.load();
  favoriteChannelList.innerHTML = '';

  list.forEach((ch) => {
    const chip = document.createElement('div');
    chip.className = 'favorite-channel';
    if (selectedChannel && selectedChannel.channelId === ch.channelId) {
      chip.classList.add('active');
    }
    chip.title = ch.title;

    if (ch.thumbnail) {
      const img = document.createElement('img');
      img.className = 'favorite-channel__thumb';
      img.src = ch.thumbnail;
      img.alt = '';
      chip.appendChild(img);
    }

    const label = document.createElement('span');
    label.className = 'favorite-channel__name';
    label.textContent = ch.title;
    chip.appendChild(label);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'favorite-channel__remove';
    remove.textContent = '×';
    remove.title = 'チャンネルを削除';
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      FavoriteChannels.remove(ch.channelId);
      if (selectedChannel && selectedChannel.channelId === ch.channelId) {
        selectedChannel = null;
        channelBrowser.style.display = 'none';
      }
      renderFavoriteChannels();
    });
    chip.appendChild(remove);

    chip.addEventListener('click', () => selectChannel(ch));
    favoriteChannelList.appendChild(chip);
  });
}

/**
 * 入力からチャンネルを解決して登録する
 */
async function addChannelFromInput() {
  const input = channelInput.value.trim();
  if (!input) {
    showToast('チャンネルURL / @ハンドル / 名前を入力してください', 'warning');
    return;
  }

  const prevLabel = addChannelBtn.textContent;
  addChannelBtn.disabled = true;
  addChannelBtn.textContent = '解決中...';
  try {
    const result = await window.electronAPI.resolveChannel(input);
    if (!result.success) {
      showToast(`チャンネルの登録に失敗: ${result.error}`, 'error');
      return;
    }
    const channel = result.data;
    const already = FavoriteChannels.has(channel.channelId);
    FavoriteChannels.add(channel);
    channelInput.value = '';
    renderFavoriteChannels();
    showToast(already ? `「${channel.title}」は登録済みです` : `「${channel.title}」を登録しました`, 'success');
    selectChannel(channel);
  } catch (error) {
    showToast(`チャンネルの登録に失敗: ${error.message}`, 'error');
  } finally {
    addChannelBtn.disabled = false;
    addChannelBtn.textContent = prevLabel;
  }
}

/**
 * チャンネルを選択し、年月ブラウザを表示して当月を取得する
 */
function selectChannel(channel) {
  selectedChannel = channel;
  channelBrowser.style.display = 'block';
  channelBrowserThumb.src = channel.thumbnail || '';
  channelBrowserThumb.style.display = channel.thumbnail ? 'block' : 'none';
  channelBrowserTitle.textContent = channel.title;

  const now = new Date();
  channelBrowseYear = now.getFullYear();
  channelBrowseMonth = now.getMonth() + 1;

  renderFavoriteChannels();  // active 表示の更新
  renderMonthGrid();
  fetchChannelMonth();
}

/**
 * 年ナビ + 12ヶ月グリッドを描画
 */
function renderMonthGrid() {
  monthPickerYear.textContent = String(channelBrowseYear);
  monthPickerGrid.innerHTML = '';

  const nextYearLimit = new Date().getFullYear();
  yearNextBtn.disabled = channelBrowseYear >= nextYearLimit;

  for (let m = 1; m <= 12; m++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'month-picker__month';
    if (m === channelBrowseMonth) btn.classList.add('active');
    btn.textContent = `${m}月`;
    btn.addEventListener('click', () => {
      channelBrowseMonth = m;
      renderMonthGrid();
      fetchChannelMonth();
    });
    monthPickerGrid.appendChild(btn);
  }
}

/**
 * 選択中チャンネル・年月の動画を取得して表示
 */
async function fetchChannelMonth() {
  if (!selectedChannel || !channelBrowseMonth) return;

  channelResults.innerHTML = '<div class="loading">読み込み中</div>';
  try {
    const result = await window.electronAPI.getChannelVideos(
      selectedChannel.channelId, channelBrowseYear, channelBrowseMonth
    );
    if (!result.success) {
      channelResults.innerHTML = `<p class="error">取得に失敗しました: ${escapeHtml(result.error)}</p>`;
      return;
    }
    lastChannelVideos = (result.data && result.data.videos) || [];
    displayChannelVideos();
    if (result.data && result.data.truncated) {
      showToast('この月の動画が多いため一部のみ取得しました', 'warning', 4000);
    }
  } catch (error) {
    channelResults.innerHTML = `<p class="error">エラーが発生しました: ${escapeHtml(error.message)}</p>`;
  }
}

/**
 * 現在のソート設定で lastChannelVideos を並び替える
 */
function getSortedChannelVideos() {
  const videos = [...lastChannelVideos];
  const mode = channelSortSelect.value;
  if (mode === 'date_asc') {
    videos.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  } else if (mode === 'views_desc') {
    videos.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
  } else {
    // date_desc（既定）
    videos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }
  return videos;
}

/**
 * 動画カードを channelResults に描画
 */
function displayChannelVideos() {
  const videos = getSortedChannelVideos();
  if (videos.length === 0) {
    channelResults.innerHTML = `<p>${channelBrowseYear}年${channelBrowseMonth}月に公開された動画はありません</p>`;
    return;
  }

  channelResults.innerHTML = `<div class="channel-results__count">${channelBrowseYear}年${channelBrowseMonth}月: ${videos.length}件</div>` +
    videos.map((video) => {
      const published = video.publishedAt ? new Date(video.publishedAt).toLocaleDateString('ja-JP') : '';
      return `
      <div class="video-card">
        <img src="${video.thumbnail}" alt="${escapeHtml(video.title)}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22180%22%3E%3Crect fill=%22%23ddd%22 width=%22320%22 height=%22180%22/%3E%3C/svg%3E'">
        <div class="video-card-content">
          <div class="video-card-title">${escapeHtml(video.title)}</div>
          <div class="video-card-info">
            <div>公開日: ${escapeHtml(published)}</div>
            <div>再生時間: ${formatDuration(video.duration)}</div>
            <div>視聴回数: ${formatNumber(video.viewCount)}</div>
          </div>
          <div class="video-card-actions">
            <button class="btn btn-info" onclick="setDownloadUrl('${video.url}')">ダウンロード</button>
            <button class="btn btn-secondary" onclick="openInBrowser('${video.url}')" style="font-size: 0.9rem; padding: 8px 16px;">開く</button>
          </div>
        </div>
      </div>`;
    }).join('');
}

/**
 * チャンネルブラウザの初期化（renderer.js の initialize から呼ぶ）
 */
function initChannelBrowser() {
  renderFavoriteChannels();

  if (addChannelBtn) addChannelBtn.addEventListener('click', addChannelFromInput);
  if (channelInput) {
    channelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addChannelFromInput();
    });
  }
  if (channelSortSelect) {
    channelSortSelect.addEventListener('change', () => {
      if (lastChannelVideos.length) displayChannelVideos();
    });
  }
  if (yearPrevBtn) {
    yearPrevBtn.addEventListener('click', () => {
      channelBrowseYear -= 1;
      renderMonthGrid();
      fetchChannelMonth();
    });
  }
  if (yearNextBtn) {
    yearNextBtn.addEventListener('click', () => {
      const limit = new Date().getFullYear();
      if (channelBrowseYear >= limit) return;
      channelBrowseYear += 1;
      renderMonthGrid();
      fetchChannelMonth();
    });
  }
}
