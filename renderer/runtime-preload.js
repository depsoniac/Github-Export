const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('runtimeAPI', {
  getInfo: () => ipcRenderer.invoke('engine-dl-info'),
  download: () => ipcRenderer.invoke('engine-dl-start'),
  continueBoot: () => ipcRenderer.invoke('engine-dl-continue'),
  close: () => ipcRenderer.invoke('engine-dl-close'),
  onProgress: (callback) => {
    ipcRenderer.on('engine-dl-progress', (_event, payload) => callback(payload));
  }
});
