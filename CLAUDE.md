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
- **[renderer.js](renderer.js)**: 単一ファイル・グローバル変数ベースの UI ロジック（モジュール分割なし、約 4400 行）。`require` は使用禁止（`contextIsolation: true`、`nodeIntegration: false`）。
- **[src/youtube-downloader.js](src/youtube-downloader.js)**: yt-dlp を使う `YouTubeDownloader` クラス。`searchVideos` は YouTube Data API v3 を優先し、未設定・失敗時は yt-dlp にフォールバックする。main.js が単一インスタンスを保持。
- **[src/youtube-api.js](src/youtube-api.js)**: YouTube Data API v3 クライアント（`googleapis` ライブラリ + `dotenv`）。APIキーの取得と `youtube.search.list()` のラッパー。

### 出力ディレクトリの役割

| ディレクトリ | 用途 | 書き込みハンドラー |
|---|---|---|
| `downloads/` | yt-dlp が保存する元動画 + サイドカー JSON（`{videoId}.json`） + ライブチャット（`{videoId}.live_chat.json`） | `download-video`, `download-live-chat` |
| `output/json/` | クリップのメタデータ JSON | `save-metadata` |
| `output/movies/` | FFmpeg でトリミングした MP4 | `export-video` |

`save-metadata` と `export-video` はテンプレートに `/` を含むファイル名を **サブディレクトリ + ベース名** として解釈する（[main.js](main.js) の `resolveOutputSubpath`）。各セグメントは禁止文字を `_` に置換する。

### レンダラー内の主要モジュール（renderer.js 内）

renderer.js はファイル分割されていないが、論理的に以下のオブジェクト／領域に分かれている:

- **`InputHistory`** — 入力履歴。`localStorage[inputHistory_<key>]` に最大 20 件保存し、`<datalist>` でサジェスト。同じ input への再 `bind()` は重複イベント防止のため `_bound` Map で管理。
- **`TextPresets`** — セリフ／メモのプリセットチップ。`localStorage[textPresets_<key>]`。
- **`FileNameTemplate`** — 出力ファイル名テンプレート。12 種のトークン（`{videoId}`, `{channelTitle}`, `{publishDate}`, `{startAt}`, `{startAtClock}`, `{serif}` 等）を `TOKENS` 配列で一元定義。`resolve()` がトークン置換 + パス正規化を行う。
- **`buildTemplateContext()`** — `currentVideoFile.metadata`（yt-dlp 由来の `uploadDate` 等）と `trimState`、`metadata` を合成してテンプレート用 ctx を生成。
- **クリップタイムライン** — `clipViewState` がメインタイムラインの表示範囲（波形のズームと同期）を保持。オーバービュー（動画全体）と二段構成。`handleTimelineClick()` で修飾キー（Shift=±15s, Alt=±30s）と `timelineClickMode` の優先順位を解決。
- **`shortcuts` / `defaultShortcuts`** — キーボードショートカット定義。編集中は `editingShortcutId` で状態管理。
- **`trimState`** — `{ startTime, endTime, duration, isLooping }`。`updateTrimDisplay()` を経由して UI 全体（タイムライン UI、波形 region、ファイル名、URL、クリップパネル）を更新する。

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
