# GitHub Copilot への指示

## 全般
- 日本語で応答してください
- 適切に日本語でドキュメントやコメントを追加してください
- 単一責任の原則に従ってください

## プロジェクト概要
YouTube動画を検索・ダウンロードし、トリミング・編集してメタデータと共に保存するElectronアプリケーション

## 技術スタック
- **Electron** v40.2.1 - デスクトップアプリケーションフレームワーク
- **YouTube Data API v3** - 動画検索機能
- **yt-dlp** - 動画ダウンロード（APIのフォールバック）
- **WaveSurfer.js v7** - 音声波形可視化
- **FFmpeg** - 動画処理（将来実装予定）

## アーキテクチャ

### メインプロセス (main.js)
- IPCハンドラーによる安全な通信
- ファイルシステム操作
- YouTube API連携

### レンダラープロセス (renderer.js)
- UI操作とイベント処理
- 動画再生・トリミング制御
- WaveSurfer.js 統合
- メタデータ管理

### プリロード (preload.js)
- contextBridge による安全なAPI公開
- メインプロセスとレンダラー間の橋渡し

## 実装済み機能

### 1. 動画管理
- YouTube動画検索（API + yt-dlp フォールバック）
- 動画ダウンロード（進捗表示付き）
- ダウンロード済み動画一覧
- Blob/IPC経由の安全な動画読み込み

### 2. 動画再生・編集
- `<video>` タグによる再生
- トリミング範囲設定（デュアルスライダー）
- トリミング範囲のループ再生
- 現在位置からのトリミング設定
- 時間表示（ミリ秒精度）

### 3. 音声波形表示
- WaveSurfer.js による波形可視化
- トリミング範囲の視覚的表示（Regions プラグイン）
- 波形クリックで再生位置変更
- 自動ズーム（トリミング範囲に応じて調整）
- 正規化オプション

### 4. メタデータ編集
- YouTube Video ID
- ファイル名（自動生成: `{videoId}_{開始秒6桁0詰め}-{終了秒6桁0詰め}`）
- セリフ・ルビ
- カテゴリ（複数選択可能）
- クリップURL（自動生成）
- メモ
- JSON出力（`output/json/` ディレクトリ）

### 5. UI/UX
- トースト通知システム（success/error/warning/info）
- レスポンシブデザイン
- グラデーション UI

## コーディング規約

### JavaScript
- ES6+ の構文を使用
- `const` / `let` を適切に使い分け
- async/await によるエラーハンドリング
- XSS対策（`escapeHtml` 関数の使用）

### CSS
- BEM ライクな命名規則
- Flexbox/Grid レイアウト
- CSS変数の活用
- アニメーション（`@keyframes`）

### セキュリティ
- `contextIsolation: true` を維持
- `nodeIntegration: false` を維持
- IPCハンドラーでの入力検証
- XSS対策の徹底

## 開発ガイドライン

### エラーハンドリング
- `alert()` は使用禁止 → `showToast()` を使用
- `try-catch` でエラーをキャッチ
- ユーザーフレンドリーなエラーメッセージ

### ファイル構成
```
youtube-clip-tool/
├── main.js              # Electronメインプロセス
├── preload.js           # コンテキストブリッジ
├── renderer.js          # UIロジック
├── index.html           # UI構造
├── styles.css           # スタイリング
├── src/
│   ├── youtube-downloader.js  # YouTube API/yt-dlp
│   └── youtube-api.js         # API設定
├── downloads/           # ダウンロード済み動画
├── output/
│   └── json/           # メタデータJSON
└── .env                # API キー（.gitignore対象）
```

### 今後の実装予定
- [ ] トリミング範囲の微調整ボタン（±0.05秒、±0.5秒）
- [ ] クロップ機能
- [ ] FFmpeg による動画エクスポート
- [ ] ルビ自動生成（ひらがな変換API連携）
- [ ] キーボードショートカット

## 注意事項
- WaveSurfer.js は CDN 経由で読み込み（ESM対応のため `.min.js` を使用）
- 動画ファイルは `file://` プロトコルではなく Blob URL で読み込み
- トリミング時間は秒単位で管理し、表示時にミリ秒でフォーマット
- メタデータのファイル名は安全な文字のみ使用（特殊文字を `_` に置換）
