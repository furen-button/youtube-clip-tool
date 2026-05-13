# タスク 06: セリフ・ルビ欄への音声認識入力

## 概要

クリップ編集タブの「セリフ (Serif)」「セリフルビ (Ruby)」フィールドを手入力以外でも埋められるよう、
**現在のトリミング範囲（`trimState.startTime` 〜 `endTime`）の音声を whisper.cpp でローカル文字起こし**し、
セリフ欄に挿入する機能を追加する。同時に既存の「ルビ生成」ロジック（`katakanaToHiragana`）を再利用してルビ欄も自動入力する。

---

## 利用者の決定事項

- **エンジン**: whisper.cpp（ローカル CLI）。yt-dlp / ffmpeg と同じく PATH 上に置く運用方針に揃える。
- **入力先**: セリフ欄に文字起こし結果を入れ、**続けてルビ欄もカタカナ→ひらがな変換で自動生成**。
- **UI**: セリフ欄の `input-with-button` ラッパー内（💾 と ルビ生成 の並び）に **🎤 マイクボタン** を追加。

---

## 制約

- レンダラーは `contextIsolation: true` / `nodeIntegration: false`。`require()` 不可。
  外部プロセス起動はすべて main プロセス側で行い、IPC で結果のみレンダラーへ渡す。
- 既存パターン踏襲: `spawn(...)` 配列引数、ハンドラー名はケバブケース、preload は camelCase で公開、
  ユーザーフィードバックは `showToast()`、入力履歴 / プリセット周りは触らない（自動入力で値だけ書き換える）。
- whisper.cpp バイナリ（`whisper-cli` または旧名 `main`）と GGML モデルファイル（例: `ggml-large-v3.bin`）は
  ユーザーが各自インストール／DL する前提。ツール側ではバンドルしない。

---

## 設計方針

### 1. 環境変数（`.env`）

`dotenv` は既に YouTube API キー用に導入済みなので、同じ仕組みで以下を追加で読む:

| 変数名 | 役割 | 既定値 |
|---|---|---|
| `WHISPER_CLI` | CLI 実行コマンド名 | `whisper-cli` |
| `WHISPER_MODEL_PATH` | GGML モデルの絶対パス | **必須**（未設定時はエラー toast） |
| `WHISPER_LANGUAGE` | 認識言語 | `ja` |

`.env.example` にコメント付きで追記する。

### 2. main プロセス: 新規 IPC `transcribe-clip`

入力: `(videoPath: string, startTime: number, endTime: number)`
戻り値: `string`（文字起こし結果。前後空白 trim 済み）

処理シーケンス:

