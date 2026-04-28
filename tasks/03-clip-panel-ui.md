# タスク 03: クリップパネルUI（タイトル・保存・共有）

## 概要

YouTubeのクリップ作成パネルに相当するUIを追加する。
タイムライン下部に「クリップタイトル入力」「クリップ作成（保存）ボタン」を配置し、
クリップ情報をまとめて確認・保存できる体験にする。

---

## 現状

- メタデータ（serif / ruby / カテゴリ / memo など）は右パネルに散在している
- 「クリップとして保存」という概念が UI 上で明示されていない

---

## ゴール

タイムライン直下に YouTubeクリップ風のコンパクトなパネルを追加:

```
┌──────────────────────────────────────────────────────┐
│ [タイムラインバー (タスク01)]                          │
└──────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────┐
│  📋 クリップ情報                                      │
│                                                      │
│  タイトル: [ フレン、驚く　　　　　　　　　　　  ]    │
│  時間範囲: 0:05.000 〜 0:30.000  (25.000秒)          │
│  クリップURL: https://youtu.be/xxx?t=5  [コピー]     │
│                                                      │
│  [💾 JSON保存]  [🎬 MP4エクスポート]  [🔗 URLコピー] │
└──────────────────────────────────────────────────────┘
```

---

## 実装仕様

### HTMLの変更 (`index.html`)

タイムラインバーの直後に追加:

```html
<div class="clip-panel" id="clipPanel">
  <div class="clip-panel__header">
    <svg .../>  <!-- クリップアイコン -->
    <span>クリップ情報</span>
  </div>

  <div class="clip-panel__body">
    <!-- タイトル入力（既存 #serif を兼用、または別フィールド） -->
    <div class="clip-panel__field">
      <label for="clipTitle">タイトル</label>
      <input type="text" id="clipTitle" class="clip-panel__input"
             placeholder="クリップのタイトルを入力">
    </div>

    <!-- 時間範囲表示（読み取り専用、trimStateに連動） -->
    <div class="clip-panel__range">
      <span id="clipPanelStart">0:00.000</span>
      <span class="clip-panel__range-sep">〜</span>
      <span id="clipPanelEnd">0:00.000</span>
      <span class="clip-panel__duration" id="clipPanelDuration">(0.000秒)</span>
    </div>

    <!-- クリップURL -->
    <div class="clip-panel__field clip-panel__field--url">
      <label>クリップURL</label>
      <div class="clip-panel__url-row">
        <input type="text" id="clipPanelUrl" class="clip-panel__input" readonly>
        <button id="clipPanelCopyUrlBtn" class="btn btn-sm btn-secondary">コピー</button>
      </div>
    </div>
  </div>

  <div class="clip-panel__actions">
    <button id="clipPanelSaveBtn" class="btn btn-primary">💾 JSON保存</button>
    <button id="clipPanelExportBtn" class="btn btn-success">🎬 MP4エクスポート</button>
    <button id="clipPanelCopyBtn" class="btn btn-info">🔗 URLコピー</button>
  </div>
</div>
```

### 既存フィールドとの統合方針

| clipPanel フィールド | 既存フィールド | 方針 |
|---|---|---|
| `#clipTitle` | `#serif` | 双方向同期（どちらを編集しても両方更新） |
| クリップURL表示 | `#clipUrl` | `clipUrl` の値を表示、コピーボタンで連動 |
| JSON保存ボタン | `#saveMetadataBtn` | 同じ処理を呼び出す（`saveMetadata()`） |
| MP4エクスポートボタン | `#exportVideoBtn` | 同じ処理を呼び出す（`exportVideo()`） |

既存の詳細メタデータ入力エリア（セリフ / ruby / カテゴリ / memo）は残す。
`clipPanel` はあくまで「よく使う操作へのショートカット」として機能させる。

### JavaScriptの追加 (`renderer.js`)

```js
/**
 * クリップパネルの時刻・URLを更新する
 * trimState が変化するたびに呼び出す
 */
function updateClipPanel() {
  const { startTime, endTime } = trimState;
  const duration = endTime - startTime;

  document.getElementById('clipPanelStart').textContent = formatTime(startTime);
  document.getElementById('clipPanelEnd').textContent = formatTime(endTime);
  document.getElementById('clipPanelDuration').textContent =
    `(${duration.toFixed(3)}秒)`;

  // クリップURL再生成
  const url = generateClipUrl();
  document.getElementById('clipPanelUrl').value = url;
}
```

- `trimState` を変更する既存の全箇所（スライダー・ハンドル・微調整ボタン）で `updateClipPanel()` を追加呼び出し

### clipTitle と serif の同期

```js
document.getElementById('clipTitle').addEventListener('input', (e) => {
  serifInput.value = e.target.value;
  metadata.serif = e.target.value;
  updateFileName();
});

serifInput.addEventListener('input', (e) => {
  document.getElementById('clipTitle').value = e.target.value;
});
```

---

## CSS (`styles.css`)

```css
.clip-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  margin-top: 8px;
}

.clip-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 12px;
}

.clip-panel__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.clip-panel__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.clip-panel__field label {
  font-size: 12px;
  color: #718096;
  font-weight: 500;
}

.clip-panel__input {
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  width: 100%;
}

.clip-panel__range {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #2d3748;
}

.clip-panel__duration {
  color: #718096;
  font-size: 13px;
}

.clip-panel__url-row {
  display: flex;
  gap: 8px;
}

.clip-panel__actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}
```

---

## 受け入れ条件

- [ ] タイムラインバー直下にクリップパネルが表示される
- [ ] タイトル入力欄と既存の `#serif` フィールドが双方向同期する
- [ ] トリミング範囲を変更するとパネルの時刻表示・URLが自動更新される
- [ ] 「JSON保存」「MP4エクスポート」「URLコピー」の各ボタンが機能する
- [ ] URLコピーボタンでクリップURLがクリップボードにコピーされる
- [ ] 動画が未選択のとき、パネルはグレーアウトまたは非表示

---

## 影響するファイル

- `index.html` — クリップパネル要素の追加
- `styles.css` — `.clip-panel` スタイル群の追加
- `renderer.js` — `updateClipPanel()` の追加、既存 `updateTrimState()` との連携
