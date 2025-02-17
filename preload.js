// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getPlaylists: () => ipcRenderer.invoke('get-playlists'),
  startUpload: (options) => ipcRenderer.invoke('start-upload', options),
  onProgress: (callback) => ipcRenderer.on('upload-progress', callback),
  onUploadFinished: (callback) => ipcRenderer.on('upload-finished', callback),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getUserInfo: () => ipcRenderer.invoke('get-user-info'),
  logout: () => ipcRenderer.invoke('logout')
});
