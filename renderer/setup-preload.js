const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setupAPI', {
  getInfo: () => ipcRenderer.invoke('setup-info'),
  install: () => ipcRenderer.invoke('setup-install'),
  launch: () => ipcRenderer.invoke('setup-launch'),
  close: () => ipcRenderer.invoke('setup-close'),
  onProgress: (callback) => {
    ipcRenderer.on('setup-progress', (_event, payload) => callback(payload));
  }
});