1. `WHISPER_MODEL_PATH` 未設定なら `throw new Error('WHISPER_MODEL_PATH が設定されていません')`。
2. 一時 WAV パスを生成: `path.join(os.tmpdir(), 'yct-stt-' + Date.now() + '-' + process.pid + '.wav')`。
3. **ffmpeg で範囲抽出** — 既存 `generate-waveform-peaks` の spawn パターン（[main.js:406-413](../main.js#L406-L413)）を流用:
   ```js
   spawn('ffmpeg', [
     '-y',
     '-ss', String(startTime),
     '-to', String(endTime),
     '-i', videoPath,
     '-vn', '-ac', '1', '-ar', '16000',
     '-f', 'wav', wavPath
   ])
   ```
   `close` イベントで exit code が非ゼロなら reject。
4. **whisper-cli を spawn**:
   ```js
   spawn(WHISPER_CLI, [
     '-m', WHISPER_MODEL_PATH,
     '-l', WHISPER_LANGUAGE,
     '-otxt',
     '-of', wavPath.replace(/\.wav$/, ''),
     '--no-prints',
     wavPath
   ])
   ```
   `whisper-cli` は `<出力プレフィックス>.txt` を生成するため、`close` 後に `fs.promises.readFile(prefix + '.txt', 'utf8')` で読み取り、`trim()` して返す。
5. `finally` で WAV と TXT を `fs.promises.unlink(...).catch(() => {})` で掃除。
6. エラーは日本語メッセージで `throw` し、レンダラー側で toast 表示する。

### 3. preload

`electronAPI` に追加:

```js
transcribeClip: (videoPath, startTime, endTime) =>
  ipcRenderer.invoke('transcribe-clip', videoPath, startTime, endTime),
```

### 4. UI（HTML）

[index.html:350-355](../index.html#L350-L355) のセリフ form-group 内、`input-with-button` の中に
💾 と ルビ生成 の間に 🎤 ボタンを差し込む:

```html
<button id="transcribeSerifBtn" class="btn btn-secondary btn-sm"
        title="クリップ範囲の音声を認識してセリフ＋ルビに入力">🎤</button>
```

### 5. レンダラーモジュール側

- **[src/renderer/dom-elements.js](../src/renderer/dom-elements.js)**:
  既存の `serifSavePresetBtn` / `generateRubyBtn` と同じパターンで `transcribeSerifBtn` を `getElementById` で取得。

- **[src/renderer/file-name.js](../src/renderer/file-name.js)**:
  既存の `generateRubyBtn.addEventListener('click', ...)` ハンドラー（[src/renderer/file-name.js:217-230](../src/renderer/file-name.js#L217-L230)）の直後に、`transcribeSerifBtn` のクリックハンドラーを追加。
  ```js
  transcribeSerifBtn.addEventListener('click', async () => {
    if (!currentVideoFile || !currentVideoFile.path) {
      showToast('動画を読み込んでください', 'warning');
      return;
    }
    if (trimState.endTime <= trimState.startTime) {
      showToast('トリミング範囲を設定してください', 'warning');
      return;
    }

    const prevDisabled = transcribeSerifBtn.disabled;
    transcribeSerifBtn.disabled = true;
    transcribeSerifBtn.textContent = '⏳';
    try {
      const text = await window.electronAPI.transcribeClip(
        currentVideoFile.path,
        trimState.startTime,
        trimState.endTime
      );
      const cleaned = (text || '').trim();
      if (!cleaned) {
        showToast('音声認識結果が空でした', 'warning');
        return;
      }
      serifInput.value = cleaned;
      metadata.serif = cleaned;
      const ruby = katakanaToHiragana(cleaned);   // 既存ユーティリティを再利用
      rubyInput.value = ruby;
      metadata.ruby = ruby;
      showToast('セリフとルビを生成しました', 'success');
    } catch (err) {
      console.error(err);
      showToast('音声認識に失敗: ' + (err.message || err), 'error');
    } finally {
      transcribeSerifBtn.disabled = prevDisabled;
      transcribeSerifBtn.textContent = '🎤';
    }
  });
  ```

`katakanaToHiragana` / `serifInput` / `rubyInput` / `metadata` / `trimState` / `currentVideoFile` は
既にグローバルで参照可能（[src/renderer/file-name.js:225-227](../src/renderer/file-name.js#L225-L227) と同じ）。

---

## 既存ユーティリティの再利用ポイント

| 既存 | 使い道 |
|---|---|
| `katakanaToHiragana()` ([src/renderer/file-name.js](../src/renderer/file-name.js)) | ルビ自動生成 |
| `showToast()` ([src/renderer/utils.js](../src/renderer/utils.js)) | 全フィードバック |
| `spawn('ffmpeg', ...)` パターン ([main.js:406-413](../main.js#L406-L413)) | 音声抽出 |
| `trimState` / `currentVideoFile` グローバル | クリップ範囲・動画ファイルパス |

新規ライブラリは追加しない（`dotenv` / `child_process` / `os` / `fs` / `path` のみ）。

---

## 実装ステップ

1. `.env.example` に `WHISPER_CLI` / `WHISPER_MODEL_PATH` / `WHISPER_LANGUAGE` の 3 行を追記。
2. `main.js` 先頭で `const os = require('os')` を追加（既存なら不要）。
3. `main.js` に `ipcMain.handle('transcribe-clip', ...)` を実装（既存 `export-video` ハンドラーの近く）。
4. `preload.js` の `electronAPI` に `transcribeClip` を追加。
5. `index.html` のセリフ form-group に 🎤 ボタンを追加。
6. `src/renderer/dom-elements.js` に `transcribeSerifBtn` を追加。
7. `src/renderer/file-name.js` にクリックハンドラーを追加。
8. `CLAUDE.md` の「外部依存」セクションに `whisper-cli` / モデルファイルを追記（任意機能と明記）。
9. 動作確認（下記）を実施。

---

## 動作確認手順

事前準備:

1. `brew install whisper-cpp` などで `whisper-cli` を PATH 上に配置。
2. GGML モデルを DL:
   ```
   curl -L -o ~/whisper-models/ggml-large-v3.bin \
     https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
   ```
3. `.env` に `WHISPER_MODEL_PATH=/Users/.../ggml-large-v3.bin` を設定。

確認:

- [ ] `npm start` でアプリ起動。
- [ ] YouTube 動画をダウンロード → 再生 → 明確な発話を含む 3〜10 秒の範囲をトリミング。
- [ ] セリフ欄横の 🎤 をクリック。ボタンが ⏳ 表示になり、無効化される。
- [ ] 完了後、セリフ欄に文字起こし結果、ルビ欄にひらがな変換結果が入る。
- [ ] toast「セリフとルビを生成しました」が表示される。
- [ ] `os.tmpdir()` に `yct-stt-*.wav` / `.txt` が残らない（成功・失敗どちらでも）。
- [ ] エラー系:
  - [ ] 動画未ロード時に 🎤 を押すと警告 toast。
  - [ ] `trimState.endTime <= startTime` の状態で 🎤 を押すと警告 toast。
  - [ ] `.env` に `WHISPER_MODEL_PATH` 未設定で 🎤 を押すとエラー toast に理由が出る。
  - [ ] エラー後もボタンが 🎤 表示・有効状態に戻る。

---

## 受け入れ条件

- [ ] 🎤 ボタンがセリフ欄の隣（💾 と ルビ生成 の並び）に表示される。
- [ ] 押下でクリップ範囲の音声がローカル whisper.cpp により文字起こしされ、セリフ欄に入る。
- [ ] セリフ欄入力後、ルビ欄にも自動でひらがな変換結果が入る。
- [ ] 処理中は ⏳ 表示で再押下が抑止される。
- [ ] 一時ファイル（WAV / TXT）が確実に削除される。
- [ ] 既存の「💾 プリセット保存」「ルビ生成」「セリフ手入力」「履歴 datalist」の挙動が壊れない。
- [ ] preload.js のホワイトリストに `transcribeClip` が追加されている（CLAUDE.md の規約遵守）。

---

## リスクと対策

| リスク | 対策 |
|---|---|
| whisper.cpp の初回モデルロードで UI が固まって見える | ボタンを ⏳ 化 + 無効化して進行中とわかるようにする。本格的な進捗は将来 `transcribe-progress` IPC で対応可能（非ゴール）。 |
| `whisper-cli` / `main` などバイナリ名が環境で異なる | `WHISPER_CLI` 環境変数で切り替え可能にする |
| モデル未設定で混乱 | 起動時ではなく実行時に明示的なエラー toast を出す（任意機能のため） |
| 一時ファイル残留 | `finally` で必ず `unlink`。失敗しても catch でログのみ |
| Apple Silicon / x86 / Linux で whisper.cpp ビルドが異なる | ツール側では `spawn` するだけなのでビルド差は吸収不要 |

---

## 影響するファイル

- `.env.example` — whisper 設定 3 変数を追記
- `main.js` — `transcribe-clip` IPC ハンドラーを新規追加、`os` モジュール import
- `preload.js` — `transcribeClip` を `electronAPI` に追加
- `index.html` — セリフ form-group に 🎤 ボタンを追加
- `src/renderer/dom-elements.js` — `transcribeSerifBtn` 要素取得を追加
- `src/renderer/file-name.js` — 🎤 ボタンのクリックハンドラーを追加
- `CLAUDE.md` — 外部依存セクションに whisper.cpp を任意機能として記載

---

## 非ゴール（このタスクではやらない）

- 認識中のリアルタイム進捗表示（`transcribe-progress` IPC）
- クラウド API（OpenAI Whisper API / Google Cloud STT）対応
- セリフ欄以外への音声認識結果挿入（メモ欄など）
- whisper.cpp バイナリ／モデルファイルの自動 DL・バンドル
- 認識結果の編集 UI（複数候補の提示など）
- ルビ欄単独での音声認識ボタン
