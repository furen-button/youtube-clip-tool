# タスク 01: クリップタイムラインバーUI

## 概要

YouTubeのクリップ機能に似た、ビデオプレイヤー直下に配置するタイムラインバーを実装する。
現在の `range-slider-container`（2本の重なったHTMLスライダー）を廃止し、Canvasまたはdivベースのタイムラインバーに置き換える。

---

## 現状

- `index.html` の `#trimmingSection` にHTML `<input type="range">` が2本重なって実装されている
- 背景トラック＋ハイライトdivで選択範囲を表示
- 見た目がブラウザデフォルトのスライダーで、YouTubeらしくない

---

## ゴール（YouTubeクリップUIの再現）

```
┌──────────────────────────────────────────┐
│            ビデオプレイヤー               │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐  ← タイムラインバー全体
│░░░░│██████████████████████│░░░░░░░░░░░░│  ← ░ = 除外範囲, █ = 選択範囲
│    ▲                      ▲             │
│  開始ハンドル           終了ハンドル     │
│  0:05                   0:30            │  ← ハンドル直下に時刻表示
└──────────────────────────────────────────┘
         ↑ 再生ヘッド（細い縦線）
```

---

## 実装仕様

### HTML (`index.html`)

- `#rangeSliderContainer`（既存のスライダーdiv）を削除
- タイムライン用の新要素を追加:

```html
<div class="clip-timeline" id="clipTimeline">
  <!-- 背景トラック -->
  <div class="clip-timeline__track" id="clipTrack">
    <!-- 選択範囲ハイライト -->
    <div class="clip-timeline__selection" id="clipSelection"></div>
    <!-- 開始ハンドル -->
    <div class="clip-timeline__handle clip-timeline__handle--start" id="clipHandleStart">
      <span class="clip-timeline__time" id="clipStartTime">0:00</span>
    </div>
    <!-- 終了ハンドル -->
    <div class="clip-timeline__handle clip-timeline__handle--end" id="clipHandleEnd">
      <span class="clip-timeline__time" id="clipEndTime">0:00</span>
    </div>
    <!-- 再生ヘッド -->
    <div class="clip-timeline__playhead" id="clipPlayhead"></div>
  </div>
</div>
```

### CSS (`styles.css`)

| 要素 | スタイル仕様 |
|---|---|
| `.clip-timeline` | `width: 100%; height: 60px; position: relative; user-select: none; margin: 8px 0;` |
| `.clip-timeline__track` | `width: 100%; height: 100%; background: #1a1a1a; border-radius: 4px; position: relative; overflow: hidden;` |
| `.clip-timeline__selection` | `position: absolute; height: 100%; background: rgba(255,255,255,0.25); border-top: 2px solid #fff; border-bottom: 2px solid #fff; pointer-events: none;` |
| `.clip-timeline__handle` | `position: absolute; width: 16px; height: 100%; background: #fff; cursor: ew-resize; border-radius: 3px; transform: translateX(-50%); display: flex; align-items: flex-end; justify-content: center;` |
| `.clip-timeline__time` | `font-size: 11px; color: #fff; background: rgba(0,0,0,0.7); padding: 2px 4px; border-radius: 3px; white-space: nowrap; margin-bottom: 4px;` |
| `.clip-timeline__playhead` | `position: absolute; width: 2px; height: 100%; background: #f00; pointer-events: none; transform: translateX(-50%);` |

### JavaScript (`renderer.js`)

1. **初期化**: `loadVideo()` 後に `initClipTimeline()` を呼ぶ
2. **ドラッグ処理** (`pointerdown` / `pointermove` / `pointerup`):
   - 開始ハンドルのドラッグ: `trimState.startTime` を更新、終了位置を超えないよう制限
   - 終了ハンドルのドラッグ: `trimState.endTime` を更新、開始位置を下回らないよう制限
   - 選択範囲内ドラッグ: 選択範囲全体を移動（両ハンドル同時移動）
3. **再生ヘッド更新**: `videoPlayer.timeupdate` イベントで位置を同期
4. **既存スライダーとの同期**: 既存の `startSlider` / `endSlider` と `trimState` は引き続き使用、タイムラインの操作も同じ `trimState` を更新する
   - または既存スライダーを完全廃止してタイムラインに一本化する（推奨）

---

## 受け入れ条件

- [ ] タイムラインバーがビデオプレイヤーの直下に表示される
- [ ] 開始・終了ハンドルをマウスドラッグで移動できる
- [ ] 選択範囲が白いハイライトで表示される
- [ ] 各ハンドルの直下（または上）に現在の時刻が表示される
- [ ] 再生ヘッドが動画の再生位置に追従する
- [ ] タイムライン上クリックで再生位置を変更できる
- [ ] 既存の微調整ボタン・「現在位置を開始/終了に」ボタンとの連動が正常に動く
- [ ] WaveSurfer の Regions と時刻が一致する

---

## 影響するファイル

- `index.html` — タイムライン要素の追加・既存スライダーの削除
- `styles.css` — タイムラインのスタイル追加
- `renderer.js` — `initClipTimeline()` 関数の追加、スライダーイベントをタイムラインイベントに置き換え
