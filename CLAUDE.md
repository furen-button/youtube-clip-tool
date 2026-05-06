# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 言語

ユーザーとのコミュニケーション、コミットメッセージ、コード内のドキュメント・コメントは**日本語**で記述する。

## 開発コマンド

```bash
npm install        # 依存関係をインストール
npm start          # Electron アプリを起動（electron .）
```

テストランナー・lint・ビルドステップは設定されていない。動作確認はアプリを起動して手動で行う。

### 外部依存

実行には以下が PATH 上で利用可能である必要がある:

- `yt-dlp` — 動画／メタデータ／ライブチャットの取得
- `ffmpeg` — `export-video` IPC でのトリミング書き出し（`-c copy` で再エンコードなし）

`.env` ファイルに `YOUTUBE_API_KEY` を設定する（`.env.example` 参照）。未設定の場合、検索は yt-dlp にフォールバックする（[src/youtube-downloader.js](src/youtube-downloader.js) の `searchVideos` 内 catch を参照）。

## アーキテクチャ

### 3 プロセス構成（Electron）

```
main.js (Node)  ←─── IPC ───→  preload.js  ──→  window.electronAPI  ←─→  renderer.js (browser)
       │                       (contextBridge)                              │
       │                                                                    │
       ↓                                                                    ↓
  yt-dlp / ffmpeg                                                    DOM / WaveSurfer
  YouTube API                                                        (CDN 経由)
  fs (downloads/, output/)
```

- **[main.js](main.js)**: すべての I/O（外部プロセス起動、ファイル読み書き、API 呼び出し）を担う。`ipcMain.handle(...)` でハンドラーを公開。
- **[preload.js](preload.js)**: `contextBridge.exposeInMainWorld('electronAPI', ...)` で、レンダラーから呼べる API を限定列挙する。**新しい IPC を追加する場合は preload.js にもエントリを追加する必要がある**（追加し忘れるとレンダラーから呼べない）。
- **[renderer.js](renderer.js)**: グローバル状態の宣言と、動画検索・ダウンロード・再生・カテゴリ管理・初期化・トリミング調整のオーケストレーター（約 750 行）。`require` は使用禁止（`contextIsolation: true`、`nodeIntegration: false`）。機能別ロジックは `src/renderer/` 以下に分割されている（下表参照）。
- **[src/youtube-downloader.js](src/youtube-downloader.js)**: yt-dlp を使う `YouTubeDownloader` クラス。`searchVideos` は YouTube Data API v3 を優先し、未設定・失敗時は yt-dlp にフォールバックする。main.js が単一インスタンスを保持。
- **[src/youtube-api.js](src/youtube-api.js)**: YouTube Data API v3 クライアント（`googleapis` ライブラリ + `dotenv`）。APIキーの取得と `youtube.search.list()` のラッパー。

### 出力ディレクトリの役割

| ディレクトリ | 用途 | 書き込みハンドラー |
|---|---|---|
| `downloads/` | yt-dlp が保存する元動画 + サイドカー JSON（`{videoId}.json`） + ライブチャット（`{videoId}.live_chat.json`） | `download-video`, `download-live-chat` |
| `output/json/` | クリップのメタデータ JSON | `save-metadata` |
| `output/movies/` | FFmpeg でトリミングした MP4 | `export-video` |

`save-metadata` と `export-video` はテンプレートに `/` を含むファイル名を **サブディレクトリ + ベース名** として解釈する（[main.js](main.js) の `resolveOutputSubpath`）。各セグメントは禁止文字を `_` に置換する。

### レンダラーのモジュール構成

`contextIsolation: true` / `nodeIntegration: false` のため ES Modules は使用不可。
通常の `<script>` タグを依存順に読み込み、すべての関数・オブジェクトはグローバルスコープで共有する。

