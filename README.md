# YouTube Clip Tool

YouTubeから動画を検索・ダウンロードし、クリップとして切り出して保存できるElectronベースのデスクトップアプリケーションです。

## 機能

### ✅ 実装済み機能

- **YouTube動画検索**: キーワードで動画を検索（YouTube Data API v3 / yt-dlp フォールバック）
- **動画ダウンロード**: yt-dlpを使用した高品質なダウンロード
- **ダウンロード進捗表示**: リアルタイムでダウンロード状況を表示
- **動画管理・プレビュー**: ダウンロードしたファイルの一覧表示、再生、メタデータ表示
- **音声波形表示**: WaveSurfer.jsによる波形可視化（Regions / Minimap プラグイン付き）
- **動画トリミング**: 開始・終了時刻を指定してクリップ領域を決定
- **クリップタイムライン**: 二段構えのタイムライン（オーバービュー + ズーム波形）で正確な位置指定
- **FFmpeg エクスポート**: トリミング領域を MP4 として書き出し（再エンコードなしの `-c copy`）
- **メタデータ保存**: クリップの情報を JSON として保存（ファイル名テンプレートで柔軟な命名）
- **ファイル名テンプレート**: 12種のトークン（`{videoId}`, `{channelTitle}`, `{publishDate}`, `{startAt}`, `{serif}` 等）で出力ファイル名をカスタマイズ
- **ライブチャット取得**: yt-dlp でライブチャットを JSONL でダウンロード（密度可視化・盛り上がり検出のソース）
- **コメント密度可視化**: ライブチャット／コメントの密度をグラフ表示
- **ウェーブフォームピーク生成**: `generate-waveform-peaks` でオーディオピークデータを事前計算
- **キーボードショートカット**: カスタマイズ可能なショートカット登録・編集
- **入力履歴**: 検索語・ファイル名等の入力履歴を localStorage に保存（最大20件、`<datalist>` 補完）
- **テキストプリセット**: セリフ・メモのプリセットチップの登録・再利用
- **スクリーンショット保存**: 動画のフレームをキャプチャして保存

### 🔜 今後実装予定の機能

- サムネイルプレビュー（タスク02、tasks/参照）
- レイアウト統合・リファクタリング（タスク04、tasks/参照）

## 必要な環境

- Node.js (v22以上推奨)
- yt-dlp (YouTubeダウンロード用)
- ffmpeg (クリップエクスポート用)
- YouTube Data API v3のAPIキー (検索機能用、必須ではない)

## YouTube Data API v3の設定

YouTube APIを使用して動画を検索します。未設定の場合は yt-dlp にフォールバックします。

### 1. Google Cloud Consoleでプロジェクトを作成

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新しいプロジェクトを作成
3. 「APIとサービス」→「ライブラリ」から「YouTube Data API v3」を有効化
4. 「認証情報」から「APIキーを作成」

### 2. APIキーを設定

1. `.env.example`をコピーして`.env`ファイルを作成
```bash
cp .env.example .env
```

2. `.env`ファイルを開いて、取得したAPIキーを設定
```
YOUTUBE_API_KEY=YOUR_ACTUAL_API_KEY_HERE
```

### 注意事項

- YouTube Data API v3には1日あたりのクォータが制限されています（デフォルトで1日10,000ユニット）。

## インストール方法

1. リポジトリをクローン
```bash
git clone <repository-url>
cd youtube-clip-tool
```

2. 依存関係をインストール
```bash
npm install
```

3. アプリケーションを起動
```bash
npm start
```

## 使い方

### 1. YouTube動画を検索・ダウンロード

1. 検索バーにキーワードを入力（または `src/youtube-downloader.js` の yt-dlp フォールバックを使用）
2. 検索結果から動画を選択し、「ダウンロード」ボタンをクリック
3. ダウンロード進捗が表示されます（`downloads/` に保存）

### 2. URLから直接ダウンロード

1. YouTube URLを入力
2. 「ダウンロード」ボタンをクリック

### 3. クリップとして切り出

