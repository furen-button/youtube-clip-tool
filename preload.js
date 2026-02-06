const { contextBridge, ipcRenderer } = require('electron');

/**
 * レンダラープロセスからメインプロセスへの安全な通信を提供
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // YouTube動画を検索
  searchVideos: (query, maxResults = 10) => 
    ipcRenderer.invoke('search-videos', query, maxResults),
  
  // 動画情報を取得
  getVideoInfo: (url) => 
    ipcRenderer.invoke('get-video-info', url),
  
  // 動画をダウンロード
  downloadVideo: (url, options = {}) => 
    ipcRenderer.invoke('download-video', url, options),
  
  // ダウンロード済み動画一覧を取得
  listDownloadedVideos: () => 
    ipcRenderer.invoke('list-downloaded-videos'),
  
  // ファイル選択ダイアログを表示
  selectVideoFile: () => 
    ipcRenderer.invoke('select-video-file'),
  
  // ダウンロード進捗の監視
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, progress) => callback(progress));
  },
  
  // ダウンロード進捗リスナーの削除
  removeDownloadProgressListener: () => {
    ipcRenderer.removeAllListeners('download-progress');
  }
});
