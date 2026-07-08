const { app, BrowserWindow, clipboard, dialog, ipcMain, shell, nativeImage, Tray, Menu, Notification } = require('electron');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const net = require('net');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

// Nombre estable para Windows: evita que la vista previa/barra de tareas caiga al nombre genérico "Electron".
app.setName('ClipDock');
if (process.platform === 'win32') app.setAppUserModelId('ClipDock.App');

// En algunas PCs/GPUs Electron puede abrir una ventana negra aunque el renderer exista.
// Desactivamos la aceleración de hardware para priorizar arranque estable.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

let mainWindow;
let backend;
let backendPort;
let bridgePort = 7788;
let tray = null;
// isQuitting: cuando es true, cerrar la ventana SÍ cierra la app (salir de verdad).
// Si es false y el usuario tiene activado "minimizar a la bandeja", la X solo oculta.
let isQuitting = false;
// La app se lanzó al iniciar Windows (con --hidden): arrancar en la bandeja sin mostrar ventana.
const LAUNCHED_HIDDEN = process.argv.includes('--hidden') || process.argv.includes('--minimized');

// ---- Modo instalador estilo G Hub ----
// El setup distribuible es la propia app compilada como "portable": al correr desde
// el exe portable, Electron define PORTABLE_EXECUTABLE_FILE y mostramos la ventana
// de instalación (rombo + progreso) en lugar de la app normal.
const SETUP_MODE = process.platform === 'win32' && Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
const UNINSTALL_MODE = process.platform === 'win32' && process.argv.includes('--uninstall');

// En modo setup/desinstalación no se toma el lock: debe poder correr aunque
// exista otra instancia (p. ej. instalar una actualización).
const hasSingleInstanceLock = (SETUP_MODE || UNINSTALL_MODE) ? true : app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else if (!SETUP_MODE && !UNINSTALL_MODE) {
  app.on('second-instance', () => {
    // Al intentar abrir una segunda instancia, traemos al frente la ventana
    // (o la sacamos de la bandeja si estaba oculta).
    showMainWindow();
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function freePortInRange(start = 7788, end = 7808) {
  for (let port = start; port <= end; port += 1) {
    try {
      await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => server.close(resolve));
      });
      return port;
    } catch (_) { /* probar el siguiente */ }
  }
  throw new Error(`No hay un puerto libre para el puente entre ${start} y ${end}.`);
}

function waitForPort(port, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const attempt = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      let settled = false;
      const retry = () => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`El motor no respondió en el puerto ${port} después de ${timeoutMs / 1000}s.`));
        } else {
          setTimeout(attempt, 120);
        }
      };
      socket.once('connect', () => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve();
      });
      socket.once('error', retry);
      socket.setTimeout(600, retry);
    };
    attempt();
  });
}

function appStorageDir() {
  return path.join(app.getPath('documents'), 'ClipDock');
}

// ---- Preferencias de ventana / sistema (bandeja + autoarranque) ----
const DEFAULT_APP_PREFS = { minimizeToTray: true, autoLaunch: true, startMinimized: true };

function appPrefsPath() {
  return path.join(appStorageDir(), 'preferencias.json');
}

function readAppPrefs() {
  try {
    const raw = JSON.parse(fs.readFileSync(appPrefsPath(), 'utf8')) || {};
    return { ...DEFAULT_APP_PREFS, ...raw };
  } catch (_) {
    return { ...DEFAULT_APP_PREFS };
  }
}

function writeAppPrefs(prefs) {
  try {
    fs.mkdirSync(appStorageDir(), { recursive: true });
    fs.writeFileSync(appPrefsPath(), JSON.stringify(prefs, null, 2), 'utf8');
  } catch (error) {
    console.error('[prefs] no se pudo guardar', error);
  }
}

// Aplica el arranque con Windows según la preferencia. Si además quiere iniciar
// minimizado, se lanza con --hidden para que la app arranque directo en la bandeja.
function applyAutoLaunch(prefs) {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    try {
      app.setLoginItemSettings({
        openAtLogin: Boolean(prefs.autoLaunch),
        openAsHidden: Boolean(prefs.autoLaunch && prefs.startMinimized),
        args: prefs.autoLaunch && prefs.startMinimized ? ['--hidden'] : []
      });
    } catch (error) {
      console.error('[autolaunch] no se pudo aplicar', error);
    }
  }
}

function trayIconImage() {
  try {
    const icoPath = path.join(appPackageDir(), 'assets', process.platform === 'win32' ? 'clipdock.ico' : 'clipdock.png');
    const img = nativeImage.createFromPath(icoPath);
    if (!img.isEmpty()) return process.platform === 'darwin' ? img.resize({ width: 18, height: 18 }) : img;
  } catch (_) {}
  return undefined;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) { createWindow(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  mainWindow.focus();
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Abrir ClipDock', click: () => showMainWindow() },
    { type: 'separator' },
    { label: 'Cerrar ClipDock', click: () => quitApp() }
  ]);
}

function ensureTray() {
  if (tray && !tray.isDestroyed?.()) return tray;
  const image = trayIconImage();
  try {
    tray = image ? new Tray(image) : new Tray(nativeImage.createEmpty());
  } catch (error) {
    console.error('[tray] no se pudo crear', error);
    tray = null;
    return null;
  }
  tray.setToolTip('ClipDock');
  tray.setContextMenu(buildTrayMenu());
  // Clic (o doble clic) sobre el icono abre la app.
  tray.on('click', () => showMainWindow());
  tray.on('double-click', () => showMainWindow());
  return tray;
}

function updateStorageDir() {
  return path.join(appStorageDir(), 'Actualizaciones');
}

function cookiesStorageDir() {
  return path.join(appStorageDir(), 'Cookies');
}

function logsStorageDir() {
  return path.join(appStorageDir(), 'Logs');
}

let currentEngineLogPath = '';
let backendReady = false;
let lastBackendError = null;
let lastBackendLaunch = null;
let suppressBackendExitNotice = false;

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function ensureLogsDir() {
  const dir = logsStorageDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function setCurrentEngineLogPath() {
  const dir = ensureLogsDir();
  currentEngineLogPath = path.join(dir, `motor-${timestampForFile()}.log`);
  return currentEngineLogPath;
}

function appendEngineLog(message) {
  try {
    if (!currentEngineLogPath) setCurrentEngineLogPath();
    fs.appendFileSync(currentEngineLogPath, `[${new Date().toISOString()}] ${String(message).replace(/\r?\n$/, '')}\n`, 'utf8');
  } catch (error) {
    console.warn('[logs] no pude escribir log del motor:', error.message);
  }
}

function summarizePathStatus(label, targetPath, type = 'file') {
  const exists = Boolean(targetPath && fs.existsSync(targetPath));
  let ok = exists;
  if (exists) {
    try {
      const stat = fs.statSync(targetPath);
      ok = type === 'dir' ? stat.isDirectory() : stat.isFile();
    } catch (_) { ok = false; }
  }
  return { label, path: targetPath || '', ok, exists, type };
}

function runPythonModuleCheck(launch) {
  if (!launch || launch.runtimeKind !== 'python-portable') return { ok: true, skipped: true, modules: [] };
  const modules = [
    ['flask', 'Flask'],
    ['flask_socketio', 'Flask-SocketIO'],
    ['requests', 'Requests'],
    ['yt_dlp', 'yt-dlp'],
    ['PIL', 'Pillow'],
    ['pillow_avif', 'Pillow AVIF'],
  ];
  const script = `import importlib, json, sys\nmods=${JSON.stringify(modules)}\nitems=[]\nfor module,label in mods:\n    try:\n        importlib.import_module(module)\n        items.append({'module': module, 'label': label, 'ok': True})\n    except Exception as exc:\n        items.append({'module': module, 'label': label, 'ok': False, 'error': str(exc)})\nprint(json.dumps({'ok': all(item['ok'] for item in items), 'python': sys.version, 'executable': sys.executable, 'modules': items}, ensure_ascii=False))`;
  try {
    const raw = execFileSync(launch.command, ['-c', script], {
      cwd: launch.cwd,
      timeout: 12000,
      windowsHide: true,
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        CLIPDOCK_APP_ROOT: launch.appRoot,
        CLIPDOCK_ENGINE_ROOT: launch.engineRoot || path.join(launch.appRoot, 'engine'),
        CLIPDOCK_STORAGE_DIR: launch.storageDir,
        MEDIA_ENGINE_COMPONENTS_DIR: path.join(launch.storageDir, 'Componentes'),
        MEDIA_ENGINE_MODELS_DIR: path.join(launch.storageDir, 'Modelos'),
        MEDIA_ENGINE_CACHE_DIR: path.join(launch.storageDir, 'Cache')
      }
    });
    return JSON.parse(String(raw || '{}'));
  } catch (error) {
    return { ok: false, error: error.message, stdout: error.stdout?.toString?.() || '', stderr: error.stderr?.toString?.() || '', modules: [] };
  }
}

function verifyBackendLaunch(launch) {
  try { fs.mkdirSync(launch.storageDir, { recursive: true }); } catch (_) { /* se reporta abajo */ }
  const checks = [
    summarizePathStatus('Ejecutable del motor', launch.command),
    summarizePathStatus('Carpeta de arranque', launch.cwd, 'dir'),
    summarizePathStatus('Raíz del motor', launch.engineRoot, 'dir'),
    summarizePathStatus('Carpeta de datos', launch.storageDir, 'dir'),
  ];
  if (launch.runtimeKind === 'python-portable') {
    checks.push(summarizePathStatus('Backend Python', launch.args?.[0] || '', 'file'));
  }
  const moduleCheck = runPythonModuleCheck(launch);
  const failedChecks = checks.filter(check => !check.ok);
  const missingModules = (moduleCheck.modules || []).filter(item => !item.ok);
  return {
    ok: failedChecks.length === 0 && moduleCheck.ok !== false,
    runtimeKind: launch.runtimeKind,
    checks,
    failedChecks,
    moduleCheck,
    missingModules,
  };
}

function backendErrorPayload(error, extra = {}) {
  const detail = {
    message: error?.message || String(error || 'Error desconocido del motor'),
    logPath: currentEngineLogPath || '',
    logsDir: logsStorageDir(),
    runtimeKind: lastBackendLaunch?.runtimeKind || '',
    launch: lastBackendLaunch ? {
      command: lastBackendLaunch.command,
      args: lastBackendLaunch.args,
      cwd: lastBackendLaunch.cwd,
      appRoot: lastBackendLaunch.appRoot,
      engineRoot: lastBackendLaunch.engineRoot,
      storageDir: lastBackendLaunch.storageDir,
      runtimeKind: lastBackendLaunch.runtimeKind,
    } : null,
    ...extra,
  };
  lastBackendError = detail;
  return detail;
}

function formatDiagnostics(diagnostics) {
  if (!diagnostics) return '';
  const lines = [];
  lines.push(`Runtime: ${diagnostics.runtimeKind || 'desconocido'}`);
  for (const check of diagnostics.checks || []) lines.push(`${check.ok ? 'OK' : 'FALTA'} · ${check.label}: ${check.path}`);
  if (diagnostics.moduleCheck?.python) lines.push(`Python: ${diagnostics.moduleCheck.python}`);
  for (const item of diagnostics.moduleCheck?.modules || []) lines.push(`${item.ok ? 'OK' : 'FALTA'} · paquete ${item.label}${item.error ? ` (${item.error})` : ''}`);
  if (diagnostics.moduleCheck?.error) lines.push(`Error verificando paquetes: ${diagnostics.moduleCheck.error}`);
  return lines.join('\n');
}

function sendBackendErrorToRenderer(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('backend-error', payload);
}


function pluginsStorageDir() {
  return path.join(appStorageDir(), 'Complementos');
}

function pluginDownloadsDir() {
  return path.join(pluginsStorageDir(), '_downloads');
}

function pluginExtractingDir() {
  return path.join(pluginsStorageDir(), '_extracting');
}

function pluginCatalogOverridePath() {
  return path.join(pluginsStorageDir(), 'catalog.json');
}

function pluginRemoteCatalogConfigPath() {
  return path.join(pluginsStorageDir(), 'catalog-remote.json');
}

function pluginRemoteCatalogCachePath() {
  return path.join(pluginsStorageDir(), 'catalog-remote-cache.json');
}

function pluginRegistryPath() {
  return path.join(appStorageDir(), 'plugins-installed.json');
}

