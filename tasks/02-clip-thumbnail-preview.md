# タスク 02: タイムラインサムネイルプレビュー

## 概要

タイムラインバー上にホバーした際、その時刻のビデオフレームをサムネイルとして表示する。
YouTubeのシークバー上に出る小さいプレビュー画像と同様の体験を提供する。

---

## 現状

- タイムラインバーはテキストのみ（タスク01で実装予定）
- ホバー時のプレビュー機能は未実装

---

## ゴール

```
              ┌──────────┐
              │ [サムネ]  │   ← ホバー位置のフレームプレビュー
              │  0:12.340 │   ← タイムコード
              └──────────┘
              ▼
┌────────────────────────────────────────────┐
│░░░░│████████████████████│░░░░░░░░░░░░░░░│
└────────────────────────────────────────────┘
```

---

## 実装仕様

### HTMLの変更 (`index.html`)

タイムライン要素の外に、フローティングのプレビュートゥールチップを追加:

```html
<div class="clip-thumbnail-tooltip" id="clipThumbnailTooltip" style="display:none;">
  <canvas class="clip-thumbnail-canvas" id="clipThumbnailCanvas" width="160" height="90"></canvas>
  <span class="clip-thumbnail-time" id="clipThumbnailTime">0:00.000</span>
</div>
```

### キャプチャ方式

`<video>` 要素と `<canvas>` 要素を使ってフレームを取得する:

```js
/**
 * 指定時刻のビデオフレームをキャンバスに描画してサムネイルを返す
 * @param {number} timeSeconds - 取得したい時刻（秒）
 * @returns {Promise<void>}
 */
async function captureThumbnail(timeSeconds) {
  return new Promise((resolve) => {
    const video = document.getElementById('videoPlayer');
    const canvas = document.getElementById('clipThumbnailCanvas');
    const ctx = canvas.getContext('2d');

    const onSeeked = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = timeSeconds;
  });
}
```

> **注意**: `video.currentTime` の変更は再生位置に影響するため、ホバー中は一時停止するか、別の `<video>` 要素（非表示）でキャプチャを行うことを推奨。

### 推奨実装: 非表示のサムネイル用 `<video>` 要素

```html
<!-- サムネイル専用（非表示） -->
<video id="thumbnailVideo" style="display:none;" muted></video>
```

- メインの `videoPlayer` と同じ `src`（Blob URL）をセット
- ホバー時に `thumbnailVideo.currentTime` を変更してフレームをキャプチャ
- メインの再生位置・状態に影響しない

### ホバーイベント (`renderer.js`)

```js
clipTrack.addEventListener('mousemove', async (e) => {
  const rect = clipTrack.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  const hoverTime = ratio * trimState.duration;

  // トゥールチップ表示
  await captureThumbnail(hoverTime);
  showThumbnailTooltip(e.clientX, hoverTime);
});

clipTrack.addEventListener('mouseleave', () => {
  hideThumbnailTooltip();
});
```

### スロットリング

`mousemove` 毎にシークするとパフォーマンスが落ちるため、
`requestAnimationFrame` またはデバウンス（150ms）でキャプチャを間引く。

---

## CSSの追加

```css
.clip-thumbnail-tooltip {
  position: fixed;  /* pointer-eventsの影響を受けないよう fixed */
  z-index: 1000;
  background: rgba(0,0,0,0.85);
  border-radius: 4px;
  padding: 4px;
  pointer-events: none;
  transform: translate(-50%, -110%); /* ホバー位置の上に表示 */
}

.clip-thumbnail-canvas {
  display: block;
  border-radius: 2px;
}

.clip-thumbnail-time {
  display: block;
  text-align: center;
  color: #fff;
  font-size: 11px;
  margin-top: 2px;
}
```

---

## 受け入れ条件

- [ ] タイムラインバー上にマウスを乗せると、その位置のフレームのサムネイルが上部に表示される
- [ ] サムネイル下にタイムコードが表示される
- [ ] メインの動画再生位置が変化しない（別video要素でキャプチャ）
- [ ] マウスがタイムライン外に出るとサムネイルが消える
- [ ] パフォーマンスに問題がない（mousemove をスロットリング）

---

## 影響するファイル

- `index.html` — サムネイルトゥールチップ要素・サムネイル用video要素の追加
- `styles.css` — トゥールチップのスタイル追加
- `renderer.js` — `captureThumbnail()` 関数・ホバーイベントの実装
