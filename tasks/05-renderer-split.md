# タスク 05: renderer.js を単一責任で分割

## 概要

`renderer.js` は約 4600 行の単一ファイルで、UI レイアウト・波形・タイムライン・コメント密度・盛り上がり・キーボードショートカット・テンプレート・各種モーダルなど、責務が混在している。
影響範囲を局所化しやすくするため、責務ごとに `src/renderer/*.js` へ分割する。

---

## 制約

- `BrowserWindow` は `contextIsolation: true` / `nodeIntegration: false`。
  レンダラーで `require()` は使えない。
- 既存の HTML テンプレート文字列内に `onclick="playVideo(...)"` `onclick="jumpToHotspot(...)"` `onclick="setDownloadUrl(...)"` 等が散在している。
  これらが解決される必要があるため、対象関数は **window スコープのグローバル** であり続ける必要がある。
- WaveSurfer / simple-keyboard / Regions プラグイン等は CDN 経由で `<script>` タグから読み込まれ、
  グローバル変数 `WaveSurfer` / `SimpleKeyboard` で参照されている。
- ESM (`<script type="module">`) ではなく **通常の `<script>` タグの読み込み順** で依存解決する方針とする。
  （ESM 化すると onclick グローバル参照を全て書き換える必要があり影響が大きいため）

---

## 現状の構造（renderer.js 内の主要セクション）

| 行範囲（目安） | セクション |
|---|---|
| L1–L133 | DOM要素取得・グローバル状態 (`trimState` / `clipViewState` / `metadata` / `currentVideoFile` / コメント密度 / 盛り上がり / カテゴリ ほか) |
| L135–L267 | `InputHistory` |
| L269–L345 | `TextPresets` |
| L347–L497 | `FileNameTemplate` + `buildTemplateContext` |
| L499–L515 | `timelineClickMode` 永続化 |
| L517–L833 | `initialize` / `initInputHistories` / `initTextPresets` / カテゴリ / 微調整設定 |
| L835–L935 | カテゴリボタン / タブ / トースト |
| L938–L1310 | YouTube 検索・DL・画質選択モーダル |
| L1312–L1530 | ダウンロード済み一覧・`playVideo` |
| L1534–L1808 | ステータス表示・整形ユーティリティ・`updateTrimDisplay` 系 |
| L1810–L2240 | クリップタイムライン（メイン + オーバービュー + サムネプレビュー + 再生ヘッドアニメ）|
| L2243–L2325 | 微調整・`framesToSeconds` / `adjustStartTime` / `adjustEndTime` |
| L2326–L2585 | WaveSurfer (`initWaveSurfer` / `showWaveform` / Region 同期 / ズーム) |
| L2587–L2735 | カテゴリ選択・`autoGenerateFileName` / `autoGenerateClipUrl` / `katakanaToHiragana` / `resolveYouTubeUrlForCurrentVideo` |
| L2736–L2935 | `buildExportCommand` などエクスポート |
| L2937–L3408 | キーボードショートカット定義・編集 UI・`handleGlobalKeyDown` / `executeShortcutAction` |
| L3409–L3543 | カテゴリ管理モーダル |
| L3545–L3662 | ファイル名テンプレートモーダル |
| L3664–L3839 | `resetAllSettings` |
| L3841–L4053 | コメント密度（`loadAndShowCommentDensity` / `drawCommentDensity` ほか） |
| L4055–L4344 | 盛り上がり検出・`HotspotTooltip` |
| L4345–L4406 | `jumpToHotspot` / `applyCenteredRange` / `formatTimeShort` |
| L4408–L4642 | `ColumnResizer` ほか残り |

---

## ゴール: 分割後のファイル構成

```
src/renderer/
├── utils.js          — 純粋ユーティリティ（escapeHtml, formatXxx, showToast, removeToast, katakanaToHiragana）
├── storage.js        — InputHistory, TextPresets（localStorage ベースの UI ヘルパー）
├── file-name.js      — FileNameTemplate, buildTemplateContext, autoGenerateFileName, autoGenerateClipUrl,
│                       buildExportCommand, resolveYouTubeUrlForCurrentVideo, ファイル名テンプレートモーダル
├── waveform.js       — initWaveSurfer, updateWaveformRegion, showWaveform, updateWaveformZoom,
│                       cycleZoomPadding, LONG_VIDEO_THRESHOLD_SEC
├── clip-timeline.js  — clipViewState 関連 UI（initClipTimeline, updateClipTimelineUI,
│                       updateClipOverviewUI, animatePlayhead, handleTimelineClick, setTimelineClickMode,
│                       loadTimelineClickMode, saveTimelineClickMode, initThumbnailPreview,
│                       setClipView, updateClipPlayhead）
├── shortcuts.js      — defaultShortcuts, ショートカット編集モーダル, handleGlobalKeyDown,
│                       executeShortcutAction, formatKeyName, getShortcutString
├── comments.js       — コメント密度（loadAndShowCommentDensity, drawCommentDensity, getDensityColor）
│                       + 盛り上がり検出（detectAndShowHotspots, HotspotTooltip）
│                       + resetCommentStateForVideoSwitch, updateCommentButtons, jumpToHotspot
└── layout.js         — ColumnResizer
```