function readPluginRegistry() {
  try {
    const filePath = pluginRegistryPath();
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function writePluginRegistry(registry) {
  fs.mkdirSync(path.dirname(pluginRegistryPath()), { recursive: true });
  fs.writeFileSync(pluginRegistryPath(), JSON.stringify(registry || {}, null, 2), 'utf8');
}

function readPluginRemoteCatalogConfig() {
  try {
    const filePath = pluginRemoteCatalogConfigPath();
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function writePluginRemoteCatalogConfig(config) {
  fs.mkdirSync(pluginsStorageDir(), { recursive: true });
  fs.writeFileSync(pluginRemoteCatalogConfigPath(), JSON.stringify(config || {}, null, 2), 'utf8');
}


// Los complementos viven en github.com/depsoniac/ClipDock-Marketplace (GitHub Pages).
// La app siempre lee el catálogo remoto; no se empaqueta ningún marketplace local.
const DEFAULT_REMOTE_CATALOG_URL = 'https://depsoniac.github.io/ClipDock-Marketplace/catalog.json';

function pluginDefaultRemoteCatalogUrl() {
  return DEFAULT_REMOTE_CATALOG_URL;
}

function resolvePluginRemoteCatalogUrl(config = readPluginRemoteCatalogConfig()) {
  const explicit = String(config.url || '').trim();
  if (explicit) return explicit;
  if (config.disableDefault || config.disabledDefault) return '';
  return pluginDefaultRemoteCatalogUrl();
}

function normalizePluginRemoteCatalogUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  let parsed;
  try { parsed = new URL(value); } catch (_) { throw new Error('La URL del catálogo remoto no es válida.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('El catálogo remoto debe usar http:// o https://');
  return parsed.toString();
}

function ensureTrailingSlashUrl(value) {
  const text = String(value || '');
  return text.endsWith('/') ? text : `${text}/`;
}

function joinRemoteUrl(baseUrl, childPath = '') {
  return new URL(String(childPath || '').replace(/^\/+/, ''), ensureTrailingSlashUrl(baseUrl)).toString();
}

async function fetchRemoteJson(url, label = 'JSON') {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`No se pudo leer ${label}: ${response.status}`);
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label} no es JSON válido: ${error.message}`);
  }
}

function normalizeRemotePluginManifest(manifest = {}, context = {}) {
  const pkg = manifest.package && typeof manifest.package === 'object' ? manifest.package : {};
  const pluginFolderUrl = context.pluginFolderUrl || manifest.remotePluginFolderUrl || '';
  const packageFile = pkg.file || pkg.zip || pkg.fileName || manifest.fileName || '';
  const downloadUrl = manifest.downloadUrl || pkg.downloadUrl || pkg.url || (pluginFolderUrl && packageFile ? joinRemoteUrl(pluginFolderUrl, packageFile) : '');
  // Imágenes del escaparate (banner de portada + logo), servidas junto al plugin.json.
  const images = manifest.images && typeof manifest.images === 'object' ? manifest.images : {};
  const logoUrl = manifest.logoUrl || (pluginFolderUrl && images.logo ? joinRemoteUrl(pluginFolderUrl, images.logo) : '');
  const bannerUrl = manifest.bannerUrl || (pluginFolderUrl && images.banner ? joinRemoteUrl(pluginFolderUrl, images.banner) : '');
  const screenshotList = Array.isArray(images.screenshots) ? images.screenshots : [];
  const screenshotUrls = manifest.screenshotUrls
    || (pluginFolderUrl ? screenshotList.map(item => joinRemoteUrl(pluginFolderUrl, String(item))) : []);
  return normalizeCatalogPlugin({
    logoUrl,
    bannerUrl,
    screenshotUrls,
    ...manifest,
    id: manifest.id || manifest.slug || context.folder || '',
    slug: manifest.slug || context.folder || manifest.id || '',
    installDirName: manifest.installDirName || manifest.slug || context.folder || manifest.id || '',
    fileName: manifest.fileName || pkg.fileName || packageFile || '',
    downloadUrl,
    sha256: manifest.sha256 || pkg.sha256 || '',
    sizeLabel: manifest.sizeLabel || pkg.sizeLabel || '',
    remoteManifestUrl: context.manifestUrl || manifest.remoteManifestUrl || '',
    remotePluginFolderUrl: pluginFolderUrl,
    package: pkg
  });
}

async function expandRemotePluginCatalog(parsed, catalogUrl) {
  if (Array.isArray(parsed.plugins)) {
    const catalogBaseUrl = new URL('.', catalogUrl).toString();
    return {
      ...parsed,
      plugins: parsed.plugins.map((plugin) => {
        const pluginFolderUrl = plugin.remotePluginFolderUrl || (plugin.manifestUrl ? new URL('.', plugin.manifestUrl).toString() : catalogBaseUrl);
        return normalizeRemotePluginManifest(plugin, { pluginFolderUrl });
      }).filter(plugin => plugin.id)
    };
  }

  const discovery = parsed.discovery || {};
  if (discovery.type !== 'folder-index') throw new Error('El catálogo remoto debe tener plugins[] o discovery.type="folder-index".');

  const catalogBaseUrl = new URL('.', catalogUrl).toString();
  const pluginsFolderUrl = ensureTrailingSlashUrl(new URL(discovery.pluginsFolderUrl || 'plugins/', catalogBaseUrl).toString());
  const folderIndexFile = discovery.folderIndexFile || 'index.json';
  const manifestFile = discovery.manifestFile || 'plugin.json';
  const indexUrl = joinRemoteUrl(pluginsFolderUrl, folderIndexFile);
  const folderIndex = await fetchRemoteJson(indexUrl, 'plugins/index.json');
  const rawFolders = Array.isArray(folderIndex.folders) ? folderIndex.folders : Array.isArray(folderIndex.plugins) ? folderIndex.plugins : [];
  const folders = rawFolders.map(item => typeof item === 'string' ? item : item?.folder || item?.slug || item?.id || '').filter(Boolean);
  const plugins = [];

  for (const folder of folders) {
    const safeFolder = String(folder).replace(/^\/+|\/+$/g, '');
    const pluginFolderUrl = joinRemoteUrl(pluginsFolderUrl, `${safeFolder}/`);
    const manifestUrl = joinRemoteUrl(pluginFolderUrl, manifestFile);
    // Si un plugin fue borrado del repo (manifest 404), se OMITE y el resto
    // del catálogo se refresca igual: así el plugin desaparece del escaparate
    // en vez de dejar el caché viejo congelado.
    let manifest;
    try {
      manifest = await fetchRemoteJson(manifestUrl, `${safeFolder}/${manifestFile}`);
    } catch (error) {
      console.warn(`[plugins] ${safeFolder} omitido: ${error.message}`);
      continue;
    }
    const plugin = normalizeRemotePluginManifest(manifest, { folder: safeFolder, pluginFolderUrl, manifestUrl });
    if (plugin.id) plugins.push(plugin);
  }

  return {
    ...parsed,
    catalogVersion: parsed.catalogVersion || parsed.registryVersion || 1,
    registryMode: 'folder-manifest-registry',
    registryIndexUrl: indexUrl,
    pluginsFolderUrl,
    updatedAt: parsed.updatedAt || folderIndex.updatedAt || new Date().toISOString().slice(0, 10),
    plugins
  };
}

async function refreshRemotePluginCatalog(urlOverride = '') {
  const config = readPluginRemoteCatalogConfig();
  const url = normalizePluginRemoteCatalogUrl(urlOverride || resolvePluginRemoteCatalogUrl(config));
  if (!url) return null;
  let parsed;
  try {
    parsed = await fetchRemoteJson(url, 'catalog.json remoto');
  } catch (error) {
    throw new Error(`El catálogo remoto no se pudo leer: ${error.message}`);
  }
  const expanded = await expandRemotePluginCatalog(parsed, url);
  if (!Array.isArray(expanded.plugins)) throw new Error('El catálogo remoto no generó una lista de complementos.');
  expanded.remoteUrl = url;
  expanded.remoteFetchedAt = new Date().toISOString();
  fs.mkdirSync(pluginsStorageDir(), { recursive: true });
  fs.writeFileSync(pluginRemoteCatalogCachePath(), JSON.stringify(expanded, null, 2) + '\n', 'utf8');
  writePluginRemoteCatalogConfig({ ...config, url, disableDefault: false, lastFetchedAt: expanded.remoteFetchedAt, registryMode: expanded.registryMode || 'plugins-array' });
  return expanded;
}

function adobeCepExtensionsDir() {
  if (process.platform === 'darwin') {
    return path.join(app.getPath('home'), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions');
  }
  const roamingAppData = process.env.APPDATA || app.getPath('appData');
  return path.join(roamingAppData, 'Adobe', 'CEP', 'extensions');
}

function normalizeCatalogPlugin(plugin = {}) {
  const pkg = plugin.package && typeof plugin.package === 'object' ? plugin.package : {};
  const id = String(plugin.id || plugin.slug || plugin.name || '').trim().replace(/\s+/g, '-').toLowerCase();
  const packageFile = pkg.file || pkg.zip || pkg.fileName || plugin.fileName || '';
  const downloadUrl = plugin.downloadUrl || pkg.downloadUrl || pkg.url || '';
  return {
    ...plugin,
    id,
    name: plugin.name || id || 'Complemento',
    category: plugin.category || (plugin.type === 'adobe-cep' ? 'adobe' : 'clipdock'),
    version: plugin.version || '0.0.0',
    installMode: plugin.installMode || (downloadUrl ? 'zip' : plugin.bundledPath ? 'bundled' : 'manual'),
    installDirName: plugin.installDirName || plugin.slug || id,
    fileName: plugin.fileName || packageFile || '',
    downloadUrl,
    sha256: plugin.sha256 || pkg.sha256 || '',
    sizeLabel: plugin.sizeLabel || pkg.sizeLabel || ''
  };
}


function expandLocalFolderManifestCatalog(parsed = {}, candidatePath = '') {
  const discovery = parsed.discovery || {};
  if (discovery.type !== 'folder-index') return [];
  const catalogDir = path.dirname(candidatePath);
  const localPluginsFolder = discovery.localPluginsFolder || discovery.pluginsFolder || 'plugins';
  const pluginsFolderPath = path.resolve(catalogDir, localPluginsFolder);
  const folderIndexFile = discovery.folderIndexFile || 'index.json';
  const manifestFile = discovery.manifestFile || 'plugin.json';
  const indexPath = path.join(pluginsFolderPath, folderIndexFile);
  if (!fs.existsSync(indexPath)) return [];
  const folderIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const rawFolders = Array.isArray(folderIndex.folders) ? folderIndex.folders : Array.isArray(folderIndex.plugins) ? folderIndex.plugins : [];
  const folders = rawFolders.map(item => typeof item === 'string' ? item : item?.folder || item?.slug || item?.id || '').filter(Boolean);
  return folders.map(folder => {
    const safeFolder = String(folder).replace(/^\/+|\/+$/g, '');
    const pluginFolder = path.join(pluginsFolderPath, safeFolder);
    const manifestPath = path.join(pluginFolder, manifestFile);
    if (!fs.existsSync(manifestPath)) return null;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const pkg = manifest.package && typeof manifest.package === 'object' ? manifest.package : {};
    const packageFile = pkg.file || pkg.zip || pkg.fileName || manifest.fileName || '';
    return normalizeCatalogPlugin({
      ...manifest,
      id: manifest.id || manifest.slug || safeFolder,
      slug: manifest.slug || safeFolder,
      installDirName: manifest.installDirName || manifest.slug || safeFolder,
      fileName: manifest.fileName || pkg.fileName || packageFile || '',
      localPath: packageFile ? path.join(pluginFolder, packageFile) : manifest.localPath || '',
      sha256: manifest.sha256 || pkg.sha256 || '',
      sizeLabel: manifest.sizeLabel || pkg.sizeLabel || '',
      catalogDir: pluginFolder,
      registryMode: 'folder-manifest-registry-local'
    });
  }).filter(Boolean).filter(plugin => plugin.id);
}

function parseMarketplaceCatalogFile(candidate, options = {}) {
  const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
  const directPlugins = (Array.isArray(parsed.plugins) ? parsed.plugins : [])
    .map(plugin => normalizeCatalogPlugin({ ...plugin, catalogDir: path.dirname(candidate) }))
    .filter(plugin => plugin.id);
  const localFolderPlugins = expandLocalFolderManifestCatalog(parsed, candidate);
  const plugins = directPlugins.length ? directPlugins : localFolderPlugins;
  const discoveryOnly = parsed.discovery && !Array.isArray(parsed.plugins) && !plugins.length;
  return {
    ...parsed,
    catalogVersion: parsed.catalogVersion || parsed.registryVersion || 1,
    registryMode: parsed.registryMode || (localFolderPlugins.length ? 'folder-manifest-registry-local' : ''),
    plugins,
    sourcePath: candidate,
    sourceType: options.sourceType || 'file',
    override: Boolean(options.override),
    remote: Boolean(options.remote),
    remoteUrl: options.remoteUrl || parsed.remoteUrl || '',
    remoteFetchedAt: parsed.remoteFetchedAt || options.remoteFetchedAt || '',
    error: discoveryOnly && !plugins.length ? 'Este catálogo usa discovery folder-index. Presiona Buscar updates para generar cache de manifiestos.' : parsed.error || ''
  };
}

function loadMarketplaceCatalog() {
  const remoteConfig = readPluginRemoteCatalogConfig();
  const remoteUrl = resolvePluginRemoteCatalogUrl(remoteConfig);
  const candidates = [
    ...(remoteUrl ? [{ path: pluginRemoteCatalogCachePath(), sourceType: 'remote-cache', remote: true, remoteUrl, remoteFetchedAt: remoteConfig.lastFetchedAt || '' }] : []),
    { path: pluginCatalogOverridePath(), sourceType: 'custom-file', override: true }
  ];
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate.path)) continue;
      return parseMarketplaceCatalogFile(candidate.path, candidate);
    } catch (error) {
      return { catalogVersion: 1, updatedAt: new Date().toISOString(), sourcePath: candidate.path, sourceType: candidate.sourceType, remote: Boolean(candidate.remote), remoteUrl: candidate.remoteUrl || '', error: error.message, plugins: fallbackPluginCatalog().map(normalizeCatalogPlugin) };
    }
  }
  return { catalogVersion: 1, updatedAt: new Date().toISOString(), sourcePath: '', sourceType: 'fallback', remote: false, remoteUrl: '', plugins: fallbackPluginCatalog().map(normalizeCatalogPlugin) };
}

function fallbackPluginCatalog() {
  // Sin catálogo local: si no hay internet ni caché remoto, Complementos
  // muestra el estado vacío hasta poder leer github.com/depsoniac/ClipDock-Marketplace.
  return [];
}

function findPlugin(pluginId) {
  const catalog = loadMarketplaceCatalog();
  return (catalog.plugins || []).find(plugin => plugin.id === pluginId) || null;
}

function isAdobePlugin(plugin) {
  return Boolean(plugin?.type === 'adobe-cep' || plugin?.installMode === 'bundled-adobe-cep' || plugin?.target === 'adobe-cep');
}

function pluginInstallLocation(plugin) {
  return path.join(pluginsStorageDir(), plugin?.installDirName || plugin?.id || 'plugin');
}

function pluginCepLocation(plugin) {
  if (!isAdobePlugin(plugin)) return '';
  return path.join(adobeCepExtensionsDir(), plugin.cepDirName || 'ClipDock CEP');
}

function pluginCepSourceLocation(installedRoot, plugin) {
  const candidates = [
    plugin?.cepSubdir ? path.join(installedRoot, plugin.cepSubdir) : '',
    path.join(installedRoot, 'cep'),
    installedRoot
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(path.join(candidate, 'CSXS', 'manifest.xml'))) || '';
}

function pluginSourcePath(plugin) {
  if (plugin?.bundledPath) return sourceResourcePath(plugin.bundledPath);
  return '';
}

function readInstalledPluginManifest(location) {
  try {
    const manifestPath = path.join(location, 'plugin.json');
    if (!fs.existsSync(manifestPath)) return {};
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function pluginInstalled(plugin, registry = readPluginRegistry()) {
  const location = pluginInstallLocation(plugin);
  const meta = registry[plugin.id] || {};
  const installedManifest = readInstalledPluginManifest(location);
  const pluginFolderReady = fs.existsSync(location) && (fs.existsSync(path.join(location, 'plugin.json')) || fs.existsSync(path.join(location, 'CSXS', 'manifest.xml')) || fs.existsSync(path.join(location, 'cep')));
  const cepPath = pluginCepLocation(plugin);
  const cepInstalled = isAdobePlugin(plugin) ? fs.existsSync(path.join(cepPath, 'CSXS', 'manifest.xml')) : false;
  const installed = isAdobePlugin(plugin) ? Boolean(pluginFolderReady && cepInstalled) : fs.existsSync(location);
  return {
    installed,
    installedVersion: installed ? String(meta.version || installedManifest.version || plugin.version || '') : '',
    installedAt: installed ? String(meta.installedAt || installedManifest.installedAt || '') : '',
    installedSha256: installed ? String(meta.sha256 || installedManifest.sha256 || '') : '',
    installedFileName: installed ? String(meta.fileName || installedManifest.fileName || '') : '',
    installedPackageUpdatedAt: installed ? String(meta.packageUpdatedAt || installedManifest.packageUpdatedAt || '') : '',
    path: location,
    cepInstalled,
    cepPath
  };
}

function pluginHasUpdate(plugin, state) {
  if (!state?.installed) return false;

  const latestVersion = String(plugin?.version || '');
  const installedVersion = String(state.installedVersion || '');
  if (latestVersion && installedVersion && compareVersions(latestVersion, installedVersion) > 0) return true;

  // Respaldo útil para el marketplace: si por accidente se sube un ZIP nuevo
  // sin subir el número de versión, ClipDock también lo detecta por SHA256.
  // Aun así, lo correcto para publicar releases es aumentar version en plugin.json.
  const latestSha = String(plugin?.sha256 || '').trim().toLowerCase();
  const installedSha = String(state.installedSha256 || '').trim().toLowerCase();
  if (latestSha && installedSha && latestSha !== installedSha) return true;

  return false;
}

function serializePlugin(plugin, catalogInfo, registry = readPluginRegistry()) {
  const state = pluginInstalled(plugin, registry);
  const sourcePath = pluginSourcePath(plugin);
  const updateAvailable = pluginHasUpdate(plugin, state);
  const shaChanged = Boolean(updateAvailable && plugin.sha256 && state.installedSha256 && String(plugin.sha256).toLowerCase() !== String(state.installedSha256).toLowerCase());
  const versionChanged = Boolean(updateAvailable && plugin.version && state.installedVersion && compareVersions(plugin.version, state.installedVersion) > 0);
  return {
    ...plugin,
    installed: state.installed,
    installedSize: state.installed && state.path && fs.existsSync(state.path) ? directorySizeBytes(state.path) : 0,
    installedVersion: state.installedVersion,
    installedAt: state.installedAt,
    installedSha256: state.installedSha256,
    installedFileName: state.installedFileName,
    installedPackageUpdatedAt: state.installedPackageUpdatedAt,
    latestVersion: plugin.version || '',
    latestSha256: plugin.sha256 || '',
    path: state.path,
    cepInstalled: state.cepInstalled,
    cepPath: state.cepPath,
    updateAvailable,
    updateReason: versionChanged ? 'version' : shaChanged ? 'package' : '',
    available: Boolean(plugin.downloadUrl || plugin.fileName || (sourcePath && fs.existsSync(sourcePath))),
    sourcePath: sourcePath && fs.existsSync(sourcePath) ? sourcePath : '',
    catalogSource: catalogInfo.sourcePath || '',
    catalogUpdatedAt: catalogInfo.updatedAt || ''
  };
}

async function listPlugins(options = {}) {
  fs.mkdirSync(pluginsStorageDir(), { recursive: true });
  let remoteError = '';
  const remoteConfig = readPluginRemoteCatalogConfig();
  const remoteUrl = resolvePluginRemoteCatalogUrl(remoteConfig);
  if (remoteUrl && (options.refreshRemote || !fs.existsSync(pluginRemoteCatalogCachePath()))) {
    try { await refreshRemotePluginCatalog(); }
    catch (error) { remoteError = error.message || String(error); }
  }
  const catalog = loadMarketplaceCatalog();
  const registry = readPluginRegistry();
  // Plugins instalados que ya NO existen en el catálogo (retirados del repo):
  // se muestran solo para poder desinstalarlos.
  const catalogIds = new Set((catalog.plugins || []).map(plugin => plugin.id));
  const retiredPlugins = Object.entries(registry)
    .filter(([id]) => id && !catalogIds.has(id))
    .map(([id, meta]) => {
      const location = meta.path || path.join(pluginsStorageDir(), id);
      const manifest = readInstalledPluginManifest(location);
      return normalizeCatalogPlugin({
        id,
        name: manifest.name || id,
        version: meta.version || manifest.version || '',
        type: meta.type || manifest.type || '',
        category: meta.category || manifest.category || 'clipdock',
        summary: 'Este complemento fue retirado del catálogo.',
        description: 'Ya no se distribuye en el marketplace. Puedes seguir usándolo o desinstalarlo.',
        installDirName: meta.path ? path.basename(meta.path) : id,
        cepDirName: meta.cepPath ? path.basename(meta.cepPath) : undefined,
        retired: true
      });
    });
  return {
    catalogVersion: catalog.catalogVersion || 1,
    updatedAt: catalog.updatedAt || '',
    sourcePath: catalog.sourcePath || '',
    sourceType: catalog.sourceType || '',
    registryMode: catalog.registryMode || remoteConfig.registryMode || '',
    registryIndexUrl: catalog.registryIndexUrl || '',
    pluginsFolderUrl: catalog.pluginsFolderUrl || '',
    override: Boolean(catalog.override),
    remote: Boolean(catalog.remote),
    remoteEnabled: Boolean(remoteUrl),
    remoteUrl: catalog.remoteUrl || remoteUrl || '',
    remoteFetchedAt: catalog.remoteFetchedAt || remoteConfig.lastFetchedAt || '',
    remoteError,
    error: catalog.error || '',
    plugins: [
      ...(catalog.plugins || []).map(plugin => serializePlugin(plugin, catalog, registry)),
      ...retiredPlugins.map(plugin => serializePlugin(plugin, catalog, registry))
    ]
  };
}

async function installPlugin(pluginId) {
  const plugin = findPlugin(pluginId);
  if (!plugin) throw new Error('Complemento desconocido. Actualiza el catálogo e intenta de nuevo.');
  const destination = pluginInstallLocation(plugin);
  const { source, sourceType } = await materializePluginSource(plugin);

  if (!source || !fs.existsSync(source)) throw new Error('No encontré los archivos del complemento.');
  const sourceCep = isAdobePlugin(plugin) ? pluginCepSourceLocation(source, plugin) : '';
  if (isAdobePlugin(plugin) && !sourceCep) {
    throw new Error('El complemento Adobe CEP no trae cep/CSXS/manifest.xml. No se instaló.');
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.rmSync(destination, { recursive: true, force: true });
  copyDirectorySync(source, destination);
  writePluginManifest(destination, plugin);

  let cepPath = '';
  if (isAdobePlugin(plugin)) {
    const installedCepSource = pluginCepSourceLocation(destination, plugin);
    if (!installedCepSource) throw new Error('Se copió el complemento, pero no encontré la carpeta CEP interna.');
    cepPath = pluginCepLocation(plugin);
    fs.mkdirSync(path.dirname(cepPath), { recursive: true });
    fs.rmSync(cepPath, { recursive: true, force: true });
    copyDirectorySync(installedCepSource, cepPath);
    enableCepDebugMode();
  }

  const registry = readPluginRegistry();
  registry[plugin.id] = {
    version: plugin.version || '',
    sha256: plugin.sha256 || '',
    fileName: plugin.fileName || '',
    packageUpdatedAt: plugin.package?.updatedAt || plugin.updatedAt || '',
    remoteManifestUrl: plugin.remoteManifestUrl || '',
    installedAt: new Date().toISOString(),
    path: destination,
    cepPath,
    type: plugin.type || '',
    category: plugin.category || '',
    source: plugin.downloadUrl || plugin.localPath || sourceType || 'bundled-catalog'
  };
  writePluginRegistry(registry);
  const catalog = loadMarketplaceCatalog();
  return serializePlugin(plugin, catalog, registry);
}

async function installPluginUpdates() {
  // Antes de instalar, se refresca el marketplace remoto para evitar que el botón
  // “Actualizar todo” use caché viejo. Si no hay internet, seguimos con el caché
  // disponible para no bloquear reinstalaciones/manuales.
  try {
    if (resolvePluginRemoteCatalogUrl()) await refreshRemotePluginCatalog();
  } catch (error) {
    console.warn('[plugins] no se pudo refrescar catálogo antes de actualizar:', error.message || error);
  }
  const catalog = loadMarketplaceCatalog();
  const registry = readPluginRegistry();
  const updates = (catalog.plugins || []).filter(plugin => pluginHasUpdate(plugin, pluginInstalled(plugin, registry)));
  const results = [];
  for (const plugin of updates) {
    try {
      const installed = await installPlugin(plugin.id);
      results.push({ id: plugin.id, name: plugin.name, ok: true, version: installed.installedVersion || plugin.version || '' });
    } catch (error) {
      results.push({ id: plugin.id, name: plugin.name, ok: false, error: error.message || String(error) });
    }
  }
  return { ok: results.every(item => item.ok), count: results.length, results };
}

function uninstallPlugin(pluginId) {
  const registry = readPluginRegistry();
  const meta = registry[pluginId] || {};
  const plugin = findPlugin(pluginId);
  // Aunque el plugin ya no exista en el catálogo remoto (retirado del repo),
  // se puede desinstalar usando las rutas guardadas al instalarlo.
  if (!plugin && !meta.path) throw new Error('Complemento desconocido.');
  const destination = plugin ? pluginInstallLocation(plugin) : meta.path;
  if (destination) fs.rmSync(destination, { recursive: true, force: true });
  const cepPath = plugin ? pluginCepLocation(plugin) : (meta.cepPath || '');
  if (cepPath) fs.rmSync(cepPath, { recursive: true, force: true });
  delete registry[pluginId];
  writePluginRegistry(registry);
  return { ok: true, path: destination, cepPath };
}

function appPackageDir() {
  return app.getAppPath ? app.getAppPath() : __dirname;
}

function runtimeResourceDir() {
  return app.isPackaged ? process.resourcesPath : __dirname;
}

function sourceResourcePath(...segments) {
  return path.join(runtimeResourceDir(), ...segments);
}

function copyDirectorySync(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectorySync(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function enableCepDebugMode() {
  for (let version = 8; version <= 14; version += 1) {
    try {
      if (process.platform === 'win32') {
        execFileSync('reg.exe', [
          'add',
          `HKCU\\Software\\Adobe\\CSXS.${version}`,
          '/v', 'PlayerDebugMode',
          '/t', 'REG_SZ',
          '/d', '1',
          '/f'
        ], { stdio: 'ignore', windowsHide: true });
      } else if (process.platform === 'darwin') {
        execFileSync('defaults', ['write', `com.adobe.CSXS.${version}`, 'PlayerDebugMode', '1'], { stdio: 'ignore' });
      }
    } catch (error) {
      console.warn(`[adobe] no se pudo activar PlayerDebugMode CSXS.${version}:`, error.message);
    }
  }
}

function ensureAdobeExtensionInstalled() {
  // ClipDock Remote ya no se instala automáticamente con el programa base.
  // Vive en github.com/depsoniac/ClipDock-Marketplace y se instala desde Complementos.
  return;
}

const COOKIE_EXTENSION_URLS = {
  chrome: 'https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc',
  firefox: 'https://addons.mozilla.org/firefox/addon/get-cookies-txt-locally/',
  github: 'https://github.com/kairi003/Get-cookies.txt-LOCALLY'
};

function normalizeCookieText(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const out = [];
  let hasHeader = false;
  for (const originalLine of text.split('\n')) {
    const line = originalLine.trimEnd();
    if (!line.trim()) continue;
    if (/^# Netscape HTTP Cookie File/i.test(line)) hasHeader = true;
    // Mantener comentarios reales y líneas #HttpOnly_ porque son cookies válidas.
    if (line.startsWith('#') && !line.startsWith('#HttpOnly_')) {
      out.push(line);
      continue;
    }
    if (line.includes('\t')) {
      out.push(line);
      continue;
    }
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 7) {
      out.push([...parts.slice(0, 6), parts.slice(6).join('')].join('\t'));
    } else {
      out.push(line);
    }
  }
  if (!hasHeader) out.unshift('# Netscape HTTP Cookie File');
  return `${out.join('\n')}\n`;
}

function summarizeCookieFile(filePath) {
  const cleanPath = String(filePath || '');
  if (!cleanPath) return { exists: false, looksValid: false, path: '', message: 'No hay archivo seleccionado.' };
  if (!fs.existsSync(cleanPath)) return { exists: false, looksValid: false, path: cleanPath, message: 'El archivo guardado no existe.' };
  const stat = fs.statSync(cleanPath);
  const sample = normalizeCookieText(fs.readFileSync(cleanPath, { encoding: 'utf8' })).slice(0, 256 * 1024);
  const trimmed = sample.trimStart();
  const isJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  const lines = sample.split(/\r?\n/).filter(line => { const value = line.trim(); return value && (!value.startsWith('#') || value.startsWith('#HttpOnly_')); });
  const netscapeLine = lines.find(line => line.split(/\t/).length >= 7);
  const hasYouTube = /(^|[\t\s.])(youtube\.com|google\.com|googlevideo\.com|youtube-nocookie\.com)/i.test(sample);
  let message = 'Archivo cookies.txt detectado correctamente y listo para YouTube.';
  let looksValid = Boolean(netscapeLine);
  if (isJson) {
    looksValid = false;
    message = 'El archivo parece JSON. Exporta otra vez en formato Netscape / cookies.txt.';
  } else if (!looksValid) {
    message = 'No se reconoce formato Netscape. Exporta desde la extensión como cookies.txt.';
  } else if (!hasYouTube) {
    message = 'Formato válido, pero no vi cookies de YouTube/Google en la muestra.';
  }
  return { exists: true, looksValid, hasYouTube, path: cleanPath, fileName: path.basename(cleanPath), size: stat.size, modified: stat.mtime.toISOString(), message };
}

function importCookieFile(sourcePath) {
  const cleanSource = String(sourcePath || '');
  if (!cleanSource || !fs.existsSync(cleanSource)) throw new Error('No encontré el archivo cookies.txt seleccionado.');
  if (!/\.txt$/i.test(cleanSource)) throw new Error('Selecciona un archivo .txt exportado como cookies.txt.');
  const sourceStatus = summarizeCookieFile(cleanSource);
  if (sourceStatus.exists && !sourceStatus.looksValid) throw new Error(sourceStatus.message);
  const destinationDir = cookiesStorageDir();
  fs.mkdirSync(destinationDir, { recursive: true });
  const destinationPath = path.join(destinationDir, 'youtube.cookies.txt');
  const normalized = normalizeCookieText(fs.readFileSync(cleanSource, { encoding: 'utf8' }));
  fs.writeFileSync(destinationPath, normalized, 'utf8');
  const status = summarizeCookieFile(destinationPath);
  return { path: destinationPath, status };
}

function readPackageJson() {
  const candidates = [
    path.join(appPackageDir(), 'package.json'),
    path.join(__dirname, 'package.json')
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    } catch (_) { /* probar siguiente */ }
  }
  return {};
}

function loadUpdateConfig() {
  const packagedConfig = path.join(appPackageDir(), 'update-config.json');
  const userConfig = path.join(updateStorageDir(), 'update-config.json');
  const fallback = { enabled: false, provider: 'github', feedUrl: '', channel: 'stable', github: { owner: '', repo: '', includePrerelease: false } };
  for (const filePath of [userConfig, packagedConfig]) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return { ...fallback, ...parsed, github: { ...fallback.github, ...(parsed.github || {}) }, configPath: filePath };
    } catch (error) {
      return { ...fallback, error: `No se pudo leer ${path.basename(filePath)}: ${error.message}`, configPath: filePath };
    }
  }
  return fallback;
}

function compareVersions(a, b) {
  const parse = value => String(value || '0').replace(/^v/i, '').split(/[.-]/).map(part => Number.parseInt(part, 10) || 0);
  const left = parse(a); const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function chooseReleaseAsset(assets = []) {
  const list = Array.isArray(assets) ? assets.filter(Boolean) : [];
  if (!list.length) return null;
  const nameOf = asset => String(asset.name || asset.fileName || asset.browser_download_url || asset.downloadUrl || asset.url || '').toLowerCase();
  const scoreAsset = asset => {
    const name = nameOf(asset);
    let score = 0;
    if (process.platform === 'win32') {
      if (/clipdock.*setup.*\.exe$/i.test(name) || /setup.*clipdock.*\.exe$/i.test(name)) score += 100;
      if (/\.exe$/i.test(name)) score += 80;
      if (/\.msi$/i.test(name)) score += 70;
      if (/windows|win64|win/i.test(name)) score += 20;
      if (/update.*\.zip$/i.test(name)) score += 15;
      if (/\.zip$/i.test(name)) score += 10;
    } else if (process.platform === 'darwin') {
      if (/\.(dmg|pkg)$/i.test(name)) score += 80;
      if (/mac|darwin/i.test(name)) score += 20;
      if (/\.zip$/i.test(name)) score += 10;
    } else {
      if (/\.(appimage|deb|rpm)$/i.test(name)) score += 80;
      if (/linux/i.test(name)) score += 20;
      if (/\.(zip|tar\.gz)$/i.test(name)) score += 10;
    }
    return score;
  };
  return list.slice().sort((a, b) => scoreAsset(b) - scoreAsset(a))[0] || list[0];
}

function platformAsset(manifest) {
  if (!manifest || typeof manifest !== 'object') return null;
  const platformKey = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
  if (Array.isArray(manifest.assets)) return chooseReleaseAsset(manifest.assets);
  return manifest[platformKey] || manifest.asset || manifest.assets?.[platformKey] || null;
}

function normalizeUpdateManifest(manifest, currentVersion) {
  const asset = platformAsset(manifest);
  const version = String(manifest.version || manifest.tag || manifest.tag_name || '').replace(/^v/i, '');
  if (!version) throw new Error('El manifiesto no tiene versión.');
  return {
    currentVersion,
    latestVersion: version,
    updateAvailable: compareVersions(version, currentVersion) > 0,
    notes: manifest.notes || manifest.body || manifest.description || '',
    pubDate: manifest.pubDate || manifest.published_at || manifest.date || '',
    mandatory: Boolean(manifest.mandatory),
    channel: manifest.channel || 'stable',
    releaseUrl: manifest.releaseUrl || manifest.html_url || '',
    asset: asset ? {
      url: asset.browser_download_url || asset.downloadUrl || asset.url || '',
      sha256: asset.sha256 || asset.hash || '',
      fileName: asset.fileName || asset.name || ''
    } : null
  };
}

function configuredGithubRepo(config) {
  const owner = String(config.github?.owner || '').trim();
  const repo = String(config.github?.repo || '').trim();
  if (!owner || !repo || /tu_usuario|your_user|owner/i.test(owner) || /tu_repo|repo-name/i.test(repo)) return null;
  return { owner, repo, slug: `${owner}/${repo}`, repoUrl: `https://github.com/${owner}/${repo}` };
}

async function checkForUpdates() {
  const pkg = readPackageJson();
  const currentVersion = app.getVersion?.() || pkg.version || '0.0.0';
  const config = loadUpdateConfig();
  const githubRepo = configuredGithubRepo(config);
  const configMeta = {
    currentVersion,
    updateAvailable: false,
    configPath: config.configPath || '',
    provider: config.provider || 'github',
    githubRepo: githubRepo?.slug || `${config.github?.owner || 'TU_USUARIO'}/${config.github?.repo || 'clipdock'}`,
    repoUrl: githubRepo?.repoUrl || 'https://github.com/depsoniac/ClipDock'
  };
  if (config.error) return { ...configMeta, disabled: true, error: config.error };
  if (!config.enabled) {
    return { ...configMeta, disabled: true, message: 'Actualizaciones desactivadas. Activa enabled:true cuando publiques el repo o feed.' };
  }
  let feedUrl = config.feedUrl;
  let headers = {};
  if ((config.provider || 'github') === 'github') {
    if (!githubRepo) return { ...configMeta, disabled: true, message: 'Configura github.owner y github.repo en update-config.json.' };
    feedUrl = `https://api.github.com/repos/${githubRepo.slug}/releases/latest`;
    headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'ClipDock-Updater' };
    const tokenEnv = String(config.github?.tokenEnv || config.tokenEnv || '').trim();
    const token = tokenEnv ? process.env[tokenEnv] : '';
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (!feedUrl) {
    return { ...configMeta, disabled: true, message: 'Configura feedUrl o usa provider: github con owner/repo.' };
  }
  const response = await fetch(feedUrl, { cache: 'no-store', headers });
  if (!response.ok) throw new Error(`No se pudo consultar actualizaciones: ${response.status}`);
  const manifest = await response.json();
  const info = normalizeUpdateManifest(manifest, currentVersion);
  return { ...info, disabled: false, feedUrl, configPath: config.configPath || '', provider: config.provider || 'custom', githubRepo: githubRepo?.slug || '', repoUrl: githubRepo?.repoUrl || '', releaseUrl: info.releaseUrl || config.releaseUrl || githubRepo?.repoUrl || '' };
}

function safeFileName(value, fallback = 'ClipDock-update') {
  return String(value || fallback).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 180) || fallback;
}

function emitUpdateProgress(percent, message) {
  mainWindow?.webContents?.send('update-progress', { percent, message });
}

function downloadToFile(url, destinationPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destinationPath);
    fetch(url).then(response => {
      if (!response.ok) throw new Error(`Descarga falló: ${response.status}`);
      const total = Number(response.headers.get('content-length') || 0);
      let downloaded = 0;
      const reader = response.body.getReader();
      function pump() {
        reader.read().then(({ done, value }) => {
          if (done) {
            file.end(() => resolve(destinationPath));
            return;
          }
          const chunk = Buffer.from(value);
          file.write(chunk);
          downloaded += chunk.length;
          if (total) emitUpdateProgress(Math.round((downloaded / total) * 70), `Descargando actualización ${(downloaded / 1048576).toFixed(1)} MB`);
          else emitUpdateProgress(20, `Descargando actualización ${(downloaded / 1048576).toFixed(1)} MB`);
          pump();
        }).catch(reject);
      }
      pump();
    }).catch(error => {
      file.destroy();
      try { fs.unlinkSync(destinationPath); } catch (_) {}
      reject(error);
    });
  });
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function powershellExpandZip(zipPath, extractDir) {
  // Multiplataforma (el nombre es histórico): PowerShell en Windows,
  // ditto en macOS (conserva permisos y symlinks) y unzip en Linux.
  return new Promise((resolve, reject) => {
    fs.mkdirSync(extractDir, { recursive: true });
    let cmd;
    let args;
    let options = {};
    if (process.platform === 'win32') {
      const command = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`;
      cmd = 'powershell.exe';
      args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command];
      options = { windowsHide: true };
    } else if (process.platform === 'darwin') {
      cmd = 'ditto';
      args = ['-x', '-k', zipPath, extractDir];
    } else {
      cmd = 'unzip';
      args = ['-o', '-q', zipPath, '-d', extractDir];
    }
    const child = spawn(cmd, args, options);
    let stderr = '';
    child.stderr?.on('data', data => { stderr += String(data); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(extractDir) : reject(new Error(stderr || `${cmd} salió con código ${code}`)));
  });
}

function expandZipWithProgress(zipPath, extractDir, onProgress) {
  if (process.platform !== 'win32') {
    onProgress?.({ doneBytes: 0, totalBytes: 0, ratio: 0 });
    return powershellExpandZip(zipPath, extractDir).then(result => {
      onProgress?.({ doneBytes: 1, totalBytes: 1, ratio: 1 });
      return result;
    });
  }

  return new Promise((resolve, reject) => {
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir, { recursive: true });
    const scriptPath = path.join(path.dirname(zipPath), `clipdock-extract-${Date.now()}.ps1`);
    const script = `
param(
  [Parameter(Mandatory=$true)][string]$ZipPath,
  [Parameter(Mandatory=$true)][string]$ExtractDir
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Directory]::CreateDirectory($ExtractDir) | Out-Null
$root = [System.IO.Path]::GetFullPath($ExtractDir)
if (-not $root.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
  $root += [System.IO.Path]::DirectorySeparatorChar
}

function Normalize-ZipEntryName([string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Name)) { return '' }
  # Evita -replace porque PowerShell lo trata como regex y una diagonal invertida
  # solitaria puede romper la extracción en algunos Windows/ZIPs de Python.
  return ($Name.Replace([char]92, [char]47).TrimStart([char]47))
}

function Split-ZipPath([string]$ZipName) {
  if ([string]::IsNullOrWhiteSpace($ZipName)) { return @() }
  return @($ZipName.Split([char]47, [System.StringSplitOptions]::RemoveEmptyEntries))
}

function Join-ExtractPath([string]$BaseDir, [string]$ZipName) {
  $parts = @(Split-ZipPath $ZipName)
  if ($parts.Count -eq 0) { return [System.IO.Path]::GetFullPath($BaseDir) }
  $relative = [System.String]::Join([System.IO.Path]::DirectorySeparatorChar, $parts)
  return [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($BaseDir, $relative))
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
try {
  # Algunos ZIPs de Python traen carpetas sin diagonal final, por ejemplo
  # "Lib/site-packages/backports". Si se extraen como archivo vacío, después
  # fallan los archivos internos. Primero detectamos qué entradas son carpetas
  # reales por los hijos que tienen dentro.
  $directoryNames = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($entry in $zip.Entries) {
    $name = Normalize-ZipEntryName $entry.FullName
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    if ($name.EndsWith('/')) {
      [void]$directoryNames.Add($name.TrimEnd('/'))
      continue
    }
    $parts = @(Split-ZipPath $name)
    if ($parts.Count -gt 1) {
      $current = ''
      for ($i = 0; $i -lt ($parts.Count - 1); $i++) {
        if ($i -eq 0) { $current = $parts[$i] } else { $current = $current + '/' + $parts[$i] }
        [void]$directoryNames.Add($current)
      }
    }
  }

  $total = [Int64]0
  foreach ($entry in $zip.Entries) {
    $name = Normalize-ZipEntryName $entry.FullName
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    $isDirectory = $name.EndsWith('/') -or $directoryNames.Contains($name.TrimEnd('/'))
    if (-not $isDirectory) { $total += [Int64]$entry.Length }
  }
  if ($total -le 0) { $total = 1 }

  $done = [Int64]0
  foreach ($entry in $zip.Entries) {
    $name = Normalize-ZipEntryName $entry.FullName
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    $destination = Join-ExtractPath $ExtractDir $name
    if (-not $destination.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Ruta insegura dentro del ZIP: $($entry.FullName)"
    }

    $isDirectory = $name.EndsWith('/') -or $directoryNames.Contains($name.TrimEnd('/'))
    if ($isDirectory) {
      [System.IO.Directory]::CreateDirectory($destination) | Out-Null
      continue
    }

    $parent = [System.IO.Path]::GetDirectoryName($destination)
    if ($parent) { [System.IO.Directory]::CreateDirectory($parent) | Out-Null }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $true)

    $done += [Int64]$entry.Length
    Write-Output ("CLIPDOCK_EXTRACT_PROGRESS" + [char]9 + $done + [char]9 + $total + [char]9 + $entry.FullName)
  }
} finally {
  $zip.Dispose()
}
`;
    fs.writeFileSync(scriptPath, script, 'utf8');
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, zipPath, extractDir], { windowsHide: true });
    let stderr = '';
    let stdoutBuffer = '';
    const handleLine = line => {
      if (!line.startsWith('CLIPDOCK_EXTRACT_PROGRESS\t')) return;
      const [, doneRaw, totalRaw, entryName = ''] = line.split('\t');
      const doneBytes = Math.max(0, Number(doneRaw) || 0);
      const totalBytes = Math.max(1, Number(totalRaw) || 1);
      onProgress?.({
        doneBytes,
        totalBytes,
        ratio: Math.max(0, Math.min(1, doneBytes / totalBytes)),
        entryName
      });
    };
    child.stdout?.on('data', data => {
      stdoutBuffer += String(data);
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      lines.forEach(handleLine);
    });
    child.stderr?.on('data', data => { stderr += String(data); });
    child.on('error', error => {
      try { fs.rmSync(scriptPath, { force: true }); } catch (_) {}
      reject(error);
    });
    child.on('close', code => {
      if (stdoutBuffer) handleLine(stdoutBuffer);
      try { fs.rmSync(scriptPath, { force: true }); } catch (_) {}
      if (code === 0) return resolve(extractDir);
      reject(new Error(stderr || `powershell.exe salió con código ${code}`));
    });
  });
}

async function downloadToFileQuiet(url, destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Descarga falló: ${response.status}`);
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destinationPath);
    const reader = response.body.getReader();
    function pump() {
      reader.read().then(({ done, value }) => {
        if (done) return file.end(resolve);
        file.write(Buffer.from(value));
        pump();
      }).catch(reject);
    }
    file.on('error', reject);
    pump();
  }).catch(error => {
    try { fs.unlinkSync(destinationPath); } catch (_) {}
    throw error;
  });
  return destinationPath;
}