1. 動画を再生し、タイムラインで開始・終了時刻を指定
2. 波形上の Region プラグインでドラッグして正確に範囲を調節
3. 修飾キーで微調整: Shift クリックで ±15秒、Alt クリックで ±30秒移動
4. クリップパネルでメタデータ（タイトル、セリフ、メモ等）を記入
5. 「JSON保存」でメタデータを `output/json/` に、「MP4エクスポート」で MP4 を `output/movies/` に書き出

### 4. ファイル名テンプレートのカスタマイズ

出力ファイル名には以下のトークンを使用できます:

| トーク | 説明 |
|---|---|
| `{videoId}` | YouTube動画ID |
| `{videoTitle}` | 動画タイトル |
| `{channelTitle}` | チャンネル名 |
| `{publishDate}` | 公開日 |
| `{startAt}` | 開始時刻（秒） |
| `{startAtClock}` | 開始時刻（時:分:秒） |
| `{serif}` | セリフ |

`/` を含む名前はサブディレクトリとして解釈されます（例: `{channelTitle}/{videoTitle}-{startAtClock}`）。

## プロジェクト構造

```
youtube-clip-tool/
├── main.js              # Electronメインプロセス（IPCハンドラー、外部プロセス呼び出し）
├── preload.js           # プリロードスクリプト（contextBridge経由のIPC公開）
├── index.html           # メインUI
├── styles.css           # スタイルシート
├── renderer.js          # レンダラープロセスのUIロジック（単一ファイル）
├── src/
│   ├── youtube-downloader.js  # yt-dlp 経由の動画ダウンロード・検索
│   └── youtube-api.js        # YouTube Data API v3 クライアント
├── tasks/               # 機能開発タスクドキュメント
├── downloads/           # ダウンロードした動画の保存先（gitignore）
├── output/              # クリップ出力先（gitignore）
│   ├── json/            # クリップメタデータ
│   └── movies/          # エクスポートしたMP4
├── package.json         # プロジェクト設定
├── .env.example         # 環境変数テンプレート
├── .gitignore
├── CLAUDE.md            # AIエージェント向け開発指引
└── README.md
```

## 技術スタック

- **Electron** (v40.x): デスクトップアプリケーションフレームワーク
- **yt-dlp**: YouTube動画ダウンローダー
- **ffmpeg**: 動画トリミング・書き出し
- **WaveSurfer.js** (v7, CDN経由): 音声波形可視化
- **YouTube Data API v3** (googleapis ライブラリ): 動画検索
- **dotenv**: 環境変数読み込み
- **simple-keyboard** (CDN経由): キーボードショートカット設定UI

## アーキテクチャ

3プロセス構成です:

```
main.js (Node)  ←─── IPC ───→  preload.js  ──→  window.electronAPI  ←─→  renderer.js (browser)
       │                       (contextBridge)                              │
       ↓                                                                    ↓
  yt-dlp / ffmpeg                                                    DOM / WaveSurfer
  YouTube API                                                        (CDN 経由)
  fs (downloads/, output/)
```

- **main.js**: すべてのI/Oを担い、`ipcMain.handle()` で13のハンドラーを公開
- **preload.js**: `contextBridge` でレンダラーから安全にIPCを呼べるように限定公開
- **renderer.js**: 単一ファイル（約4400行）で全UIロジックを処理。`contextIsolation: true` のため `require` は使用不可

## トラブルシューティング

### 動画が再生できない

- ダウンロードが完了しているか確認
- ファイルが破損していないか確認
- ブラウザがサポートする動画形式か確認

### 検索結果が表示されない

- YouTube API キーが `.env` に正しく設定されているか確認
- API キーのクォータを超えていないか確認（[Cloud Console](https://console.cloud.google.com/apis/api/youtube.googleapis.com/quota) で確認可能）
- yt-dlp が PATH 上から実行可能か確認（API キー未設定時は yt-dlp にフォールバック）

### クリップエクスポートができない

- ffmpeg が PATH 上から実行可能か確認

## 開発

テストランナー、lint、ビルドステップは設定されていません。`npm start` でアプリを起動し、手動で動作確認してください。

詳細な開発指引は [CLAUDE.md](CLAUDE.md) を参照。

## ライセンス

ISC