`renderer.js`（約 1500 行に縮小）に残るもの:

- DOM 要素取得・グローバル状態変数の宣言
- 動画検索・ダウンロード・画質選択モーダル
- ダウンロード済み一覧・`playVideo`
- カテゴリ管理（state + モーダル）
- 微調整設定（state + ラベル更新）
- `initialize` 関数とトップレベルのイベントバインド
- `resetAllSettings`
- `showStatus` / `switchTab` / トリミング UI 同期 (`updateTrimDisplay`) ・`applyCenteredRange`

---

## index.html の `<script>` 読み込み順

依存関係を踏まえた順序（後ろほど依存側）:

```html
<!-- 既存の CDN 読み込みは変更なし -->
<script src="https://unpkg.com/wavesurfer.js@7/..."></script>
<script src="https://cdn.jsdelivr.net/npm/simple-keyboard@..."></script>

<!-- 分割スクリプト（依存順） -->
<script src="src/renderer/utils.js"></script>
<script src="src/renderer/storage.js"></script>
<script src="src/renderer/file-name.js"></script>
<script src="src/renderer/waveform.js"></script>
<script src="src/renderer/clip-timeline.js"></script>
<script src="src/renderer/comments.js"></script>
<script src="src/renderer/shortcuts.js"></script>
<script src="src/renderer/layout.js"></script>

<!-- 最後に状態定義＋初期化＋イベントバインド -->
<script src="renderer.js"></script>
```

### 状態変数の取り扱い

- `trimState` / `clipViewState` / `metadata` / `currentVideoFile` / `commentDensityData` / `detectedHotspots` /
  `liveChatComments` / `liveChatCommentsVideoId` / `availableCategories` / `fineTuneSettings` /
  `wavesurfer` / `wavesurferRegions` / `trimRegion` / `waveformVisible` / `timelineClickMode` /
  `shortcuts` / `editingShortcutId` / `simpleKeyboard` などのグローバル変数は **`renderer.js` で `let` 宣言を維持**。
- 分割先のファイルから書き換える場合は `let` でなく `window.X = ...` 経由でも書けるが、
  既存コードの記述スタイル維持のため、宣言は `renderer.js` 側に残し、各ファイルからは
  「同一グローバルスコープ上の変数」として直接参照・代入する。
- HTML が先に load し、CDN 読み込みも先行するため DOM 要素取得は `renderer.js` の冒頭で問題なく動作する。
  ただし分割ファイル側で DOM 要素を直接 `document.getElementById(...)` で取得する場合、
  HTML パース後に走るため安全。

### onclick グローバル参照

`onclick="playVideo(...)"` `onclick="jumpToHotspot(...)"` `onclick="setDownloadUrl(...)"`
`onclick="openInBrowser(...)"` 等の inline ハンドラは、対象関数を **`function name() {}` 宣言**
で書き続ける限り `<script>` 読み込み時にグローバルに登録されるためそのまま動作する。

---

## 実装ステップ

### フェーズ A: 副作用の少ないモジュールを抽出

1. `src/renderer/utils.js` を新規作成
   - 移動: `escapeHtml`, `formatDuration`, `formatNumber`, `formatFileSize`, `formatTimeWithMillis`, `formatTimeShort`, `katakanaToHiragana`, `showToast`, `removeToast`
2. `src/renderer/storage.js` を新規作成
   - 移動: `InputHistory`, `TextPresets` の object 定義
   - **注意**: `InputHistory.bind` が `escapeHtml` を参照するので utils.js が先にロードされる順序を保証する
3. `src/renderer/layout.js` を新規作成
   - 移動: `ColumnResizer`
4. `index.html` に `<script>` タグ 3 つを追加し、renderer.js から該当コードを削除
5. アプリ起動・主要操作で動作確認

### フェーズ B: 機能モジュールを抽出

6. `src/renderer/file-name.js`
   - 移動: `FileNameTemplate`, `buildTemplateContext`, `autoGenerateFileName`,
     `autoGenerateClipUrl`, `buildExportCommand`, `resolveYouTubeUrlForCurrentVideo`,
     `openFileNameTemplateModal`, `closeFileNameTemplateModal`, `renderTokenCards`,
     `insertTokenAtCursor`, `updateFileNameTemplatePreview`, `saveFileNameTemplate`,
     `resetFileNameTemplate`
7. `src/renderer/waveform.js`
   - 移動: `initWaveSurfer`, `updateWaveformRegion`, `showWaveform`,
     `updateWaveformZoom`, `cycleZoomPadding`, `LONG_VIDEO_THRESHOLD_SEC`,
     正規化チェックボックスのイベントリスナー