function pickPluginExtractRoot(extractRoot, plugin) {
  if (plugin?.extractSubdir) {
    const explicit = path.join(extractRoot, plugin.extractSubdir);
    if (fs.existsSync(explicit)) return explicit;
  }
  if (fs.existsSync(path.join(extractRoot, 'CSXS', 'manifest.xml')) || fs.existsSync(path.join(extractRoot, 'plugin.json'))) return extractRoot;
  const entries = fs.readdirSync(extractRoot, { withFileTypes: true }).filter(entry => !entry.name.startsWith('__MACOSX'));
  const dirs = entries.filter(entry => entry.isDirectory());
  const files = entries.filter(entry => entry.isFile());
  if (dirs.length === 1 && files.length === 0) return path.join(extractRoot, dirs[0].name);
  return extractRoot;
}

async function materializePluginSource(plugin) {
  const bundled = pluginSourcePath(plugin);
  if (bundled && fs.existsSync(bundled)) return { source: bundled, sourceType: 'bundled' };
  if (plugin?.localPath) {
    const localPath = path.isAbsolute(plugin.localPath) ? plugin.localPath : path.join(plugin.catalogDir || runtimeResourceDir(), plugin.localPath);
    if (!fs.existsSync(localPath)) throw new Error(`No encontré el paquete local: ${localPath}`);
    if (/\.zip$/i.test(localPath)) {
      const extractRoot = path.join(pluginExtractingDir(), safeFileName(plugin.id, 'plugin'));
      fs.rmSync(extractRoot, { recursive: true, force: true });
      await powershellExpandZip(localPath, extractRoot);
      return { source: pickPluginExtractRoot(extractRoot, plugin), sourceType: 'zip-local' };
    }
    return { source: localPath, sourceType: 'local' };
  }
  if (plugin?.downloadUrl) {
    const urlPath = new URL(plugin.downloadUrl).pathname;
    const fileName = safeFileName(plugin.fileName || path.basename(urlPath) || `${plugin.id}.zip`);
    const downloadPath = path.join(pluginDownloadsDir(), fileName);
    try { if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath); } catch (_) {}
    await downloadToFileQuiet(plugin.downloadUrl, downloadPath);
    if (plugin.sha256) {
      const actual = await sha256File(downloadPath);
      if (actual.toLowerCase() !== String(plugin.sha256).toLowerCase()) throw new Error('El SHA256 del complemento no coincide. No se instaló.');
    }
    if (!/\.zip$/i.test(downloadPath)) throw new Error('Por ahora los complementos descargables deben venir en ZIP.');
    const extractRoot = path.join(pluginExtractingDir(), safeFileName(plugin.id, 'plugin'));
    fs.rmSync(extractRoot, { recursive: true, force: true });
    await powershellExpandZip(downloadPath, extractRoot);
    return { source: pickPluginExtractRoot(extractRoot, plugin), sourceType: 'download' };
  }
  throw new Error('Este complemento no tiene paquete local, bundledPath ni downloadUrl resuelto desde su plugin.json.');
}

