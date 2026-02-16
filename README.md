# YouTube Clip Tool

YouTubeから動画を検索・ダウンロードし、編集できるElectronベースのデスクトップアプリケーションです。

## 機能

### ✅ 実装済み機能

- **YouTube動画検索**: キーワードで動画を検索
- **動画ダウンロード**: yt-dlpを使用した高品質なダウンロード
- **ダウンロード進捗表示**: リアルタイムでダウンロード状況を表示
- **ダウンロード済み動画管理**: ダウンロードしたファイルの一覧表示と再生
- **動画プレビュー**: ダウンロードした動画の再生とメタデータ表示

### 🔜 今後実装予定の機能

- 動画のトリミング機能
- クロップ機能
- 音声波形表示
- メタデータ編集
- FFmpegによる動画出力

## 必要な環境

- Node.js (v22以上推奨)
- yt-dlp (YouTubeダウンロード用)
- YouTube Data API v3のAPIキー (検索機能用)

## YouTube Data API v3の設定

YouTube APIを使用して検索します。

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

- YouTube Data API v3には1日あたりのクォータが制限されています。

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

### 1. YouTube動画を検索

1. 「YouTube動画を検索」セクションの検索バーにキーワードを入力
2. 「検索」ボタンをクリック
3. 検索結果から動画を選択し、「ダウンロード」ボタンをクリック

### 2. URLから直接ダウンロード

1. 「動画をダウンロード」セクションにYouTube URLを入力
2. 「ダウンロード」ボタンをクリック
3. ダウンロード進捗が表示されます

### 3. ダウンロード済み動画を再生

1. 「ダウンロード済み動画」セクションで動画を確認
2. 「再生」ボタンをクリックして動画をプレビュー

## プロジェクト構造

```
youtube-clip-tool/
├── main.js              # Electronメインプロセス
├── preload.js           # プリロードスクリプト（IPC通信）
├── index.html           # メインUI
├── styles.css           # スタイルシート
├── renderer.js          # レンダラープロセスのロジック
├── src/
│   └── youtube-downloader.js  # YouTubeダウンロード機能
├── downloads/           # ダウンロードした動画の保存先
├── package.json         # プロジェクト設定
└── tasks.txt           # タスク管理
```

## 技術スタック

- **Electron**: デスクトップアプリケーションフレームワーク
- **yt-dlp**: YouTube動画ダウンローダー
- **Node.js**: バックエンドロジック
- **HTML/CSS/JavaScript**: フロントエンド

## トラブルシューティング

### 動画が再生できない

- ダウンロードが完了しているか確認
- ファイルが破損していないか確認
- ブラウザがサポートする動画形式か確認

## ライセンス

ISC

## 開発者

このプロジェクトは開発中です。バグ報告や機能リクエストは大歓迎です。