8. `src/renderer/clip-timeline.js`
   - 移動: `updateClipTimelineUI`, `updateClipOverviewUI`, `updateClipPlayhead`,
     `animatePlayhead`, `handleTimelineClick`, `setTimelineClickMode`,
     `loadTimelineClickMode`, `saveTimelineClickMode`, `initThumbnailPreview`,
     `setClipView`, `initClipTimeline`, `playheadAnimationId`, `clipTimelineInitialized`
9. `src/renderer/comments.js`
   - 移動: `resetCommentStateForVideoSwitch`, `updateCommentButtons`,
     `loadAndShowCommentDensity`, `drawCommentDensity`, `getDensityColor`,
     `detectAndShowHotspots`, `HotspotTooltip`, `jumpToHotspot`,
     コメント密度ボタンのイベントリスナー
10. `src/renderer/shortcuts.js`
    - 移動: `defaultShortcuts`, `formatKeyName`, `getShortcutString`,
      `loadShortcuts`, `saveShortcutsToStorage`, `resetShortcuts`,
      `renderShortcutList`, `editShortcut`, `finishEditingShortcut`,
      `handleModalKeyDown`, `highlightKey`, `handleGlobalKeyDown`,
      `executeShortcutAction`, `adjustTime`, `openShortcutModal`,
      `closeShortcutModal`, `framesToSeconds`, `adjustStartTime`, `adjustEndTime`

各ファイル抽出のたびに、

1. アプリ起動 (`npm start`)
2. 検索 → DL → 再生 → トリミング → 波形 → コメント密度 → 盛り上がり → エクスポート の golden path を一通り確認
3. キーボードショートカット動作確認

を実施する。

### フェーズ C: 仕上げ

11. `renderer.js` 冒頭にコメントで分割後の役割を明記する
12. `CLAUDE.md` を更新:
    - 「renderer.js は単一ファイル・約 4400 行」の記述を新構成に書き換え
    - 「`require` 禁止」「新 IPC は preload.js のホワイトリスト」等の制約は維持
13. 関連 PR を作成

---

## 受け入れ条件

- [ ] `renderer.js` が約 1500 行以下に縮小されている
- [ ] `src/renderer/` 以下に役割別の 8 ファイルが存在する
- [ ] `index.html` の `<script>` 読み込み順が依存関係を満たしている
- [ ] アプリ起動後、以下の操作が壊れていない:
  - [ ] YouTube 検索・ダウンロード（画質選択モーダル含む）
  - [ ] ダウンロード済み一覧からの動画再生切り替え
  - [ ] 波形表示（短時間動画 / 1 時間以上の動画両方）
  - [ ] クリップタイムラインのハンドルドラッグ・クリックモード切替
  - [ ] サムネイルプレビュー
  - [ ] 微調整ボタン・キーボードショートカット
  - [ ] コメント密度・盛り上がり検出・盛り上がりチップのツールチップ
  - [ ] ファイル名テンプレート編集・テンプレート反映
  - [ ] カテゴリ管理（追加 / 削除 / 選択）
  - [ ] メタデータ保存 (JSON)・MP4 エクスポート
  - [ ] `resetAllSettings` で全 localStorage キーがリセットされる
  - [ ] `ColumnResizer` による 3 列幅変更
- [ ] 動画切り替え時のコメント密度リセット（既存挙動）が維持されている
- [ ] DevTools Console にエラーが出ない

---

## リスクと対策

| リスク | 対策 |
|---|---|
| 関数を移動した先より前に呼ぶ箇所が残ってしまい `ReferenceError` | フェーズ A→B→C で段階的に抽出。各段階で動作確認。`function` 宣言は同一スクリプト内で hoisting されるため、別ファイル間では「先に load されるか」だけ意識する |
| inline `onclick` が解決できなくなる | 移動した関数も `function name() {}` で宣言を維持 → グローバルに自動登録 |
| グローバル変数を分割先で書き換えても元側に反映されない | 状態変数の **宣言は renderer.js に残す**。分割先からは代入のみ（同じグローバルスコープを共有） |
| `let` で宣言された変数を別ファイルから参照しようとして TDZ で失敗 | 宣言は最初に load される `renderer.js` で行う方針なので問題なし。ただし分割ファイル側が **トップレベルで** これらを参照しないこと（関数内部で参照する分には実行時参照なので OK）|
| イベントリスナーの重複登録 | 分割の途中で同じ `addEventListener` が両方のファイルに残らないよう diff を厳密に確認 |

---

## 影響するファイル

- `index.html` — `<script>` タグの追加（renderer.js より前に 8 ファイル）
- `renderer.js` — 抽出した関数・object の削除、orchestrator として再構成
- `src/renderer/utils.js` 〜 `src/renderer/layout.js`（新規 8 ファイル）
- `CLAUDE.md` — アーキテクチャ説明の更新

---

## 非ゴール（このタスクではやらない）

- ESM 化 / バンドラ導入（webpack, vite 等）
- TypeScript 化
- グローバル変数の廃止（class / module pattern への置き換え）
- onclick inline ハンドラの addEventListener への書き換え
- 機能追加・既存挙動の変更（純粋なリファクタリングに限定）