function writePluginManifest(destination, plugin) {
  const manifestPath = path.join(destination, 'plugin.json');
  if (fs.existsSync(manifestPath)) return;
  const manifest = {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version || '',
    type: plugin.type || '',
    category: plugin.category || '',
    fileName: plugin.fileName || '',
    sha256: plugin.sha256 || '',
    packageUpdatedAt: plugin.package?.updatedAt || plugin.updatedAt || '',
    remoteManifestUrl: plugin.remoteManifestUrl || '',
    installedAt: new Date().toISOString()
  };
  try { fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8'); } catch (_) {}
}

function findInstaller(startDir) {
  const preferred = ['setup.exe', 'installer.exe', 'install.exe', 'update.exe', 'install-update.ps1', 'update.ps1'];
  const candidates = [];
  const walk = dir => {
    for (const name of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, name);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) walk(fullPath);
      else if (/\.(exe|msi|bat|cmd|ps1)$/i.test(name)) candidates.push(fullPath);
    }
  };
  walk(startDir);
  candidates.sort((a, b) => {
    const left = preferred.indexOf(path.basename(a).toLowerCase());
    const right = preferred.indexOf(path.basename(b).toLowerCase());
    return (left === -1 ? 999 : left) - (right === -1 ? 999 : right);
  });
  return candidates[0] || null;
}

