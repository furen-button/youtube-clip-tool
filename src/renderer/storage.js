/**
 * localStorage ベースの UI ヘルパー
 * InputHistory: 入力履歴を datalist でサジェスト表示
 * TextPresets: セリフ・メモのプリセットをチップ表示
 *
 * 依存: utils.js (escapeHtml)
 */

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
 * お気に入りチャンネル管理
 * 登録チャンネル（{channelId, title, thumbnail}）を localStorage に保存する。
 */
const FavoriteChannels = {
  STORAGE_KEY: 'favoriteChannels',

  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      console.error('お気に入りチャンネルの読み込みエラー:', e);
      return [];
    }
  },

  save(list) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('お気に入りチャンネルの保存エラー:', e);
    }
  },

  has(channelId) {
    return this.load().some(c => c.channelId === channelId);
  },

  /** 追加（既存なら情報を更新）。追加後の一覧を返す */
  add(channel) {
    if (!channel || !channel.channelId) return this.load();
    const list = this.load().filter(c => c.channelId !== channel.channelId);
    list.push({
      channelId: channel.channelId,
      title: channel.title || channel.channelId,
      thumbnail: channel.thumbnail || ''
    });
    list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ja'));
    this.save(list);
    return list;
  },

  /** 削除。削除後の一覧を返す */
  remove(channelId) {
    const list = this.load().filter(c => c.channelId !== channelId);
    this.save(list);
    return list;
  },
};