| ファイル | 責務 |
|---|---|
| [src/renderer/utils.js](src/renderer/utils.js) | 純粋ユーティリティ（`escapeHtml`, `formatDuration`, `formatTimeShort`, `showToast` 等） |
| [src/renderer/dom-elements.js](src/renderer/dom-elements.js) | DOM 要素取得（`const videoPlayer = getElementById(...)` 等、全要素をここで宣言） |
| [src/renderer/storage.js](src/renderer/storage.js) | `InputHistory`・`TextPresets`（localStorage ベースの UI ヘルパー） |
| [src/renderer/file-name.js](src/renderer/file-name.js) | `FileNameTemplate`・`buildTemplateContext()`・`autoGenerateFileName()`・エクスポート・テンプレートモーダル |
| [src/renderer/waveform.js](src/renderer/waveform.js) | WaveSurfer 波形表示（`initWaveSurfer`・Region 同期・ズーム） |
| [src/renderer/clip-timeline.js](src/renderer/clip-timeline.js) | クリップタイムライン（ハンドルドラッグ・オーバービュー・サムネプレビュー・再生ヘッドアニメーション） |
| [src/renderer/comments.js](src/renderer/comments.js) | コメント密度・盛り上がり検出・`HotspotTooltip` |
| [src/renderer/shortcuts.js](src/renderer/shortcuts.js) | キーボードショートカット定義・編集モーダル・`handleGlobalKeyDown`・フレーム微調整 |
| [src/renderer/layout.js](src/renderer/layout.js) | `ColumnResizer`（編集タブ 3 列幅リサイザ） |
| [renderer.js](renderer.js) | グローバル状態変数・カテゴリ管理・ダウンロード・動画再生・初期化オーケストレーション |

**グローバル状態変数**（`renderer.js` で `let` 宣言）:
- `trimState` — `{ startTime, endTime, duration, isLooping }`。`updateTrimDisplay()` を経由して UI 全体を更新。
- `clipViewState` — メインタイムラインの表示範囲（波形のズームと同期）
- `metadata` — メタデータフォームの現在値
- `currentVideoFile` — 現在読み込み中の動画ファイル情報
- `fineTuneSettings` — 微調整フレーム数設定
- `availableCategories` — カテゴリ一覧

**モジュール側で宣言する状態変数**:
- `wavesurfer`, `waveformVisible` 等 → `waveform.js`
- `shortcuts`, `editingShortcutId` 等 → `shortcuts.js`
- `timelineClickMode`, `clipTimelineInitialized` 等 → `clip-timeline.js`
- `commentDensityData`, `detectedHotspots` 等 → `comments.js`

**スクリプト読み込み順**（index.html）:
```
CDN (WaveSurfer, simple-keyboard)
→ utils.js → dom-elements.js → storage.js → file-name.js
→ waveform.js → clip-timeline.js → comments.js → shortcuts.js → layout.js
→ renderer.js
```

### 状態の永続化（localStorage）

カスタマイズ可能な設定はすべて localStorage に保存される。キー一覧:

```
availableCategories          fineTuneSettings        keyboardShortcuts
timelineClickMode            fileNameTemplate        editColumnWidths
inputHistory_<key>           textPresets_<key>
```

`resetAllSettings()`（[renderer.js](renderer.js)）が全キーを削除する正の定義。**新しい永続化キーを追加した場合は、ここにも追加する必要がある**。

### CDN 統合の注意点

- **WaveSurfer.js v7** は **CDN（unpkg）から `<script>` で読み込み**、グローバル `WaveSurfer` を使用（[index.html](index.html) 参照）。npm パッケージはインストールされているが、未使用。
- `backend: 'MediaElement'` で `videoPlayer` 要素を直接読み込む。動画は `Blob URL` で渡している（`file://` プロトコル不可）。
- Regions / Minimap プラグインも CDN から読み込み。`wavesurferRegions.on('region-updated')` でドラッグ後 300ms のデバウンスを挟んでループ再生する設計。
- **simple-keyboard** も **CDN（jsDelivr）から読み込み**、グローバル `SimpleKeyboard` を使用。キーボードショートカットの編集UIに使用。

### IPC ハンドラーの命名規約

ipcMain ハンドラー名はケバブケース（`download-video`、`get-comment-density`）。preload.js では同じ名前を camelCase の関数名で公開する（`downloadVideo`、`getCommentDensity`）。進捗イベントは `mainWindow.webContents.send(...)` で発火し、preload で `onXxxProgress(callback)` として登録する。

## コーディング規約

- **`alert()` 禁止** → `showToast(message, type, duration)` を使用（type: success/error/warning/info）。
- **XSS 対策**: ユーザー入力を `innerHTML` で挿入する箇所では必ず `escapeHtml()` を通す。
- **新しい localStorage キーを追加するとき**は必ず `resetAllSettings()` のリセット対象にも追加する。
- **新しい IPC を追加するとき**は preload.js のホワイトリストにも追加する（忘れるとレンダラーから呼べない）。
- **コミットメッセージ**は Conventional Commits 風（`feat(scope): ...`、`fix(scope): ...`）を踏襲する。
- 単一責任の原則を守る。

## タスクドキュメント

[tasks/](tasks/) には未完了・進行中の機能仕様が個別マークダウンで置かれている。新機能を追加する際の設計ドキュメントとして利用される（README.md がインデックス）。