async function downloadAndLaunchUpdate(asset, latestVersion) {
  if (!asset?.url) throw new Error('La actualización no trae URL de descarga.');
  const updatesDir = updateStorageDir();
  const downloadsDir = path.join(updatesDir, '_downloads');
  const extractingDir = path.join(updatesDir, '_extracting', safeFileName(latestVersion, 'latest'));
  fs.mkdirSync(downloadsDir, { recursive: true });
  fs.mkdirSync(extractingDir, { recursive: true });

  const urlPath = new URL(asset.url).pathname;
  const extFromUrl = path.extname(urlPath) || '.zip';
  const fileName = safeFileName(asset.fileName || path.basename(urlPath) || `ClipDock-${latestVersion}${extFromUrl}`);
  const downloadPath = path.join(downloadsDir, fileName);
  try { if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath); } catch (_) {}

  emitUpdateProgress(1, 'Preparando descarga de actualización…');
  await downloadToFile(asset.url, downloadPath);

  if (asset.sha256) {
    emitUpdateProgress(73, 'Verificando integridad…');
    const actual = await sha256File(downloadPath);
    if (actual.toLowerCase() !== String(asset.sha256).toLowerCase()) {
      throw new Error('El SHA256 de la actualización no coincide. No se ejecutó el instalador.');
    }
  }

  let installerPath = downloadPath;
  if (/\.zip$/i.test(downloadPath)) {
    emitUpdateProgress(80, 'Extrayendo instalador…');
    fs.rmSync(extractingDir, { recursive: true, force: true });
    await powershellExpandZip(downloadPath, extractingDir);
    installerPath = findInstaller(extractingDir);
    if (!installerPath) throw new Error('No se encontró instalador dentro del ZIP.');
  }

  emitUpdateProgress(95, 'Abriendo instalador…');
  const ext = path.extname(installerPath).toLowerCase();
  if (ext === '.ps1') {
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installerPath, '-SourceDir', path.dirname(installerPath), '-TargetDir', __dirname], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  } else if (ext === '.msi') {
    spawn('msiexec.exe', ['/i', installerPath], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  } else {
    spawn(installerPath, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  }
  emitUpdateProgress(100, 'Instalador abierto. Cerrando ClipDock…');
  setTimeout(() => app.quit(), 900);
  return { ok: true, installerPath, downloadPath };
}

function getBackendLaunchSpec() {
  const storageDir = appStorageDir();
  if (app.isPackaged) {
    const runtime = resolvePackagedPython();
    const packagedBackend = path.join(process.resourcesPath, 'backend', 'app.py');
    const packagedEngine = path.join(process.resourcesPath, 'engine');
    if (!runtime || !fs.existsSync(packagedBackend) || !fs.existsSync(packagedEngine)) {
      throw new Error(`No encontré el motor interno de ClipDock. Rutas requeridas:\n${[runtime?.python || downloadedRuntimePython(), packagedBackend, packagedEngine].join('\n')}`);
    }
    return {
      command: runtime.python,
      args: [packagedBackend, '--port', String(backendPort)],
      cwd: process.resourcesPath,
      appRoot: process.resourcesPath,
      engineRoot: packagedEngine,
      storageDir,
      runtimeKind: runtime.kind
    };
  }

  const venvPython = path.join(__dirname, 'engine', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const usingLauncher = process.platform === 'win32' && !process.env.CLIPDOCK_PYTHON && !fs.existsSync(venvPython);
  const python = process.env.CLIPDOCK_PYTHON || (fs.existsSync(venvPython) ? venvPython : (process.platform === 'win32' ? 'py' : 'python3'));
  return {
    command: python,
    args: [
      ...(usingLauncher ? ['-3.11'] : []),
      path.join(__dirname, 'backend', 'app.py'),
      '--port',
      String(backendPort)
    ],
    cwd: __dirname,
    appRoot: __dirname,
    engineRoot: path.join(__dirname, 'engine'),
    storageDir,
    runtimeKind: 'development'
  };
}

async function startBackend() {
  backendReady = false;
  backendPort = await freePort();
  bridgePort = await freePortInRange();
  const launch = getBackendLaunchSpec();
  lastBackendLaunch = launch;
  setCurrentEngineLogPath();
  appendEngineLog('=== Inicio del motor ClipDock ===');
  appendEngineLog(`Runtime: ${launch.runtimeKind}`);
  appendEngineLog(`Comando: ${launch.command} ${(launch.args || []).join(' ')}`);
  appendEngineLog(`CWD: ${launch.cwd}`);
  appendEngineLog(`Engine root: ${launch.engineRoot}`);
  appendEngineLog(`Storage: ${launch.storageDir}`);

  const diagnostics = verifyBackendLaunch(launch);
  appendEngineLog('--- Diagnóstico previo ---');
  appendEngineLog(formatDiagnostics(diagnostics));
  if (!diagnostics.ok) {
    const missingModules = diagnostics.missingModules?.map(item => item.label).join(', ');
    const missingPaths = diagnostics.failedChecks?.map(item => item.label).join(', ');
    const parts = [];
    if (missingPaths) parts.push(`faltan rutas: ${missingPaths}`);
    if (missingModules) parts.push(`faltan paquetes: ${missingModules}`);
    const error = new Error(`No pude preparar el motor interno (${parts.join('; ') || 'diagnóstico incompleto'}).`);
    throw Object.assign(error, { clipdockDiagnostics: diagnostics });
  }

  const env = {
    ...process.env,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    CLIPDOCK_APP_ROOT: launch.appRoot,
    CLIPDOCK_ENGINE_ROOT: launch.engineRoot || path.join(launch.appRoot, 'engine'),
    CLIPDOCK_RUNTIME_KIND: launch.runtimeKind || '',
    CLIPDOCK_STORAGE_DIR: launch.storageDir,
    MEDIA_ENGINE_COMPONENTS_DIR: path.join(launch.storageDir, 'Componentes'),
    MEDIA_ENGINE_MODELS_DIR: path.join(launch.storageDir, 'Modelos'),
    MEDIA_ENGINE_CACHE_DIR: path.join(launch.storageDir, 'Cache'),
    CLIPDOCK_BRIDGE_PORT: String(bridgePort),
    CLIPDOCK_LOG_DIR: logsStorageDir()
  };

  backend = spawn(launch.command, launch.args, { cwd: launch.cwd, windowsHide: true, env });
  backend.stdout?.on('data', data => {
    const text = String(data).trimEnd();
    if (text) {
      console.log(`[motor] ${text}`);
      appendEngineLog(`[stdout] ${text}`);
    }
  });
  backend.stderr?.on('data', data => {
    const text = String(data).trimEnd();
    if (text) {
      console.error(`[motor] ${text}`);
      appendEngineLog(`[stderr] ${text}`);
    }
  });

  const earlyFailure = new Promise((_, reject) => {
    backend.once('error', error => {
      appendEngineLog(`[error] ${error.message}`);
      reject(error);
    });
    backend.once('exit', (code, signal) => {
      appendEngineLog(`[exit] code=${code ?? ''} signal=${signal ?? ''}`);
      if (suppressBackendExitNotice) {
        suppressBackendExitNotice = false;
        appendEngineLog('[exit] cierre solicitado por ClipDock');
        return;
      }
      if (!backendReady) reject(new Error(`El motor interno se cerró antes de arrancar (código ${code ?? 'sin código'}${signal ? `, señal ${signal}` : ''}).`));
      else if (code !== 0 && code !== null) sendBackendErrorToRenderer(backendErrorPayload(new Error(`El motor interno se cerró inesperadamente (código ${code}).`), { diagnostics }));
    });
  });

  try {
    await Promise.race([Promise.all([waitForPort(backendPort, 22000), waitForPort(bridgePort, 22000)]), earlyFailure]);
    backendReady = true;
    appendEngineLog(`Motor listo. API=${backendPort} Bridge=${bridgePort}`);
    lastBackendError = null;
  } catch (error) {
    appendEngineLog(`[startup-failed] ${error.message}`);
    try { if (backend && !backend.killed) backend.kill(); } catch (_) {}
    throw Object.assign(error, { clipdockDiagnostics: diagnostics });
  }
}


function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function errorHtml(title, message, detail = '') {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${htmlEscape(title)}</title><style>
    :root{color-scheme:dark}body{margin:0;background:#090a0d;color:#f4f2ec;font-family:Segoe UI,Arial,sans-serif;display:grid;place-items:center;min-height:100vh}.card{max-width:760px;margin:32px;background:#12151a;border:1px solid #2c323d;border-radius:18px;padding:28px;box-shadow:0 24px 70px #0008}h1{margin:0 0 10px;font-size:28px}.tag{color:#c9ff3d;font-size:12px;font-weight:800;letter-spacing:.14em}p{color:#a5abb4;line-height:1.55}.detail{background:#090b0f;border:1px solid #242a33;border-radius:12px;padding:14px;white-space:pre-wrap;color:#c7ccd6;font-size:12px;overflow:auto;max-height:280px}button{background:#c9ff3d;border:0;border-radius:10px;padding:11px 15px;font-weight:800;cursor:pointer;margin-top:14px}
  </style></head><body><main class="card"><div class="tag">CLIPDOCK</div><h1>${htmlEscape(title)}</h1><p>${htmlEscape(message)}</p>${detail ? `<pre class="detail">${htmlEscape(detail)}</pre>` : ''}<button onclick="location.reload()">Reintentar cargar interfaz</button></main></body></html>`;
}

function loadErrorPage(title, message, detail = '') {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(errorHtml(title, message, detail))}`;
  mainWindow.loadURL(url).catch(error => console.error('[renderer-fallback]', error));
}

async function loadRenderer() {
  const indexPath = path.join(appPackageDir(), 'renderer', 'index.html');
  if (!fs.existsSync(indexPath)) {
    loadErrorPage(
      'No encontré la interfaz',
      'Parece que ClipDock se abrió desde una instalación incompleta. Reinstala usando el instalador final de ClipDock.',
      `Ruta esperada:\n${indexPath}`
    );
    return;
  }
  try {
    await mainWindow.loadFile(indexPath);
  } catch (error) {
    loadErrorPage('No se pudo cargar la interfaz', 'Electron abrió, pero falló al leer renderer/index.html.', error.stack || error.message);
  }
}

// ================== INSTALADOR ESTILO G HUB (modo setup) ==================
const UNINSTALL_REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ClipDock';
let setupWindow = null;

function installTargetDir() {
  const base = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
  return path.join(base, 'Programs', 'ClipDock');
}

function installedExePath() {
  return path.join(installTargetDir(), 'ClipDock.exe');
}

function desktopShortcutPath() {
  return path.join(app.getPath('desktop'), 'ClipDock.lnk');
}

function startMenuShortcutPath() {
  const roaming = process.env.APPDATA || app.getPath('appData');
  return path.join(roaming, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'ClipDock.lnk');
}

// Dentro de Electron, app.asar se comporta como carpeta virtual. Para copiar
// la instalación hay que tratarlo como el ARCHIVO que realmente es: se apaga
// el soporte asar del módulo fs mientras se listan/copian archivos.
function withRealFs(fn) {
  const previous = process.noAsar;
  process.noAsar = true;
  try { return fn(); } finally { process.noAsar = previous; }
}

function listFilesRecursive(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFilesRecursive(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
}

function directorySizeBytes(dir) {
  return withRealFs(() => {
    let total = 0;
    try {
      for (const rel of listFilesRecursive(dir)) {
        try { total += fs.statSync(path.join(dir, rel)).size; } catch (_) {}
      }
    } catch (_) {}
    return total;
  });
}

function freeDiskBytes(anyPath) {
  try {
    const stats = fs.statfsSync(path.parse(anyPath).root);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch (_) {
    return 0;
  }
}

function regAdd(name, type, value) {
  try {
    execFileSync('reg', ['add', UNINSTALL_REG_KEY, '/v', name, '/t', type, '/d', String(value), '/f'], { windowsHide: true });
  } catch (error) {
    console.error('[setup] reg add', name, error.message);
  }
}

function writeUninstallRegistry(installedSizeBytes) {
  const exe = installedExePath();
  try { execFileSync('reg', ['add', UNINSTALL_REG_KEY, '/f'], { windowsHide: true }); } catch (_) {}
  regAdd('DisplayName', 'REG_SZ', 'ClipDock');
  regAdd('DisplayVersion', 'REG_SZ', app.getVersion());
  regAdd('Publisher', 'REG_SZ', 'Depson');
  regAdd('InstallLocation', 'REG_SZ', installTargetDir());
  regAdd('DisplayIcon', 'REG_SZ', exe);
  regAdd('UninstallString', 'REG_SZ', `"${exe}" --uninstall`);
  regAdd('NoModify', 'REG_DWORD', 1);
  regAdd('NoRepair', 'REG_DWORD', 1);
  regAdd('EstimatedSize', 'REG_DWORD', Math.max(1, Math.round(installedSizeBytes / 1024)));
}

function createInstallerShortcuts() {
  const options = { target: installedExePath(), cwd: installTargetDir(), description: 'ClipDock — mesa de trabajo multimedia' };
  try { shell.writeShortcutLink(desktopShortcutPath(), 'create', options); } catch (error) { console.error('[setup] shortcut escritorio', error.message); }
  try { shell.writeShortcutLink(startMenuShortcutPath(), 'create', options); } catch (error) { console.error('[setup] shortcut menu inicio', error.message); }
}

function sendSetupProgress(payload) {
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.webContents.send('setup-progress', payload);
}

async function performInstall() {
  // El asar se copia como archivo real, no como carpeta virtual.
  const previousNoAsar = process.noAsar;
  process.noAsar = true;
  try {
    const sourceDir = path.dirname(process.execPath);
    const targetDir = installTargetDir();
    const files = listFilesRecursive(sourceDir);
    const total = files.length || 1;
    fs.mkdirSync(targetDir, { recursive: true });

    let done = 0;
    let copiedBytes = 0;
    for (const rel of files) {
      const from = path.join(sourceDir, rel);
      const to = path.join(targetDir, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      try {
        fs.copyFileSync(from, to);
        copiedBytes += fs.statSync(to).size;
      } catch (error) {
        if (/EBUSY|EPERM|EACCES/i.test(String(error.code))) {
          throw new Error('No pude escribir en la carpeta de instalación. Si ClipDock está abierto, ciérralo y presiona Reintentar.');
        }
        throw error;
      }
      done += 1;
      if (done % 20 === 0 || done === total) {
        sendSetupProgress({ phase: 'copy', done, total, percent: Math.round((done / total) * 92) });
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    sendSetupProgress({ phase: 'shortcuts', percent: 95 });
    createInstallerShortcuts();
    sendSetupProgress({ phase: 'registry', percent: 98 });
    writeUninstallRegistry(copiedBytes);
    sendSetupProgress({ phase: 'done', percent: 100 });
  } finally {
    process.noAsar = previousNoAsar;
  }
}

function launchInstalledApp() {
  const env = { ...process.env };
  delete env.PORTABLE_EXECUTABLE_FILE;
  delete env.PORTABLE_EXECUTABLE_DIR;
  delete env.PORTABLE_EXECUTABLE_APP_FILENAME;
  try {
    const child = spawn(installedExePath(), [], { cwd: installTargetDir(), env, detached: true, stdio: 'ignore' });
    child.unref();
  } catch (error) {
    console.error('[setup] no pude abrir ClipDock instalado', error.message);
  }
}

function createInstallerWindow() {
  setupWindow = new BrowserWindow({
    width: 880,
    height: 600,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'Instalar ClipDock',
    icon: path.join(appPackageDir(), 'assets', 'clipdock.ico'),
    webPreferences: {
      preload: path.join(appPackageDir(), 'renderer', 'setup-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  setupWindow.loadFile(path.join(appPackageDir(), 'renderer', 'setup.html'), { query: { v: app.getVersion() } }).catch(() => {});
  setupWindow.once('ready-to-show', () => { if (setupWindow && !setupWindow.isDestroyed()) setupWindow.show(); });
  setupWindow.on('closed', () => { setupWindow = null; });
}

async function runUninstaller() {
  const result = await dialog.showMessageBox({
    type: 'question',
    title: 'Desinstalar ClipDock',
    message: '¿Quieres desinstalar ClipDock?',
    detail: 'Se quitarán el programa, los accesos directos y su entrada en Aplicaciones. Tus archivos en Documentos/ClipDock no se tocan.',
    buttons: ['Desinstalar', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  });
  if (result.response !== 0) { app.quit(); return; }
  try { fs.rmSync(desktopShortcutPath(), { force: true }); } catch (_) {}
  try { fs.rmSync(startMenuShortcutPath(), { force: true }); } catch (_) {}
  try { execFileSync('reg', ['delete', UNINSTALL_REG_KEY, '/f'], { windowsHide: true }); } catch (_) {}
  // La carpeta se borra después de que este proceso termine.
  try {
    const cleaner = spawn('cmd.exe', ['/c', `timeout /t 2 /nobreak >nul & rmdir /s /q "${installTargetDir()}"`], {
      cwd: process.env.TEMP || 'C:\\',
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    cleaner.unref();
  } catch (_) {}
  app.quit();
}

ipcMain.handle('setup-info', () => {
  const sourceDir = path.dirname(process.execPath);
  return {
    version: app.getVersion(),
    targetDir: installTargetDir(),
    sizeBytes: directorySizeBytes(sourceDir),
    freeBytes: freeDiskBytes(installTargetDir()),
    alreadyInstalled: fs.existsSync(installedExePath())
  };
});
ipcMain.handle('setup-install', async () => {
  try {
    await performInstall();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});
ipcMain.handle('setup-launch', () => {
  launchInstalledApp();
  setTimeout(() => app.quit(), 300);
  return true;
});
ipcMain.handle('setup-close', () => { app.quit(); return true; });
// ================== FIN INSTALADOR ==================

// ============== MOTOR PYTHON DESCARGABLE (post-instalación) ==============
// El instalador ya no incluye el runtime Python. En el primer arranque, si no
// existe, se descarga desde GitHub Releases (release fijo con tag "runtime")
// y se guarda en Documentos/ClipDock/Componentes/python-runtime.
const RUNTIME_PY_VERSION = '3.11.9';
let runtimeWindow = null;

function downloadedRuntimeDir() {
  return path.join(appStorageDir(), 'Componentes', 'python-runtime');
}

// En Windows el runtime trae python.exe en la raíz; en macOS (python-build-standalone)
// el binario vive en bin/python3.
function runtimePythonSegments() {
  return process.platform === 'win32' ? ['python.exe'] : ['bin', 'python3'];
}

function downloadedRuntimePython() {
  return path.join(downloadedRuntimeDir(), ...runtimePythonSegments());
}

function bundledRuntimePython() {
  return path.join(process.resourcesPath, 'runtime', 'python', ...runtimePythonSegments());
}

function resolvePackagedPython() {
  // El runtime descargado tiene prioridad: es el que se puede actualizar desde Componentes.
  try { if (fs.existsSync(downloadedRuntimePython())) return { python: downloadedRuntimePython(), kind: 'python-downloaded' }; } catch (_) {}
  try { if (fs.existsSync(bundledRuntimePython())) return { python: bundledRuntimePython(), kind: 'python-portable' }; } catch (_) {}
  return null;
}

function runtimeArchKey() {
  return process.arch === 'arm64' ? 'arm64' : 'x64';
}

function defaultRuntimeAssetName() {
  if (process.platform === 'darwin') {
    return `ClipDock_Runtime_python-${RUNTIME_PY_VERSION}-macos-${runtimeArchKey()}.zip`;
  }
  return `ClipDock_Runtime_python-${RUNTIME_PY_VERSION}.zip`;
}

function runtimeDownloadUrl() {
  const fallback = `https://github.com/depsoniac/ClipDock-Runtime/releases/download/runtime/${defaultRuntimeAssetName()}`;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(appPackageDir(), 'update-config.json'), 'utf8'));
    const rt = cfg.runtime || {};
    if (rt.url) return String(rt.url);
    const owner = rt.owner || cfg.github?.owner || 'depsoniac';
    const repo = rt.repo || cfg.github?.repo || 'ClipDock';
    const tag = rt.tag || 'runtime';
    let asset;
    if (process.platform === 'darwin') {
      asset = runtimeArchKey() === 'arm64'
        ? (rt.assetMacArm64 || rt.assetMac || defaultRuntimeAssetName())
        : (rt.assetMacX64 || rt.assetMac || defaultRuntimeAssetName());
    } else {
      asset = rt.asset || defaultRuntimeAssetName();
    }
    return `https://github.com/${owner}/${repo}/releases/download/${tag}/${asset}`;
  } catch (_) {
    return fallback;
  }
}

function ensureRuntimeExecutable(runtimeDir) {
  if (process.platform === 'win32') return;
  const candidates = [
    path.join(runtimeDir, 'bin', 'python3'),
    path.join(runtimeDir, 'bin', 'python'),
    path.join(runtimeDir, 'bin', 'pip3'),
    path.join(runtimeDir, 'bin', 'pip')
  ];
  for (const filePath of candidates) {
    try { if (fs.existsSync(filePath)) fs.chmodSync(filePath, 0o755); } catch (_) {}
  }
}

function sendRuntimeProgress(payload) {
  if (runtimeWindow && !runtimeWindow.isDestroyed()) runtimeWindow.webContents.send('engine-dl-progress', payload);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('engine-runtime-progress', payload);
}

async function downloadAndInstallRuntime() {
  const url = runtimeDownloadUrl();
  const cacheDir = path.join(appStorageDir(), 'Cache');
  const zipPath = path.join(cacheDir, 'ClipDock_Runtime.zip');
  fs.mkdirSync(cacheDir, { recursive: true });
  try { fs.rmSync(zipPath, { force: true }); } catch (_) {}

  sendRuntimeProgress({ phase: 'download', percent: 0 });
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`No pude descargar el motor (${response.status}). Revisa tu conexión e intenta de nuevo.`);
  const totalBytes = Number(response.headers.get('content-length') || 0);
  const file = fs.createWriteStream(zipPath);
  const reader = response.body.getReader();
  let received = 0;
  await new Promise((resolve, reject) => {
    file.on('error', reject);
    function pump() {
      reader.read().then(({ done, value }) => {
        if (done) return file.end(resolve);
        file.write(Buffer.from(value));
        received += value.length;
        const percent = totalBytes ? Math.round((received / totalBytes) * 70) : 35;
        sendRuntimeProgress({
          phase: 'download',
          percent,
          receivedMB: Math.round(received / 1048576),
          totalMB: totalBytes ? Math.round(totalBytes / 1048576) : 0
        });
        pump();
      }).catch(reject);
    }
    pump();
  }).catch(error => {
    try { fs.unlinkSync(zipPath); } catch (_) {}
    throw error;
  });

  sendRuntimeProgress({ phase: 'extract', percent: 71, extractedMB: 0, totalMB: 0 });
  const extractDir = path.join(cacheDir, '_runtime-extract');
  let lastExtractPercent = 71;
  let lastExtractSentAt = 0;
  await expandZipWithProgress(zipPath, extractDir, progress => {
    const percent = Math.max(71, Math.min(90, Math.round(71 + (progress.ratio || 0) * 19)));
    const now = Date.now();
    if (percent === lastExtractPercent && now - lastExtractSentAt < 250) return;
    lastExtractPercent = percent;
    lastExtractSentAt = now;
    sendRuntimeProgress({
      phase: 'extract',
      percent,
      extractedMB: Math.round((progress.doneBytes || 0) / 1048576),
      totalMB: progress.totalBytes ? Math.round(progress.totalBytes / 1048576) : 0,
      currentFile: progress.entryName || ''
    });
  });
  sendRuntimeProgress({ phase: 'extract', percent: 90 });

  // El zip puede traer el binario de Python en la raíz o dentro de una carpeta.
  const pythonRel = path.join(...runtimePythonSegments());
  let sourceRoot = extractDir;
  if (!fs.existsSync(path.join(sourceRoot, pythonRel))) {
    const subdirs = fs.readdirSync(extractDir, { withFileTypes: true }).filter(entry => entry.isDirectory());
    const withPython = subdirs.find(entry => fs.existsSync(path.join(extractDir, entry.name, pythonRel)));
    if (withPython) sourceRoot = path.join(extractDir, withPython.name);
  }
  if (!fs.existsSync(path.join(sourceRoot, pythonRel))) {
    throw new Error(`El paquete descargado no contiene ${pythonRel}. Verifica el asset del release "runtime".`);
  }

  sendRuntimeProgress({ phase: 'install', percent: 92 });
  const targetDir = downloadedRuntimeDir();
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.renameSync(sourceRoot, targetDir);
  ensureRuntimeExecutable(targetDir);
  // Marcador para que Componentes muestre versión instalada y detecte updates.
  try {
    fs.writeFileSync(path.join(targetDir, 'clipdock-runtime.json'), JSON.stringify({
      pythonVersion: RUNTIME_PY_VERSION,
      installedAt: new Date().toISOString(),
      source: runtimeDownloadUrl()
    }, null, 2), 'utf8');
  } catch (_) {}
  try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(zipPath, { force: true }); } catch (_) {}
  sendRuntimeProgress({ phase: 'done', percent: 100 });
}

function createRuntimeDownloadWindow() {
  runtimeWindow = new BrowserWindow({
    width: 640,
    height: 560,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'Preparando ClipDock',
    icon: path.join(appPackageDir(), 'assets', 'clipdock.ico'),
    webPreferences: {
      preload: path.join(appPackageDir(), 'renderer', 'runtime-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  runtimeWindow.loadFile(path.join(appPackageDir(), 'renderer', 'runtime-download.html'), { query: { v: app.getVersion() } }).catch(() => {});
  runtimeWindow.once('ready-to-show', () => { if (runtimeWindow && !runtimeWindow.isDestroyed()) runtimeWindow.show(); });
  runtimeWindow.on('closed', () => { runtimeWindow = null; });
}

function closeRuntimeWindow() {
  if (runtimeWindow && !runtimeWindow.isDestroyed()) runtimeWindow.destroy();
  runtimeWindow = null;
}

ipcMain.handle('engine-dl-info', () => ({
  url: runtimeDownloadUrl(),
  targetDir: downloadedRuntimeDir(),
  pythonVersion: RUNTIME_PY_VERSION
}));
ipcMain.handle('engine-dl-start', async () => {
  try {
    await downloadAndInstallRuntime();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});
ipcMain.handle('engine-dl-continue', () => {
  // Primero abre la splash del arranque y LUEGO cierra esta ventana,
  // para que nunca haya cero ventanas (window-all-closed cerraría la app).
  bootApp();
  setTimeout(() => closeRuntimeWindow(), 400);
  return true;
});
ipcMain.handle('engine-dl-close', () => { app.quit(); return true; });

// --- Python mini como "componente" en Ajustes -> Componentes ---
function downloadedRuntimeVersion() {
  try {
    const marker = JSON.parse(fs.readFileSync(path.join(downloadedRuntimeDir(), 'clipdock-runtime.json'), 'utf8'));
    if (marker.pythonVersion) return String(marker.pythonVersion);
  } catch (_) {}
  try {
    const out = execFileSync(downloadedRuntimePython(), ['--version'], { windowsHide: true, encoding: 'utf8', timeout: 6000 });
    const match = String(out).match(/(\d+\.\d+\.\d+)/);
    if (match) return match[1];
  } catch (_) {}
  return '';
}

function stopBackendAndWait(timeoutMs = 8000) {
  return new Promise(resolve => {
    if (!backend || backend.killed) return resolve(true);
    suppressBackendExitNotice = true;
    const timer = setTimeout(() => resolve(false), timeoutMs);
    backend.once('exit', () => { clearTimeout(timer); setTimeout(() => resolve(true), 400); });
    try { backend.kill(); } catch (_) { clearTimeout(timer); resolve(true); }
  });
}

let runtimeUpdateBusy = false;

ipcMain.handle('engine-runtime-status', () => {
  const runtime = resolvePackagedPython();
  const bundled = runtime?.kind === 'python-portable';
  const installedVersion = runtime
    ? (runtime.kind === 'python-downloaded' ? (downloadedRuntimeVersion() || '') : RUNTIME_PY_VERSION)
    : '';
  return {
    id: 'python-mini',
    installed: Boolean(runtime),
    devMode: !app.isPackaged,
    bundled,
    installedVersion,
    expectedVersion: RUNTIME_PY_VERSION,
    updateAvailable: Boolean(runtime) && Boolean(installedVersion) && installedVersion !== RUNTIME_PY_VERSION,
    path: bundled ? path.dirname(bundledRuntimePython()) : downloadedRuntimeDir(),
    busy: runtimeUpdateBusy
  };
});

ipcMain.handle('engine-runtime-update', async () => {
  if (runtimeUpdateBusy) return { ok: false, error: 'Ya hay una actualización del motor en curso.' };
  runtimeUpdateBusy = true;
  try {
    sendRuntimeProgress({ phase: 'stop', percent: 2 });
    await stopBackendAndWait();
    await downloadAndInstallRuntime();
    sendRuntimeProgress({ phase: 'restart', percent: 100 });
    await startBackend();
    return { ok: true };
  } catch (error) {
    // Intento de rescate: volver a levantar el motor que haya disponible.
    try { await startBackend(); } catch (_) {}
    return { ok: false, error: error.message || String(error) };
  } finally {
    runtimeUpdateBusy = false;
  }
});
// ============== FIN MOTOR DESCARGABLE ==============

let splashWindow = null;

function createSplashWindow() {
  const splashPath = path.join(appPackageDir(), 'renderer', 'splash.html');
  if (!fs.existsSync(splashPath)) return;
  splashWindow = new BrowserWindow({
    // Ventana amplia para que la sombra difusa del rombo (box-shadow de ~90px)
    // quepa entera y no se recorte en un borde recto de la ventana.
    width: 800,
    height: 800,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    title: 'ClipDock',
    icon: path.join(appPackageDir(), 'assets', process.platform === 'win32' ? 'clipdock.ico' : 'clipdock.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  splashWindow.loadFile(splashPath, { query: { v: app.getVersion() } }).catch(() => {});
  splashWindow.once('ready-to-show', () => { if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show(); });
  splashWindow.on('closed', () => { splashWindow = null; });
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
  splashWindow = null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    // Mínimos flexibles: la interfaz es responsiva (barra compacta y columnas
    // apiladas), así que se permite un modo angosto/vertical estilo panel.
    minWidth: 660,
    minHeight: 600,
    backgroundColor: '#090a0d',
    title: 'ClipDock',
    show: false,
    icon: path.join(appPackageDir(), 'assets', process.platform === 'win32' ? 'clipdock.ico' : 'clipdock.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#090a0d', symbolColor: '#9ba0ab', height: 42 },
    webPreferences: {
      preload: path.join(appPackageDir(), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  ensureTray();
  const prefs = readAppPrefs();
  const startHidden = LAUNCHED_HIDDEN && prefs.startMinimized;
  mainWindow.once('ready-to-show', () => {
    closeSplashWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle('ClipDock');
      if (startHidden) {
        // Arranque al iniciar Windows: se queda en la bandeja, sin robar foco.
        mainWindow.setSkipTaskbar(true);
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
  // La X no cierra la app: la oculta en la bandeja (salvo que se pida salir de verdad).
  mainWindow.on('close', event => {
    if (!isQuitting && readAppPrefs().minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
      if (process.platform === 'win32') mainWindow.setSkipTaskbar(true);
      return false;
    }
    return undefined;
  });
  mainWindow.on('show', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setSkipTaskbar(false); });
  mainWindow.webContents.on('page-title-updated', event => {
    // Mantener el tooltip de Windows como ClipDock aunque alguna vista cambie document.title.
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle('ClipDock');
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] proceso terminado', details);
    loadErrorPage('La interfaz se cerró inesperadamente', 'El proceso visual de ClipDock falló. Reinicia la app; si vuelve a pasar, reinstala ClipDock desde el instalador final.', JSON.stringify(details, null, 2));
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    if (code === -3) return;
    loadErrorPage('Falló la carga de la interfaz', description || 'No se pudo abrir la ventana principal.', `${code} · ${url}`);
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  loadRenderer();
}

ipcMain.handle('runtime-info', () => ({ baseUrl: `http://127.0.0.1:${backendPort}`, bridgePort, backendReady, logPath: currentEngineLogPath, runtimeKind: lastBackendLaunch?.runtimeKind || '' }));
ipcMain.handle('open-engine-logs', () => {
  const dir = ensureLogsDir();
  return shell.openPath(dir);
});
ipcMain.handle('engine-diagnostics', () => ({ lastError: lastBackendError, logPath: currentEngineLogPath, logsDir: logsStorageDir(), backendReady, runtimeKind: lastBackendLaunch?.runtimeKind || '' }));
ipcMain.handle('restart-backend', async () => {
  try { if (backend && !backend.killed) { suppressBackendExitNotice = true; backend.kill(); } } catch (_) {}
  await startBackend();
  return { ok: true, baseUrl: `http://127.0.0.1:${backendPort}`, bridgePort, logPath: currentEngineLogPath, runtimeKind: lastBackendLaunch?.runtimeKind || '' };
});
ipcMain.handle('pick-files', async (_event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'], filters });
  return result.canceled ? [] : result.filePaths;
});
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('show-item', (_event, itemPath) => shell.showItemInFolder(itemPath));
ipcMain.handle('open-path', (_event, itemPath) => shell.openPath(itemPath));
ipcMain.handle('open-cookie-extension', (_event, target = 'chrome') => {
  const url = COOKIE_EXTENSION_URLS[target] || COOKIE_EXTENSION_URLS.chrome;
  return shell.openExternal(url);
});
ipcMain.handle('open-external-url', (_event, url) => {
  const cleanUrl = String(url || '').trim();
  if (!/^(https?:\/\/|mailto:)/i.test(cleanUrl)) throw new Error('Solo puedo abrir enlaces http/https o correo mailto.');
  return shell.openExternal(cleanUrl);
});
ipcMain.handle('open-cookies-folder', () => {
  fs.mkdirSync(cookiesStorageDir(), { recursive: true });
  return shell.openPath(cookiesStorageDir());
});
ipcMain.handle('cookie-file-status', (_event, filePath) => summarizeCookieFile(filePath));
ipcMain.handle('import-cookie-file', (_event, filePath) => importCookieFile(filePath));
ipcMain.handle('clipboard-read', () => clipboard.readText());
ipcMain.handle('clipboard-image', () => {
  const image = clipboard.readImage();
  if (image.isEmpty()) return null;
  const folder = path.join(app.getPath('temp'), 'ClipDock');
  fs.mkdirSync(folder, { recursive: true });
  const filePath = path.join(folder, `clipboard_${Date.now()}.png`);
  const buffer = image.toPNG();
  fs.writeFileSync(filePath, buffer);
  return { path: filePath, dataUrl: `data:image/png;base64,${buffer.toString('base64')}` };
});
ipcMain.handle('file-preview', (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const extension = path.extname(filePath).toLowerCase();
  const mime = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml'
  }[extension];
  if (!mime) return null;
  const stat = fs.statSync(filePath);
  if (stat.size > 80 * 1024 * 1024) return null;

  // En produccion no conviene mandar la imagen completa al renderer: muchas previews
  // pasan de 280 KB y la UI las descartaba. Generamos una miniatura estable.
  try {
    const image = nativeImage.createFromPath(filePath);
    if (!image.isEmpty()) {
      const size = image.getSize();
      const maxSide = 1400;
      const scale = Math.min(1, maxSide / Math.max(size.width || maxSide, size.height || maxSide));
      const preview = scale < 1
        ? image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)), quality: 'best' })
        : image;
      return preview.toDataURL();
    }
  } catch (error) {
    console.warn('[preview] no pude generar miniatura nativa:', error.message);
  }

  if (stat.size > 8 * 1024 * 1024) return null;
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
});
ipcMain.handle('media-preview-url', (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const allowed = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.aiff', '.aif']);
  if (!allowed.has(path.extname(filePath).toLowerCase())) return null;
  return pathToFileURL(filePath).toString();
});
ipcMain.handle('app-version', () => ({ version: app.getVersion?.() || readPackageJson().version || '0.0.0' }));
ipcMain.handle('check-updates', () => checkForUpdates());
ipcMain.handle('download-update', (_event, updateInfo) => downloadAndLaunchUpdate(updateInfo?.asset, updateInfo?.latestVersion));
ipcMain.handle('open-updates-folder', () => {
  fs.mkdirSync(updateStorageDir(), { recursive: true });
  return shell.openPath(updateStorageDir());
});

ipcMain.handle('plugins-list', () => listPlugins({ refreshRemote: true }));
ipcMain.handle('plugins-install', (_event, pluginId) => installPlugin(pluginId));
ipcMain.handle('plugins-install-updates', () => installPluginUpdates());
ipcMain.handle('plugins-uninstall', (_event, pluginId) => uninstallPlugin(pluginId));
ipcMain.handle('plugins-open-location', (_event, pluginId) => {
  const plugin = findPlugin(pluginId);
  if (!plugin) throw new Error('Complemento desconocido.');
  const location = pluginInstallLocation(plugin);
  fs.mkdirSync(path.dirname(location), { recursive: true });
  if (fs.existsSync(location)) return shell.openPath(location);
  return shell.openPath(path.dirname(location));
});
ipcMain.handle('plugins-open-root', () => {
  fs.mkdirSync(pluginsStorageDir(), { recursive: true });
  return shell.openPath(pluginsStorageDir());
});
ipcMain.handle('plugins-open-catalog-source', () => {
  const catalog = loadMarketplaceCatalog();
  if (catalog.remoteUrl) return shell.openExternal(catalog.remoteUrl);
  if (catalog.sourcePath && fs.existsSync(catalog.sourcePath)) return shell.showItemInFolder(catalog.sourcePath);
  fs.mkdirSync(pluginsStorageDir(), { recursive: true });
  return shell.openPath(pluginsStorageDir());
});

ipcMain.handle('plugins-set-remote-catalog', async (_event, rawUrl) => {
  const url = normalizePluginRemoteCatalogUrl(rawUrl);
  if (!url) throw new Error('Escribe la URL del catalog.json remoto.');
  writePluginRemoteCatalogConfig({ url, disableDefault: false, updatedAt: new Date().toISOString() });
  await refreshRemotePluginCatalog();
  return listPlugins({ refreshRemote: false });
});

ipcMain.handle('plugins-clear-remote-catalog', async () => {
  try { fs.unlinkSync(pluginRemoteCatalogCachePath()); } catch (_) {}
  writePluginRemoteCatalogConfig({ disableDefault: true, updatedAt: new Date().toISOString() });
  return listPlugins({ refreshRemote: false });
});

// Notificación nativa de Windows al terminar un proceso (descarga, conversión,
// instalación, etc.). Muestra el logo + "ClipDock" + el proceso finalizado, así el
// editor se entera aunque tenga otro programa al frente o ClipDock en la bandeja.
ipcMain.handle('notify', (_event, payload = {}) => {
  try {
    if (!Notification.isSupported()) return false;
    const iconPath = path.join(appPackageDir(), 'assets', 'clipdock.png');
    const notification = new Notification({
      title: String(payload.title || 'ClipDock'),
      body: String(payload.body || ''),
      icon: fs.existsSync(iconPath) ? iconPath : undefined,
      silent: false
    });
    notification.on('click', () => showMainWindow());
    notification.show();
    return true;
  } catch (error) {
    console.error('[notify] no se pudo mostrar', error);
    return false;
  }
});

ipcMain.handle('get-app-prefs', () => readAppPrefs());
ipcMain.handle('set-app-prefs', (_event, partial) => {
  const next = { ...readAppPrefs(), ...(partial || {}) };
  writeAppPrefs(next);
  applyAutoLaunch(next);
  // Si se desactiva la bandeja mientras la ventana está oculta, la mostramos
  // para que el usuario no se quede sin acceso a la app.
  if (partial && partial.minimizeToTray === false && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    showMainWindow();
  }
  return next;
});

async function bootApp() {
  createSplashWindow();
  // Seguridad: si algo se atora, la splash no se queda para siempre.
  setTimeout(() => {
    closeSplashWindow();
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
  }, 30000);
  try {
    await startBackend();
    createWindow();
  } catch (error) {
    console.error('[motor] no pudo iniciar', error);
    const payload = backendErrorPayload(error, { diagnostics: error.clipdockDiagnostics || null });
    appendEngineLog(`[boot-catch] ${payload.message}`);
    createWindow();
    mainWindow.webContents.once('did-finish-load', () => sendBackendErrorToRenderer(payload));
  }
}

app.whenReady().then(async () => {
  if (UNINSTALL_MODE) { await runUninstaller(); return; }
  if (SETUP_MODE) { createInstallerWindow(); return; }
  if (!hasSingleInstanceLock) return;
  // Necesario en Windows para que las notificaciones muestren "ClipDock" y el logo.
  if (process.platform === 'win32') { try { app.setAppUserModelId('com.clipdock.app'); } catch (_) {} }
  // Refleja en el sistema la preferencia de arranque con Windows guardada.
  applyAutoLaunch(readAppPrefs());
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else showMainWindow(); });
  // La extensión de Premiere ya no se instala automáticamente.
  // Ahora se instala desde Complementos -> ClipDock Remote.
  // Primer arranque sin motor: descargarlo antes de iniciar la app.
  if (app.isPackaged && !resolvePackagedPython()) {
    createRuntimeDownloadWindow();
    return; // bootApp() se dispara desde 'engine-dl-continue' cuando termina la descarga.
  }
  await bootApp();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => {
  isQuitting = true;
  suppressBackendExitNotice = true;
  if (backend && !backend.killed) backend.kill();
  try { if (tray && !tray.isDestroyed?.()) { tray.destroy(); tray = null; } } catch (_) {}
});
