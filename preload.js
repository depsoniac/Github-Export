const { contextBridge, ipcRenderer, webUtils } = require('electron');

function clipdockPathsFromFiles(files) {
  return Array.from(files || []).map(file => {
    try { return webUtils.getPathForFile(file) || file.path || ''; }
    catch (_) { return file.path || ''; }
  }).filter(Boolean);
}

contextBridge.exposeInMainWorld('desktop', {
  runtimeInfo: () => ipcRenderer.invoke('runtime-info'),
  openEngineLogs: () => ipcRenderer.invoke('open-engine-logs'),
  engineDiagnostics: () => ipcRenderer.invoke('engine-diagnostics'),
  restartBackend: () => ipcRenderer.invoke('restart-backend'),
  pickFiles: filters => ipcRenderer.invoke('pick-files', filters),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  showItem: path => ipcRenderer.invoke('show-item', path),
  openPath: path => ipcRenderer.invoke('open-path', path),
  openCookieExtension: target => ipcRenderer.invoke('open-cookie-extension', target),
  openExternal: url => ipcRenderer.invoke('open-external-url', url),
  openCookiesFolder: () => ipcRenderer.invoke('open-cookies-folder'),
  cookieFileStatus: path => ipcRenderer.invoke('cookie-file-status', path),
  importCookieFile: path => ipcRenderer.invoke('import-cookie-file', path),
  readClipboard: () => ipcRenderer.invoke('clipboard-read'),
  readClipboardImage: () => ipcRenderer.invoke('clipboard-image'),
  previewFile: path => ipcRenderer.invoke('file-preview', path),
  mediaPreviewUrl: path => ipcRenderer.invoke('media-preview-url', path),
  pathsFromFiles: files => clipdockPathsFromFiles(files),
  onFilesDropped: callback => {
    window.addEventListener('drop', event => {
      const paths = clipdockPathsFromFiles(event.dataTransfer?.files);
      if (paths.length) callback(paths);
    }, true);
  },
  onBackendError: callback => ipcRenderer.on('backend-error', (_event, message) => callback(message)),
  appVersion: () => ipcRenderer.invoke('app-version'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  downloadUpdate: updateInfo => ipcRenderer.invoke('download-update', updateInfo),
  openUpdatesFolder: () => ipcRenderer.invoke('open-updates-folder'),
  listPlugins: () => ipcRenderer.invoke('plugins-list'),
  installPlugin: id => ipcRenderer.invoke('plugins-install', id),
  installPluginUpdates: () => ipcRenderer.invoke('plugins-install-updates'),
  uninstallPlugin: id => ipcRenderer.invoke('plugins-uninstall', id),
  openPluginLocation: id => ipcRenderer.invoke('plugins-open-location', id),
  openPluginsRoot: () => ipcRenderer.invoke('plugins-open-root'),
  openPluginCatalogSource: () => ipcRenderer.invoke('plugins-open-catalog-source'),
  setPluginCatalogUrl: url => ipcRenderer.invoke('plugins-set-remote-catalog', url),
  clearPluginCatalogUrl: () => ipcRenderer.invoke('plugins-clear-remote-catalog'),
  onUpdateProgress: callback => ipcRenderer.on('update-progress', (_event, data) => callback(data)),
  notify: payload => ipcRenderer.invoke('notify', payload),
  getAppPrefs: () => ipcRenderer.invoke('get-app-prefs'),
  setAppPrefs: prefs => ipcRenderer.invoke('set-app-prefs', prefs),
  engineRuntimeStatus: () => ipcRenderer.invoke('engine-runtime-status'),
  engineRuntimeUpdate: () => ipcRenderer.invoke('engine-runtime-update'),
  onEngineRuntimeProgress: callback => ipcRenderer.on('engine-runtime-progress', (_event, data) => callback(data))
});
