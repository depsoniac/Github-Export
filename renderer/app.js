let baseUrl = 'http://127.0.0.1:7790';
const RUNTIME_SETUP_KEY = 'clipdockRuntimeSetupProfile';
const RUNTIME_SETUP_AUDIT_KEY = 'clipdockRuntimeSetupAuditKey';
const WELCOME_TOUR_KEY = 'clipdockWelcomeTourState';
const WELCOME_TOUR_SECTIONS = ['interface', 'automation', 'components', 'models'];
const RUNTIME_SETUP_LABELS = { light: 'Ligero', recommended: 'Recomendado', 'full-ai': 'Completo con IA' };
const ACCENT_COLORS = {
  acid: '#c9ff3d', violet: '#9a88ff', cyan: '#62e6ff', rose: '#ff75b7', orange: '#ffb347', mint: '#6affd1'
};
const ACCENT_CONTRAST_COLORS = {
  acid: '#7f76bd',
  violet: '#9bb65d',
  cyan: '#bf6b93',
  rose: '#55aebd',
  orange: '#8175b8',
  mint: '#bd6b93'
};
let outputDir = localStorage.getItem('outputDir') || '';
let currentAnalysis = null;
let currentImage = null;
let imageSession = [];
let activeImageId = null;
let imageExportFolderName = localStorage.getItem('imageExportFolderName') || '';
let settings = {
  autoPaste: true, autoAnalyze: true, smartRoute: true, autoAdobe: false,
  saveThumbnail: true, playlistAnalysis: true, cookieMode: 'file', cookieFile: '', browser: '', browserProfile: '', interfaceScale: '1', fontScale: '1', titleScale: '1', accentColor: 'acid'
};
let lastClipboardUrl = '';
const adobeSentJobs = new Set(JSON.parse(localStorage.getItem('adobeSentJobs') || '[]'));
const requestedAdobeJobs = new Set();
const jobVisuals = new Map(Object.entries(JSON.parse(localStorage.getItem('jobVisuals') || '{}')));
let componentRefreshTimer = null;
let modelRefreshTimer = null;
let setupRepairPollTimer = null;
let componentWasActive = false;
let modelWasActive = false;
let componentUpdateInfo = {};
let modelUpdateInfo = {};
let downloadSession = [];
let downloadMode = localStorage.getItem('downloadMode') || 'normal';
let ultraItem = null;
let ultraChoice = 'video-audio';
let recodePresets = [];
let universalRecode = { mode: 'off', preset: 'h264_standard', thumbnail: true, subtitles: false, subtitleFormat: localStorage.getItem('subtitleFormat') || 'srt', subtitleLang: localStorage.getItem('subtitleLang') || 'auto', autoAdobe: false, keepOriginal: true };
let recodeDraft = null;
let activeFragmentItemId = null;
let currentAiVideo = null;
let currentVideoDuration = 0;
let currentConvertFiles = [];
let convertExportFolderName = localStorage.getItem('convertExportFolderName') || '';
let assetLibrary = [];
let assetFilter = "all";
let assetFolders = {};
let pendingAssetCapture = null;
const convertPreviewUrls = new Map();
let latestJobs = [];
const notifiedJobs = new Set();
let jobsInitialized = false;
let programsData = { components: [], models: [], plugins: [] };
let programUpdateInfo = { components: {}, models: {} };
let programsRefreshTimer = null;
const PROGRAMS_SIZE_KEY = 'programsTotalSizeBytes';
const FILE_JOB_KINDS = new Set(['download', 'image', 'recode', 'video-upscale']);
let requiredComponentIds = [];
let fontScaleObserver = null;
let fontScaleScheduled = false;
const originalFontStyles = new WeakMap();
const originalFontElements = new Set();
let pendingConfirmResolve = null;
let pluginCatalog = [];
let pluginCatalogMeta = {};
let pluginFilter = 'all';
let startupUpdatePayload = null;
let startupUpdateBusy = false;
let pendingRuntimeSetupProfile = null;
let runtimeSetupPollTimer = null;

const QUICK_PRESET_FORMATS = [
  { id: 'h265', label: 'H.265 · MP4 compacto', kind: 'video', presets: [{ id: 'h265_light', label: 'Liviano' }, { id: 'h265_fast', label: 'Rápido' }, { id: 'h265_standard', label: 'Normal' }, { id: 'h265_max', label: 'Máxima calidad' }] },
  { id: 'h264', label: 'H.264 · MP4 compatible', kind: 'video', presets: [{ id: 'h264_light', label: 'Liviano' }, { id: 'h264_fast', label: 'Rápido' }, { id: 'h264_standard', label: 'Normal' }, { id: 'h264_max', label: 'Máxima calidad' }] },
  { id: 'prores', label: 'Apple ProRes · MOV edición', kind: 'video', presets: [{ id: 'prores_proxy', label: '422 Proxy' }, { id: 'prores_lt', label: '422 LT' }, { id: 'prores_422', label: '422 Normal' }] },
  { id: 'gif', label: 'GIF animado', kind: 'video', presets: [{ id: 'gif_low', label: 'Rápido · 480p' }, { id: 'gif_medium', label: 'Medio · 540p' }, { id: 'gif_high', label: 'Alta calidad · 720p' }, { id: 'gif_1080', label: 'Máxima · 1080p' }] },
  { id: 'mp3', label: 'MP3 · solo audio', kind: 'audio', presets: [{ id: 'mp3_192', label: '192 kbps' }, { id: 'mp3_320', label: '320 kbps' }] },
  { id: 'wav', label: 'WAV · audio sin compresión', kind: 'audio', presets: [{ id: 'wav', label: 'PCM 16-bit' }] }
];


const LOCAL_VIDEO_OUTPUT_FORMATS = {
  h264: {
    label: 'MP4 · H.264', kind: 'video', container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', audioBitrate: '192k', speedEnabled: true,
    profiles: [
      { id: 'light', label: 'Ligero', quality: 28 },
      { id: 'normal', label: 'Equilibrado', quality: 23 },
      { id: 'max', label: 'Máxima calidad', quality: 18 }
    ]
  },
  h265: {
    label: 'MP4 · H.265', kind: 'video', container: 'mp4', videoCodec: 'h265', audioCodec: 'aac', audioBitrate: '192k', speedEnabled: true,
    profiles: [
      { id: 'light', label: 'Ligero', quality: 29 },
      { id: 'normal', label: 'Equilibrado', quality: 24 },
      { id: 'max', label: 'Máxima calidad', quality: 20 }
    ]
  },
  prores: {
    label: 'MOV · ProRes', kind: 'video', container: 'mov', videoCodec: 'prores', audioCodec: 'pcm', audioBitrate: '192k', speedEnabled: false,
    profiles: [
      { id: 'proxy', label: '422 Proxy', proresProfile: 0 },
      { id: 'lt', label: '422 LT', proresProfile: 1 },
      { id: 'normal', label: '422 Normal', proresProfile: 2 }
    ]
  },
  webm: {
    label: 'WebM', kind: 'video', container: 'webm', videoCodec: 'vp9', audioCodec: 'opus', audioBitrate: '160k', speedEnabled: false,
    profiles: [
      { id: 'light', label: 'Ligero VP9', quality: 34 },
      { id: 'normal', label: 'VP9 normal', quality: 30 },
      { id: 'max', label: 'VP9 alta calidad', quality: 24 }
    ]
  },
  gif: {
    label: 'GIF animado', kind: 'gif', container: 'gif', videoCodec: 'none', audioCodec: 'none', speedEnabled: false,
    profiles: [
      { id: '480', label: 'Ligero · 480p 15 fps', height: 480, fps: 15 },
      { id: '720', label: 'Normal · 720p 24 fps', height: 720, fps: 24 },
      { id: '1080', label: 'Máxima · 1080p 24 fps', height: 1080, fps: 24 }
    ]
  },
  mp3: {
    label: 'MP3 · audio', kind: 'audio', container: 'mp3', videoCodec: 'none', audioCodec: 'mp3', speedEnabled: false,
    profiles: [
      { id: '192', label: '192 kbps', audioBitrate: '192k' },
      { id: '320', label: '320 kbps', audioBitrate: '320k' }
    ]
  },
  wav: {
    label: 'WAV · audio', kind: 'audio', container: 'wav', videoCodec: 'none', audioCodec: 'pcm', speedEnabled: false,
    profiles: [
      { id: 'pcm', label: 'PCM 16-bit', audioBitrate: '192k' }
    ]
  }
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const persistSentJobs = () => localStorage.setItem('adobeSentJobs', JSON.stringify([...adobeSentJobs]));
const persistJobVisuals = () => localStorage.setItem('jobVisuals', JSON.stringify(Object.fromEntries(jobVisuals)));

function normalizeUrl(value) {
  const text = String(value || '').trim();
  const starts = [...text.matchAll(/https?:\/\//ig)].map(match => match.index);
  if (!starts.length) return text;
  if (starts.length === 1) return text.slice(starts[0]).split(/\s/)[0];
  const candidates = starts.map((start, index) => text.slice(start, starts[index + 1] ?? text.length).trim()).filter(Boolean);
  return candidates[candidates.length - 1];
}

let lastToastKey = '';
let lastToastAt = 0;
let engineFailureToast = null;
function toast(message, type = 'ok', options = {}) {
  const key = options.key || `${type}:${message}`;
  const now = Date.now();
  if (!options.sticky && key === lastToastKey && now - lastToastAt < 1800) return null;
  if (options.key) {
    const existing = document.querySelector(`.toast[data-toast-key="${CSS.escape(options.key)}"]`);
    if (existing) return existing;
  }
  lastToastKey = key;
  lastToastAt = now;
  const node = document.createElement('div');
  node.className = `toast ${type}${options.sticky ? ' sticky' : ''}${options.actions?.length ? ' actionable' : ''}`;
  if (options.key) node.dataset.toastKey = options.key;
  const titles = { ok: 'Listo', error: 'Algo necesita atención', info: 'Información', progress: 'Trabajo iniciado' };
  const icons = { ok: '✓', error: '!', info: 'i', progress: '↓' };
  const actions = Array.isArray(options.actions) && options.actions.length
    ? `<div class="toast-actions">${options.actions.map((action, index) => `<button type="button" data-toast-action="${index}">${escapeHtml(action.label || 'Abrir')}</button>`).join('')}</div>`
    : '';
  node.innerHTML = `<span class="toast-icon">${icons[type] || icons.ok}</span><div><strong>${escapeHtml(options.title || titles[type] || titles.ok)}</strong><p>${escapeHtml(message)}</p>${actions}</div><button class="toast-close" aria-label="Cerrar">×</button>`;
  node.querySelector('.toast-close').addEventListener('click', event => {
    event.stopPropagation();
    if (options.key === 'engine-failure') engineFailureToast = null;
    node.remove();
  });
  node.querySelectorAll('[data-toast-action]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const action = options.actions?.[Number(button.dataset.toastAction)];
      action?.run?.();
      if (!options.sticky) node.remove();
    });
  });
  if (options.onClick) {
    node.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      options.onClick();
      if (!options.sticky) node.remove();
    });
  }
  $('#toast-stack').append(node);
  if (!options.sticky) setTimeout(() => node.remove(), options.duration || 4200);
  return node;
}

function showEngineFailure(errorInfo) {
  const detail = typeof errorInfo === 'object' && errorInfo ? errorInfo : { message: String(errorInfo || 'El motor interno no respondió') };
  const message = detail.message || 'No pude iniciar el motor interno de ClipDock.';
  engineFailureToast = toast(message, 'error', {
    sticky: true,
    key: 'engine-failure',
    title: 'Motor interno desconectado',
    actions: [
      {
        label: 'Reparar motor',
        run: async () => {
          toast('Reintentando iniciar el motor interno…', 'progress', { key: 'engine-restart' });
          try {
            const runtime = await window.desktop?.restartBackend?.();
            if (runtime?.baseUrl) baseUrl = runtime.baseUrl;
            document.querySelector('.toast[data-toast-key="engine-failure"]')?.remove();
            engineFailureToast = null;
            toast('Motor interno reparado y conectado', 'ok');
            setTimeout(checkHealth, 400);
          } catch (error) {
            toast(error.message || 'No se pudo reparar el motor. Abre los logs para revisar la causa.', 'error', { sticky: true, key: 'engine-repair-failed' });
          }
        }
      },
      {
        label: 'Abrir logs',
        run: () => window.desktop?.openEngineLogs?.()
      }
    ]
  });
}

function confirmAction({ title, message, detail = '', confirmText = 'Continuar', eyebrow = 'CONFIRMAR ACCIÓN', danger = false }) {
  if (pendingConfirmResolve) pendingConfirmResolve(false);
  $('#confirm-eyebrow').textContent = eyebrow;
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-detail').classList.toggle('hidden', !detail);
  $('#confirm-detail p').textContent = detail;
  $('#confirm-accept span').textContent = confirmText;
  $('#confirm-accept').classList.toggle('danger-confirm', danger);
  $('#confirm-symbol').classList.toggle('danger', danger);
  $('#confirm-modal').classList.remove('hidden');
  return new Promise(resolve => { pendingConfirmResolve = resolve; });
}

function finishConfirm(value) {
  $('#confirm-modal').classList.add('hidden');
  const resolve = pendingConfirmResolve;
  pendingConfirmResolve = null;
  resolve?.(value);
}

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Error ${response.status}`);
    error.code = data.code || '';
    error.components = Array.isArray(data.components) ? data.components : [];
    error.action = data.action || '';
    throw error;
  }
  return data;
}

const componentLabels = { deno: 'Deno · motor JavaScript de YouTube', ffmpeg: 'FFmpeg · audio y video', poppler: 'Poppler · documentos', inkscape: 'Inkscape · vectores', ghostscript: 'Ghostscript · EPS/PS' };

function navigateToSettings(sectionName) {
  switchView('settings');
  activateSettingsSection(sectionName);
  setTimeout(() => document.querySelector(`#settings-${sectionName}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
}

function updateToolUpdateBadges(componentCount = null, modelCount = null) {
  const fromInfo = info => Object.values(info || {}).filter(item => item?.updateAvailable).length;
  const counts = {
    components: componentCount ?? fromInfo(componentUpdateInfo),
    models: modelCount ?? fromInfo(modelUpdateInfo)
  };
  const targets = [
    ['#components-update-count', counts.components],
    ['#components-heading-count', counts.components],
    ['#models-update-count', counts.models],
    ['#models-heading-count', counts.models]
  ];
  for (const [selector, count] of targets) {
    const node = $(selector);
    if (!node) continue;
    node.textContent = String(count);
    node.classList.toggle('hidden', count <= 0);
  }
}

function updateIsStillAvailable(item, update) {
  if (!update?.updateAvailable) return false;
  if (item?.installed && update.latestVersion && item.installedVersion && String(item.installedVersion) === String(update.latestVersion)) return false;
  return true;
}

function reconcileUpdateInfo(kind, items) {
  const store = kind === 'components' ? componentUpdateInfo : modelUpdateInfo;
  for (const item of items || []) {
    const update = store[item.id];
    if (update && !updateIsStillAvailable(item, update)) {
      update.updateAvailable = false;
      update.installedVersion = item.installedVersion || update.installedVersion || '';
      update.checked = true;
    }
  }
  updateToolUpdateBadges();
}

function showComponentRequirement(error) {
  if (error?.code !== 'components_required' || !error.components?.length) return false;
  requiredComponentIds = [...new Set(error.components)];
  $('#required-component-message').textContent = error.message;
  $('#required-component-list').innerHTML = requiredComponentIds.map(id => `<li><span>↓</span><div><strong>${escapeHtml(componentLabels[id] || id)}</strong><small>Se instalará en Documentos/ClipDock/Componentes.</small></div></li>`).join('');
  $('#component-required-modal').classList.remove('hidden');
  return true;
}

function openComponentsSettings() {
  $('#component-required-modal').classList.add('hidden');
  switchView('settings');
  activateSettingsSection('components');
  loadComponents();
}

async function installRequiredComponents() {
  const button = $('#required-component-install');
  button.disabled = true;
  button.querySelector('span').textContent = 'Iniciando…';
  try {
    for (const id of requiredComponentIds) await api(`/api/components/${id}/install`, { method: 'POST', body: '{}' });
    toast('Instalación iniciada; ClipDock mostrará el progreso en Componentes');
    openComponentsSettings();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Instalar ahora';
  }
}

// Indicador flotante de navegación: una sola barrita que se DESLIZA entre
// secciones en lugar de aparecer/desaparecer en cada botón.
let navIndicatorEl = null;
function ensureNavIndicator() {
  if (navIndicatorEl && navIndicatorEl.isConnected) return navIndicatorEl;
  const nav = document.querySelector('.sidebar nav');
  if (!nav) return null;
  navIndicatorEl = document.createElement('i');
  navIndicatorEl.className = 'nav-active-indicator';
  nav.appendChild(navIndicatorEl);
  return navIndicatorEl;
}

function moveNavIndicator() {
  const indicator = ensureNavIndicator();
  const nav = document.querySelector('.sidebar nav');
  if (!indicator || !nav) return;
  const active = nav.querySelector('.nav-item.active');
  if (!active) { indicator.style.opacity = '0'; return; }
  indicator.style.opacity = '1';
  indicator.style.top = `${active.offsetTop + 9}px`;
  indicator.style.height = `${Math.max(18, active.offsetHeight - 18)}px`;
}
window.addEventListener('resize', () => requestAnimationFrame(moveNavIndicator));
setTimeout(moveNavIndicator, 80);

function switchView(name) {
  $$('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === name));
  $('#sidebar-version')?.classList.remove('active');
  $('.main-content').scrollTop = 0;
  if (name === 'settings') markWelcomeTourSettingsOpened();
  else updateWelcomeTourHighlights();
  requestAnimationFrame(moveNavIndicator);
  if (name === 'queue') {
    const tab = localStorage.getItem('queueActiveTab') || 'jobs';
    applyQueueTab(tab);
    loadJobs();
    if (tab === 'programs') loadPrograms(true);
  }
  if (name === 'settings') loadSettingsPanels();
  if (name === 'assets') loadAssets();
  if (name === 'plugins') loadPlugins();
}

function activateSettingsSection(sectionName = 'overview') {
  $$('.settings-nav button').forEach(button => button.classList.toggle('active', button.dataset.settingsSection === sectionName));
  $$('.settings-section').forEach(section => section.classList.toggle('active', section.id === `settings-${sectionName}`));
  $('#sidebar-version')?.classList.toggle('active', sectionName === 'updates');
  if (sectionName === 'components') { loadComponents(); loadSetupRepairStatus(); }
  if (sectionName === 'models') loadModels();
  if (sectionName === 'updates') refreshUpdateStatus(true);
  if (sectionName === 'general') loadAppPrefs();
  markWelcomeTourSectionVisited(sectionName);
}

// Preferencias de sistema (bandeja / autoarranque) gestionadas por el proceso principal.
async function loadAppPrefs() {
  if (!window.desktop?.getAppPrefs) return;
  try {
    const prefs = await window.desktop.getAppPrefs();
    const tray = $('#pref-minimize-tray');
    const auto = $('#pref-auto-launch');
    const startMin = $('#pref-start-minimized');
    if (tray) tray.checked = Boolean(prefs.minimizeToTray);
    if (auto) auto.checked = Boolean(prefs.autoLaunch);
    if (startMin) { startMin.checked = Boolean(prefs.startMinimized); startMin.disabled = !prefs.autoLaunch; }
  } catch (_) {}
}

async function saveAppPref(key, value) {
  if (!window.desktop?.setAppPrefs) return;
  try {
    const prefs = await window.desktop.setAppPrefs({ [key]: value });
    const startMin = $('#pref-start-minimized');
    if (startMin && prefs) startMin.disabled = !prefs.autoLaunch;
  } catch (error) { toast(error.message || 'No se pudo guardar la preferencia', 'error'); }
}


function defaultWelcomeTourState() {
  return { active: false, gear: false, pending: [...WELCOME_TOUR_SECTIONS] };
}

function readWelcomeTourState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WELCOME_TOUR_KEY) || '{}');
    const pending = Array.isArray(parsed.pending)
      ? parsed.pending.filter(section => WELCOME_TOUR_SECTIONS.includes(section))
      : [...WELCOME_TOUR_SECTIONS];
    return { active: Boolean(parsed.active), gear: Boolean(parsed.gear), pending };
  } catch (_) {
    return defaultWelcomeTourState();
  }
}

function writeWelcomeTourState(state) {
  localStorage.setItem(WELCOME_TOUR_KEY, JSON.stringify(state));
}

function beginWelcomeTour() {
  writeWelcomeTourState({ active: true, gear: true, pending: [...WELCOME_TOUR_SECTIONS] });
  updateWelcomeTourHighlights();
}

function finishWelcomeTour() {
  writeWelcomeTourState(defaultWelcomeTourState());
  updateWelcomeTourHighlights();
}

function markWelcomeTourSettingsOpened() {
  const state = readWelcomeTourState();
  if (!state.active) return;
  state.gear = false;
  writeWelcomeTourState(state);
  updateWelcomeTourHighlights();
}

function markWelcomeTourSectionVisited(sectionName) {
  const state = readWelcomeTourState();
  if (!state.active || !WELCOME_TOUR_SECTIONS.includes(sectionName)) {
    updateWelcomeTourHighlights();
    return;
  }
  state.pending = state.pending.filter(section => section !== sectionName);
  if (!state.pending.length) {
    finishWelcomeTour();
    return;
  }
  writeWelcomeTourState(state);
  updateWelcomeTourHighlights();
}

function updateWelcomeTourHighlights() {
  const state = readWelcomeTourState();
  const settingsViewActive = $('#view-settings')?.classList.contains('active');
  const gear = $('.settings-button');
  gear?.classList.toggle('welcome-pulse', Boolean(state.active && state.gear && !settingsViewActive));
  $$('.settings-nav [data-settings-section]').forEach(button => {
    const shouldPulse = Boolean(state.active && settingsViewActive && state.pending.includes(button.dataset.settingsSection));
    button.classList.toggle('welcome-pulse', shouldPulse);
  });
}

function setupFloatingDockTooltips() {
  const dockButtons = $$('.dock-action[data-tip]');
  if (!dockButtons.length) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'dock-floating-tip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.innerHTML = '<span></span>';
  document.body.appendChild(tooltip);

  const label = tooltip.querySelector('span');
  let activeTarget = null;
  let hideTimer = null;

  const isSideMode = () => document.body.classList.contains('sidebar-compact')
    || document.body.classList.contains('sidebar-auto-compact')
    || window.innerWidth <= 1050;

  const positionTooltip = () => {
    if (!activeTarget || !label) return;
    const rect = activeTarget.getBoundingClientRect();
    const sideMode = isSideMode();
    const margin = 10;

    tooltip.classList.toggle('side', sideMode);
    tooltip.classList.remove('left', 'below');
    tooltip.style.left = '-9999px';
    tooltip.style.top = '-9999px';
    tooltip.classList.add('measuring');

    const tipRect = tooltip.getBoundingClientRect();
    let left;
    let top;

    if (sideMode) {
      left = rect.right + 12;
      top = rect.top + rect.height / 2 - tipRect.height / 2;
      if (left + tipRect.width > window.innerWidth - margin) {
        left = rect.left - tipRect.width - 12;
        tooltip.classList.add('left');
      }
    } else {
      left = rect.left + rect.width / 2 - tipRect.width / 2;
      top = rect.top - tipRect.height - 12;
      if (top < 50) {
        top = rect.bottom + 12;
        tooltip.classList.add('below');
      }
    }

    left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
    top = Math.max(48, Math.min(top, window.innerHeight - tipRect.height - margin));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.classList.remove('measuring');
  };

  const showTooltip = target => {
    if (!target?.dataset?.tip || !label) return;
    clearTimeout(hideTimer);
    activeTarget = target;
    label.textContent = target.dataset.tip;
    tooltip.classList.add('mounted');
    tooltip.classList.remove('visible');
    positionTooltip();
    requestAnimationFrame(() => tooltip.classList.add('visible'));
  };

  const hideTooltip = () => {
    activeTarget = null;
    tooltip.classList.remove('visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!activeTarget) tooltip.classList.remove('mounted', 'side', 'left', 'below', 'measuring');
    }, 170);
  };

  dockButtons.forEach(button => {
    if (button.getAttribute('title')) {
      button.dataset.nativeTitle = button.getAttribute('title') || '';
      button.removeAttribute('title');
    }
    button.addEventListener('mouseenter', () => showTooltip(button));
    button.addEventListener('focus', () => showTooltip(button));
    button.addEventListener('mouseleave', hideTooltip);
    button.addEventListener('blur', hideTooltip);
  });

  window.addEventListener('resize', positionTooltip);
  document.querySelector('.main-content')?.addEventListener('scroll', positionTooltip, { passive: true });
}

function markRuntimeSetupChoice(profile, label) {
  if (!profile) return;
  localStorage.setItem(RUNTIME_SETUP_KEY, profile);
  localStorage.setItem('clipdockRuntimeSetupLabel', label || RUNTIME_SETUP_LABELS[profile] || 'Recomendado');
  if (!localStorage.getItem('clipdockRuntimeSetupDate')) localStorage.setItem('clipdockRuntimeSetupDate', new Date().toISOString());
}

async function chooseOutput() {
  const folder = await window.desktop?.pickFolder();
  if (!folder) return;
  outputDir = folder;
  localStorage.setItem('outputDir', folder);
  settings.outputDir = folder;
  saveSettings({ outputDir: folder });
  if ($('#output-folder')) {
    $('#output-folder').textContent = folder;
    $('#change-folder')?.setAttribute('title', `Salida: ${folder}`);
  }
  $('#settings-output-folder').textContent = folder;
  if ($('#download-hint')) $('#download-hint').textContent = 'Añadir a la cola';
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const min = Math.floor(seconds / 60);
  return `${min}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function formatClock(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return [hours, minutes, secs].map(part => String(part).padStart(2, '0')).join(':');
}

function parseClock(value) {
  const parts = String(value || '').trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}


const SUBTITLE_FORMATS = ['srt', 'json3', 'srv1', 'srv2', 'srv3', 'ttml', 'vtt'];
const SUBTITLE_LANGUAGE_FALLBACKS = {
  es: 'Español', en: 'Inglés', pt: 'Portugués', fr: 'Francés', de: 'Alemán', it: 'Italiano',
  ja: 'Japonés', ko: 'Coreano', zh: 'Chino', ru: 'Ruso', ar: 'Árabe', hi: 'Hindi'
};

function subtitleDisplayName(code) {
  const clean = String(code || '').replace(/^[a-z]+:/i, '').trim();
  const base = clean.split('-')[0].split('_')[0].split('.')[0].toLowerCase();
  if (SUBTITLE_LANGUAGE_FALLBACKS[base]) return SUBTITLE_LANGUAGE_FALLBACKS[base];
  try {
    const display = new Intl.DisplayNames(['es'], { type: 'language' }).of(base);
    if (display && display !== base) return display.charAt(0).toUpperCase() + display.slice(1);
  } catch (_) { /* Intl may be unavailable in older runtimes */ }
  return clean.toUpperCase();
}

function subtitleEntriesToFormats(entries) {
  if (!Array.isArray(entries)) return [];
  return [...new Set(entries.map(entry => String(entry?.ext || '').toLowerCase()).filter(Boolean))];
}

function availableSubtitleLanguages(info) {
  const map = new Map();
  const sources = [
    ['subtitles', 'Manual'],
    ['automatic_captions', 'Automático']
  ];
  for (const [key, sourceLabel] of sources) {
    const group = info?.[key];
    if (!group || typeof group !== 'object') continue;
    for (const [code, entries] of Object.entries(group)) {
      if (!code || code === 'live_chat') continue;
      const existing = map.get(code) || { code, sources: new Set(), formats: new Set() };
      existing.sources.add(sourceLabel);
      subtitleEntriesToFormats(entries).forEach(format => existing.formats.add(format));
      map.set(code, existing);
    }
  }
  return [...map.values()].map(item => ({
    code: item.code,
    label: subtitleDisplayName(item.code),
    source: [...item.sources].join(' + '),
    formats: [...item.formats]
  })).sort((a, b) => {
    const priority = code => {
      const base = String(code || '').split('-')[0].toLowerCase();
      if (base === 'es') return 0;
      if (base === 'en') return 1;
      return 2;
    };
    return priority(a.code) - priority(b.code) || a.label.localeCompare(b.label, 'es');
  });
}

function mergedSubtitleLanguages(items = []) {
  const map = new Map();
  for (const item of items) {
    for (const lang of availableSubtitleLanguages(item?.info || item)) {
      const existing = map.get(lang.code) || { code: lang.code, label: lang.label, sources: new Set(), formats: new Set() };
      String(lang.source || '').split(' + ').filter(Boolean).forEach(source => existing.sources.add(source));
      (lang.formats || []).forEach(format => existing.formats.add(format));
      map.set(lang.code, existing);
    }
  }
  return [...map.values()].map(item => ({ code: item.code, label: item.label, source: [...item.sources].join(' + '), formats: [...item.formats] }));
}

function preferredSubtitleLang(info) {
  const languages = availableSubtitleLanguages(info);
  return languages.find(lang => /^es($|-|_)/i.test(lang.code))?.code
    || languages.find(lang => /^en($|-|_)/i.test(lang.code))?.code
    || languages[0]?.code
    || 'auto';
}

function subtitleLangsForItem(item) {
  const selected = item?.subtitleLang || universalRecode.subtitleLang || 'auto';
  if (selected === 'all') return ['all'];
  if (selected && selected !== 'auto') return [selected];
  const preferred = preferredSubtitleLang(item?.info);
  if (preferred && preferred !== 'auto') return [preferred];
  return ['es.*', 'es', 'en.*', 'en'];
}

function subtitleLanguagesForScope(scope = 'session', itemId = '') {
  if (scope === 'item') {
    const item = downloadSession.find(entry => entry.id === itemId);
    return availableSubtitleLanguages(item?.info);
  }
  if (downloadSession.length) return mergedSubtitleLanguages(downloadSession);
  return availableSubtitleLanguages(currentAnalysis);
}

function updateSubtitleSummary() {
  const summary = $('#subtitle-summary');
  if (!summary) return;
  if (!$('#extra-subtitles')?.checked) {
    summary.textContent = 'Apagado · no se descargarán subtítulos.';
    return;
  }
  const lang = $('#extra-subtitle-lang');
  const format = $('#extra-subtitle-format');
  const langLabel = lang?.selectedOptions?.[0]?.textContent || 'Idioma automático';
  const fmt = format?.value ? `.${format.value}` : '.srt';
  summary.textContent = `${langLabel} · ${fmt}`;
}

function updateSubtitleOptionsUI() {
  const enabled = Boolean($('#extra-subtitles')?.checked);
  const options = $('#subtitle-options');
  options?.classList.toggle('active', enabled);
  ['extra-subtitle-lang', 'extra-subtitle-format'].forEach(id => { const node = $(`#${id}`); if (node) node.disabled = !enabled; });
  updateSubtitleSummary();
}

function populateUniversalSubtitleControls(scope = 'session', itemId = '') {
  const languageSelect = $('#extra-subtitle-lang');
  const formatSelect = $('#extra-subtitle-format');
  if (!languageSelect || !formatSelect) return;
  const languages = subtitleLanguagesForScope(scope, itemId);
  const preferred = recodeDraft?.subtitleLang || localStorage.getItem('subtitleLang') || 'auto';
  const options = [];
  if (languages.length > 1) options.push({ value: 'all', label: `Todos los disponibles (${languages.length})` });
  for (const lang of languages) options.push({ value: lang.code, label: `${lang.label}${lang.source ? ` · ${lang.source}` : ''}` });
  if (!options.length) options.push({ value: 'auto', label: 'Auto · Español / Inglés' });
  languageSelect.innerHTML = options.map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('');
  const availableValues = options.map(option => option.value);
  const fallback = availableValues.includes(preferred) ? preferred : (availableValues.find(value => /^es($|-|_)/i.test(value)) || availableValues.find(value => /^en($|-|_)/i.test(value)) || availableValues[0] || 'auto');
  languageSelect.value = fallback;
  if (recodeDraft) recodeDraft.subtitleLang = fallback;
  const format = (recodeDraft?.subtitleFormat || localStorage.getItem('subtitleFormat') || 'srt').toLowerCase();
  formatSelect.value = SUBTITLE_FORMATS.includes(format) ? format : 'srt';
  updateSubtitleOptionsUI();
}

function analysisFacts(info) {
  const video = (info.formats || []).filter(format => format.vcodec && format.vcodec !== 'none').sort((a, b) => (b.height || 0) - (a.height || 0))[0] || {};
  const audio = (info.formats || []).find(format => format.acodec && format.acodec !== 'none') || {};
  const date = String(info.upload_date || '');
  const published = date.length === 8 ? `${date.slice(6, 8)}/${date.slice(4, 6)}/${date.slice(0, 4)}` : 'No indicado';
  const size = video.filesize || video.filesize_approx || info.filesize || info.filesize_approx;
  return [
    ['Duración', formatDuration(info.duration) || 'Directo'],
    ['Resolución', video.height ? `${video.width || '?'} × ${video.height}` : 'Adaptativa'],
    ['Video', String(video.vcodec || 'Automático').split('.')[0]],
    ['Audio', String(audio.acodec || 'Automático').split('.')[0]],
    ['FPS', video.fps ? `${Math.round(video.fps)} fps` : 'Original'],
    ['Contenedor', String(video.ext || info.ext || 'Auto').toUpperCase()],
    ['Publicado', published],
    ['Tamaño aprox.', size ? `${(size / 1048576).toFixed(1)} MB` : 'Por calcular']
  ];
}

function renderAnalysis(info) {
  currentAnalysis = info;
  $('#auth-help').classList.add('hidden');
  $('#analysis-card').classList.remove('hidden');
  $('#download-empty').classList.add('hidden');
  $('#media-title').textContent = info.title || 'Contenido sin título';
  $('#media-source').textContent = (info.extractor_key || info.extractor || 'VIDEO').toUpperCase();
  $('#media-meta').textContent = [info.uploader, formatDuration(info.duration)].filter(Boolean).join('  ·  ');
  if (info.thumbnail) $('#media-preview').style.backgroundImage = `linear-gradient(#0002,#0005),url("${info.thumbnail}")`;
  $('#technical-grid').innerHTML = analysisFacts(info).map(([label, value]) => `<div class="technical-fact"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  addAnalysisToSession(info, normalizeUrl($('#url-input').value));
  populateUltraPanel(info, normalizeUrl($('#url-input').value));
}

// ===== Modo ultra fácil =====
// Interfaz a prueba de todo: analizar y elegir MP4 (video+audio), MP3 (solo audio)
// o solo video (mp4 sin sonido), recorte opcional, y descargar en máxima calidad.
// ClipDock elige siempre la mejor fuente y convierte al formato correcto.
function applyDownloadMode(mode) {
  downloadMode = mode === 'ultra' ? 'ultra' : 'normal';
  localStorage.setItem('downloadMode', downloadMode);
  $$('#download-mode-switch .mode-option').forEach(button => {
    const on = button.dataset.downloadMode === downloadMode;
    button.classList.toggle('active', on);
    button.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $('#view-download')?.classList.toggle('ultra-active', downloadMode === 'ultra');
}

function ultraDurationOf(item) {
  return Math.max(1, Math.floor(Number(item?.info?.duration || 0)));
}

function populateUltraPanel(info, url) {
  const item = downloadSession.find(entry => entry.url === url) || downloadSession[downloadSession.length - 1];
  if (!item) return;
  ultraItem = item;
  ultraChoice = 'video-audio';
  $$('#ultra-choices .ultra-choice').forEach(button => button.classList.toggle('active', button.dataset.ultraChoice === 'video-audio'));
  const thumb = $('#ultra-thumb');
  if (thumb) thumb.style.backgroundImage = info.thumbnail ? `linear-gradient(#0002,#0004),url("${info.thumbnail}")` : '';
  if ($('#ultra-title')) $('#ultra-title').textContent = info.title || 'Contenido sin título';
  if ($('#ultra-meta')) $('#ultra-meta').textContent = [info.uploader, formatDuration(info.duration)].filter(Boolean).join('  ·  ');
  const duration = ultraDurationOf(item);
  const startRange = $('#ultra-trim-start-range');
  const endRange = $('#ultra-trim-end-range');
  if (startRange && endRange) {
    startRange.max = duration; endRange.max = duration;
    startRange.value = 0; endRange.value = duration;
  }
  ultraSyncTrim();
  $('#ultra-panel')?.classList.remove('hidden');
}

function ultraSyncTrim() {
  const startRange = $('#ultra-trim-start-range');
  const endRange = $('#ultra-trim-end-range');
  if (!startRange || !endRange) return;
  let start = Math.min(Number(startRange.value), Number(endRange.value) - 1);
  let end = Math.max(Number(endRange.value), start + 1);
  startRange.value = start; endRange.value = end;
  const max = Math.max(1, Number(endRange.max));
  const selection = $('#ultra-trim-selection');
  if (selection) { selection.style.left = `${start / max * 100}%`; selection.style.width = `${(end - start) / max * 100}%`; }
  if ($('#ultra-start')) $('#ultra-start').value = formatClock(start);
  if ($('#ultra-end')) $('#ultra-end').value = formatClock(end);
}

function ultraResetTrim() {
  if (!ultraItem) return;
  const duration = ultraDurationOf(ultraItem);
  const startRange = $('#ultra-trim-start-range');
  const endRange = $('#ultra-trim-end-range');
  if (startRange && endRange) { startRange.value = 0; endRange.value = duration; }
  ultraSyncTrim();
}

async function ultraDownload() {
  if (!ultraItem) return toast('Analiza primero un enlace', 'error');
  if (!outputDir) await chooseOutput();
  if (!outputDir) return;
  const duration = ultraDurationOf(ultraItem);
  const start = Math.max(0, Math.min(parseClock($('#ultra-start')?.value || '00:00:00'), duration - 1));
  const end = Math.max(start + 1, Math.min(parseClock($('#ultra-end')?.value || formatClock(duration)), duration));
  const trimmed = start > 0 || end < duration;
  // Siempre máxima calidad de origen; salida siempre MP4 (video) o MP3 (audio).
  ultraItem.content = ultraChoice;
  ultraItem.quality = 'bv*+ba/b';
  ultraItem.saveThumbnail = false;
  ultraItem.subtitles = false;
  ultraItem.fragment = { enabled: trimmed, start, end };
  ultraItem.recode = ultraChoice === 'audio'
    ? { mode: 'quick', preset: 'mp3_320', keepOriginal: false, thumbnail: false }
    : { mode: 'quick', preset: 'h264_standard', keepOriginal: false, thumbnail: false };
  const job = await startSessionDownload(ultraItem);
  if (job) {
    toast('Descarga añadida a la cola en máxima calidad');
    switchView('queue');
  }
}

function isYoutubeAuthError(message) {
  return /not a bot|sign in to confirm|cookies-from-browser|authentication|youtube rechaz|cookies\.txt|confirmar tu sesi[oó]n/i.test(String(message || ''));
}

function friendlyJobMessage(message) {
  const clean = String(message || 'Preparando').replace(/^ERROR:\s*/i, '');
  if (isYoutubeAuthError(clean)) return clean.slice(0, 360);
  return clean.slice(0, 280);
}

const IMAGE_RESULT_EXTENSIONS = new Set(['png','jpg','jpeg','jfif','webp','avif','tif','tiff','bmp','gif','svg','pdf','psd','psb','heic','heif','exr']);
const VIDEO_RESULT_EXTENSIONS = new Set(['mp4','mov','mkv','webm','avi','m4v','mpg','mpeg','mxf','mts','m2ts','3gp']);
const AUDIO_RESULT_EXTENSIONS = new Set(['mp3','wav','flac','m4a','aac','ogg','aiff','aif']);
function fileExtension(value) {
  return String(value || '').split(/[?#]/)[0].split('.').pop().toLowerCase();
}
function getResultMediaKind(filePath) {
  const ext = fileExtension(filePath);
  if (IMAGE_RESULT_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_RESULT_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_RESULT_EXTENSIONS.has(ext)) return 'audio';
  return 'unknown';
}
function queueAiButtonForJob(job, completed) {
  if (!completed) return '';
  const kind = getResultMediaKind(job.result);
  if (kind === 'image') return `<button class="queue-use-ai-button" data-use-job-ai="${escapeHtml(job.id)}" title="Mandar esta imagen a Mejorar con IA">Usar IA</button>`;
  if (kind === 'video' || kind === 'audio') return `<button class="queue-use-ai-button video" data-use-job-ai="${escapeHtml(job.id)}" title="Mandar este archivo al taller de video con IA lista">Usar IA</button>`;
  return `<button class="queue-use-ai-button" data-use-job-ai="${escapeHtml(job.id)}" title="Intentar abrir este resultado en la herramienta adecuada">Usar</button>`;
}
async function useJobResultForAI(jobId) {
  try {
    const job = latestJobs.find(item => item.id === jobId);
    if (!job || job.state !== 'completed' || typeof job.result !== 'string' || !job.result) return toast('Ese trabajo todavía no tiene archivo terminado', 'error');
    const filePath = normalizeIncomingFilePath(job.result);
    const kind = getResultMediaKind(filePath);
    if (kind === 'image') {
      await setCurrentImage(filePath);
      switchView('enhance');
      showAiTool('upscale');
      toast('Resultado enviado a Mejorar con IA');
      return;
    }
    if (kind === 'video' || kind === 'audio') {
      await setAiVideo(filePath);
      const aiToggle = $('#video-ai-enabled');
      if (aiToggle && kind === 'video') aiToggle.checked = true;
      if (aiToggle) aiToggle.closest('.ai-video-section')?.classList.toggle('disabled', !aiToggle.checked);
      switchView('convert');
      toast(kind === 'video' ? 'Resultado listo para mejorar en video IA' : 'Audio enviado al taller');
      return;
    }
    await routeFiles([filePath], 'Cola');
  } catch (error) {
    toast(error.message || 'No se pudo abrir el resultado en las herramientas IA', 'error');
  }
}

async function analyze() {
  const url = normalizeUrl($('#url-input').value);
  $('#url-input').value = url;
  if (!url) return toast('Pega primero un enlace', 'error');
  const button = $('#analyze-button');
  button.classList.add('loading');
  button.querySelector('span').textContent = 'Analizando…';
  try { renderAnalysis(await api('/api/analyze', { method: 'POST', body: JSON.stringify({ url }) })); }
  catch (error) {
    if (showComponentRequirement(error)) {
      $('#auth-help').classList.add('hidden');
    } else if (isYoutubeAuthError(error.message)) {
      $('#auth-help').classList.remove('hidden');
      const authText = $('#auth-help p');
      if (authText) authText.textContent = String(error.message || 'YouTube pidió confirmar tu sesión.').slice(0, 360);
      toast(String(error.message || 'YouTube pidió confirmar tu sesión.').slice(0, 360), 'error');
    } else toast(error.message, 'error');
  }
  finally { button.classList.remove('loading'); button.querySelector('span').textContent = 'Analizar enlace'; }
}

async function startSessionDownload(item) {
  const recipe = item.recode || universalRecode;
  const content = item.content || 'video-audio';
  const selector = content === 'audio' ? 'ba/b' : content === 'video' ? 'bv*' : (item.quality || 'bv*+ba/b');
  let job;
  try {
    job = await api('/api/jobs/download', { method: 'POST', body: JSON.stringify({
      url: item.url, outputDir, formatSelector: selector, title: item.title, sourceThumbnail: item.thumbnail,
      thumbnail: item.saveThumbnail ?? recipe.thumbnail ?? true,
      ignoreCookies: false,
      subtitles: item.subtitles ? subtitleLangsForItem(item) : [],
      subtitleFormat: item.subtitleFormat || universalRecode.subtitleFormat || localStorage.getItem('subtitleFormat') || 'srt',
      fragment: item.fragment?.enabled ? item.fragment : null,
      requestId: item.requestId || '',
      source: item.remoteSource || '',
      addToTimeline: Boolean(item.autoAdobe),
      autoInstallComponents: true,
      recode: recipe.mode === 'off' ? { mode: 'off' } : recipe
    }) });
  } catch (error) {
    if (!showComponentRequirement(error)) toast(error.message, 'error');
    return null;
  }
  item.jobId = job.id;
  item.result = null;
  jobVisuals.set(job.id, { title: item.title, thumbnail: item.thumbnail, sessionId: item.id, kind: 'download' });
  persistJobVisuals();
  if (recipe.autoAdobe) requestedAdobeJobs.add(job.id);
  renderDownloadSession();
  return job;
}

function jobKind(job) {
  return (jobVisuals.get(job.id) || job.context || {}).kind || '';
}
// Un "trabajo de archivo" es una descarga o un proceso multimedia (imagen, video,
// recodificación). Las instalaciones de componentes/modelos NO cuentan aquí: esas
// viven en la pestaña Programas.
function isFileJob(job) {
  const kind = jobKind(job);
  if (FILE_JOB_KINDS.has(kind)) return true;
  if (String(kind).startsWith('asset-')) return true;
  const phase = job.progress?.phase || '';
  if (phase === 'component' || phase === 'model') return false;
  const data = job.progress?.data || {};
  if (data.componentId || data.modelId) return false;
  return Boolean(job.result);
}
async function openJobFolder(jobId) {
  const job = latestJobs.find(item => item.id === jobId);
  if (!job || typeof job.result !== 'string' || !job.result) return toast('Todavía no hay archivo para mostrar', 'error');
  try { await window.desktop?.showItem(normalizeIncomingFilePath(job.result)); }
  catch (error) { toast(error.message || 'No se pudo abrir la carpeta', 'error'); }
}

// ===== Pestaña "Programas" dentro de Cola de trabajos =====
// Centraliza TODO lo descargado (componentes del sistema, modelos de IA y
// complementos de la tienda). Persiste porque se lee del disco vía /api/components,
// /api/models y listPlugins. El peso total se cachea en localStorage para mostrarse
// al instante al entrar, y se recalcula/actualiza en segundo plano.
function programItemSize(item, type) {
  return type === 'plugin' ? Number(item.installedSize || 0) : Number(item.size || 0);
}
function programsTotalBytes(data) {
  let total = 0;
  for (const c of data.components) if (c.installed) total += programItemSize(c, 'component');
  for (const m of data.models) if (m.installed) total += programItemSize(m, 'model');
  for (const p of data.plugins) if (p.installed) total += programItemSize(p, 'plugin');
  return total;
}
function programGroup(title, rows) {
  return `<div class="program-group"><div class="program-group-head">${escapeHtml(title)}<b>${rows.length}</b></div>${rows.join('')}</div>`;
}
function programRow(item, type) {
  const active = item.job && ['queued', 'running'].includes(item.job.state);
  const progress = Math.round(item.job?.progress?.percent || 0);
  const size = programItemSize(item, type);
  const version = type === 'plugin' ? (item.installedVersion || item.version || '') : (item.installedVersion || '');
  const path = item.path || '';
  const name = item.name || item.id;
  const desc = active
    ? (item.job.progress?.message || 'Instalando…')
    : (type === 'plugin' ? (item.description || item.summary || '') : (item.description || ''));
  const icon = type === 'component' ? '◈' : type === 'model' ? '✦' : '❖';
  const sizeTag = size ? `<span class="program-size">${formatBytes(size)}</span>` : '';
  const folderBtn = (!active && path) ? `<button class="program-folder-button" data-program-folder="${escapeHtml(path)}" title="Abrir ubicación" aria-label="Abrir ubicación"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h5l1.7 2H20a1 1 0 0 1 1 1v7.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8.5a2 2 0 0 1 2-2Z"/></svg></button>` : '';
  const updateAvailable = !active && programUpdateAvailable(item, type);
  const updateBtn = updateAvailable ? `<button class="primary-mini update-mini" data-program-update="${escapeHtml(item.id)}" data-program-type="${type}">Actualizar</button>` : '';
  const removeBtn = active
    ? `<span class="row-status">${progress}%</span>`
    : (item.installed ? `<button class="danger-mini" data-program-uninstall="${escapeHtml(item.id)}" data-program-type="${type}">Desinstalar</button>` : '');
  const cleanVersion = String(version).replace(/^v/i, '');
  return `<article class="program-row ${active ? 'installing' : ''}${updateAvailable ? ' has-update' : ''}" data-program-id="${escapeHtml(item.id)}">
    <div class="program-icon type-${type}">${icon}</div>
    <div class="program-meta"><strong>${escapeHtml(name)}${cleanVersion ? ` <span class="program-version">v${escapeHtml(cleanVersion)}</span>` : ''}${updateAvailable ? '<span class="program-update-pill">UPDATE</span>' : ''}</strong><p>${escapeHtml(desc)}</p>${active ? `<div class="inline-progress"><i style="width:${progress}%"></i></div>` : ''}</div>
    <div class="program-actions">${sizeTag}${updateBtn}${folderBtn}${removeBtn}</div>
  </article>`;
}
function programUpdateAvailable(item, type) {
  if (!item.installed) return false;
  if (type === 'plugin') return Boolean(item.updateAvailable);
  const info = (type === 'component' ? programUpdateInfo.components : programUpdateInfo.models)[item.id];
  return Boolean(info && info.updateAvailable);
}
function renderPrograms() {
  const list = $('#programs-list');
  if (!list) return;
  const isActive = item => item.installed || (item.job && ['queued', 'running'].includes(item.job.state));
  const comps = programsData.components.filter(isActive);
  const mods = programsData.models.filter(isActive);
  const plugs = programsData.plugins.filter(p => p.installed);
  const count = comps.length + mods.length + plugs.length;
  const tabCount = $('#programs-tab-count');
  if (tabCount) tabCount.textContent = count;
  if (!count) {
    list.innerHTML = '<div class="empty-list"><span>▤</span><h3>Aún no hay nada instalado</h3><p>Los componentes, modelos de IA y complementos que instales aparecerán aquí.</p></div>';
    return;
  }
  const sections = [];
  if (comps.length) sections.push(programGroup('Componentes del sistema', comps.map(i => programRow(i, 'component'))));
  if (mods.length) sections.push(programGroup('Modelos de IA', mods.map(i => programRow(i, 'model'))));
  if (plugs.length) sections.push(programGroup('Complementos de la tienda', plugs.map(p => programRow(p, 'plugin'))));
  list.innerHTML = sections.join('');
}
async function loadPrograms(checkUpdates = false) {
  const totalEl = $('#programs-total-size');
  const cached = Number(localStorage.getItem(PROGRAMS_SIZE_KEY) || 0);
  if (totalEl && cached > 0 && (totalEl.textContent === '—' || totalEl.textContent === 'Sin datos')) {
    totalEl.textContent = formatBytes(cached);
  }
  const list = $('#programs-list');
  try {
    const [components, models, pluginData] = await Promise.all([
      api('/api/components').catch(() => []),
      api('/api/models').catch(() => []),
      (window.desktop?.listPlugins ? window.desktop.listPlugins().catch(() => ({ plugins: [] })) : Promise.resolve({ plugins: [] }))
    ]);
    programsData = {
      components: Array.isArray(components) ? components : [],
      models: Array.isArray(models) ? models : [],
      plugins: Array.isArray(pluginData?.plugins) ? pluginData.plugins : []
    };
    renderPrograms();
    const total = programsTotalBytes(programsData);
    if (totalEl) totalEl.textContent = total > 0 ? formatBytes(total) : 'Sin datos';
    localStorage.setItem(PROGRAMS_SIZE_KEY, String(total));
    const installing = [...programsData.components, ...programsData.models].some(i => i.job && ['queued', 'running'].includes(i.job.state));
    clearTimeout(programsRefreshTimer);
    const programsVisible = $('#view-queue')?.classList.contains('active') && $('#queue-pane-programs')?.classList.contains('active');
    if (installing && programsVisible) programsRefreshTimer = setTimeout(() => loadPrograms(false), 1000);
    if (checkUpdates) refreshProgramUpdates();
  } catch (error) {
    if (list) list.innerHTML = `<div class="settings-loading">${escapeHtml(error.message || 'No se pudieron cargar los programas')}</div>`;
  }
}
// Consulta si hay versiones nuevas de componentes y modelos (los plugins ya lo
// traen en listPlugins). Se hace aparte para no consultar la red en cada refresco.
async function refreshProgramUpdates() {
  try {
    const [compUpd, modelUpd] = await Promise.all([
      api('/api/components/updates').catch(() => ({ updates: [] })),
      api('/api/models/updates').catch(() => ({ updates: [] }))
    ]);
    programUpdateInfo.components = Object.fromEntries((compUpd.updates || []).map(u => [u.id, u]));
    programUpdateInfo.models = Object.fromEntries((modelUpd.updates || []).map(u => [u.id, u]));
    renderPrograms();
  } catch (_) { /* sin conexión: se mantiene lo que haya */ }
}
async function updateProgram(id, type) {
  const collection = type === 'component' ? programsData.components : type === 'model' ? programsData.models : programsData.plugins;
  const item = collection.find(entry => entry.id === id);
  const name = item?.name || id;
  try {
    if (type === 'component') await api(`/api/components/${id}/install`, { method: 'POST', body: '{}' });
    else if (type === 'model') await api(`/api/models/${id}/download`, { method: 'POST', body: '{}' });
    else await window.desktop?.installPlugin?.(id);
    toast(`Actualizando ${name}…`, 'progress');
    await loadPrograms();
  } catch (error) { toast(error.message || 'No se pudo actualizar', 'error'); }
}
async function uninstallProgram(id, type) {
  const collection = type === 'component' ? programsData.components : type === 'model' ? programsData.models : programsData.plugins;
  const item = collection.find(entry => entry.id === id);
  const name = item?.name || id;
  const message = type === 'plugin'
    ? 'Se quitarán los archivos del complemento instalado, pero ClipDock y tus configuraciones se quedan intactos.'
    : type === 'model'
      ? 'Se borrará el modelo de IA descargado en tu disco.'
      : 'Se borrará el componente descargado en tu disco.';
  if (!await confirmAction({
    title: `¿Desinstalar ${name}?`,
    message,
    detail: 'Puedes volver a instalarlo cuando quieras.',
    confirmText: 'Desinstalar',
    eyebrow: 'PROGRAMAS',
    danger: true
  })) return;
  try {
    if (type === 'component') await api(`/api/components/${id}/delete`, { method: 'POST', body: '{}' });
    else if (type === 'model') await api(`/api/models/${id}/delete`, { method: 'POST', body: '{}' });
    else await window.desktop?.uninstallPlugin?.(id);
    toast(`${name} desinstalado`);
    await loadPrograms();
  } catch (error) { toast(error.message || 'No se pudo desinstalar', 'error'); }
}
function applyQueueTab(name) {
  const tab = name === 'programs' ? 'programs' : 'jobs';
  $$('.queue-tab').forEach(button => {
    const on = button.dataset.queueTab === tab;
    button.classList.toggle('active', on);
    button.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $('#queue-pane-jobs')?.classList.toggle('active', tab === 'jobs');
  $('#queue-pane-programs')?.classList.toggle('active', tab === 'programs');
  $('#view-queue')?.classList.toggle('programs-active', tab === 'programs');
  localStorage.setItem('queueActiveTab', tab);
}
function switchQueueTab(name) {
  applyQueueTab(name);
  if (name === 'programs') loadPrograms(true);
  else loadJobs();
}

function processLabelForJob(job) {
  const kind = jobKind(job);
  const phase = job.progress?.phase || '';
  const data = job.progress?.data || {};
  if (kind === 'download') return 'Descarga';
  if (kind === 'recode') return 'Conversión';
  if (kind === 'image') return 'Imagen';
  if (kind === 'video-upscale' || phase === 'video_upscale') return 'Mejora con IA';
  if (phase === 'component' || data.componentId) return 'Componente';
  if (phase === 'model' || data.modelId) return 'Modelo de IA';
  return 'Proceso';
}
// Notificación nativa cuando un trabajo pasa a terminado o con error, para que el
// editor lo sepa aunque esté en otro programa o con ClipDock en la bandeja.
function notifyJobDone(job) {
  if (!window.desktop?.notify) return;
  const visual = jobVisuals.get(job.id) || job.context || {};
  const label = processLabelForJob(job);
  const name = visual.title || 'Trabajo multimedia';
  const ok = job.state === 'completed';
  window.desktop.notify({
    title: ok ? `${label} completada` : `${label} con error`,
    body: (ok ? '✓ ' : '⚠ ') + String(name).slice(0, 120)
  });
}
function checkJobNotifications(jobs) {
  for (const job of jobs) {
    if (job.state === 'completed' || job.state === 'failed') {
      if (!jobsInitialized) { notifiedJobs.add(job.id); continue; }
      if (!notifiedJobs.has(job.id)) { notifiedJobs.add(job.id); notifyJobDone(job); }
    }
  }
  jobsInitialized = true;
}

async function loadJobs() {
  try {
    const jobs = await api('/api/jobs');
    latestJobs = jobs;
    checkJobNotifications(jobs);
    const activeJobs = jobs.filter(job => ['queued', 'running'].includes(job.state));
    const pendingJobs = jobs.filter(job => ['queued', 'running', 'paused'].includes(job.state));
    const queueCount = $('#queue-count');
    if (queueCount) queueCount.textContent = pendingJobs.length;
    const activeProgress = activeJobs.length ? activeJobs.reduce((sum, job) => sum + Number(job.progress?.percent || 0), 0) / activeJobs.length : 0;
    const queueRing = $('#queue-nav-ring');
    if (queueRing) queueRing.style.setProperty('--progress', activeProgress);
    const activityButton = $('#sidebar-activity-button');
    if (activityButton) {
      activityButton.classList.toggle('busy', activeJobs.length > 0);
      activityButton.classList.toggle('has-jobs', pendingJobs.length > 0);
      activityButton.title = activeJobs.length ? `Procesando ${Math.round(activeProgress)}%` : (pendingJobs.length ? `${pendingJobs.length} trabajo(s) en cola` : 'Cola de trabajos');
    }
    if (!jobs.length && activityButton) {
      activityButton.classList.remove('busy', 'has-jobs');
      activityButton.title = 'Cola de trabajos';
    }
    const fileJobs = jobs.filter(isFileJob);
    const jobsTabCount = $('#jobs-tab-count');
    if (jobsTabCount) jobsTabCount.textContent = fileJobs.filter(job => ['queued', 'running', 'paused'].includes(job.state)).length;
    if (!fileJobs.length) {
      $('#queue-list').innerHTML = '<div class="empty-list"><span>≡</span><h3>Aún no hay trabajos</h3><p>Las descargas y procesos aparecerán aquí.</p></div>';
    } else {
    $('#queue-list').innerHTML = fileJobs.map(job => {
      const progress = Math.round(job.progress?.percent || (job.state === 'completed' ? 100 : 0));
      const message = friendlyJobMessage(job.error || job.progress?.message || 'Preparando');
      const phaseTitles = { image: 'Procesamiento de imagen', model: 'Instalación de modelo IA', component: 'Instalación de componente', recode: 'Recodificación de video', video_upscale: 'Mejora de video con IA', download: 'Descarga multimedia' };
      const visual = jobVisuals.get(job.id) || job.context || {};
      const jobTitle = visual.title || phaseTitles[job.progress?.phase] || 'Trabajo multimedia';
      const sent = adobeSentJobs.has(job.id);
      const completed = job.state === 'completed' && typeof job.result === 'string' && job.result;
      const thumbnail = visual.thumbnail ? `<img src="${escapeHtml(visual.thumbnail)}" alt="">` : (job.progress?.phase === 'image' ? '▧' : '▰');
      const stateLabel = { queued: 'En espera', running: 'Procesando', paused: 'Pausado', completed: 'Listo', failed: 'Error', cancelled: 'Saltado' }[job.state] || job.state;
      const queueControls = ['queued','running'].includes(job.state)
        ? `<button class="queue-control-button" data-pause-job="${job.id}">Ⅱ Pausar</button><button class="queue-control-button skip" data-skip-job="${job.id}">Saltar</button>`
        : job.state === 'paused' ? `<button class="queue-control-button resume" data-resume-job="${job.id}">▶ Reanudar</button><button class="queue-control-button skip" data-skip-job="${job.id}">Saltar</button>` : '';
      const aiAction = queueAiButtonForJob(job, completed);
      const folderAction = completed ? `<button class="job-folder-button" data-open-folder="${job.id}" title="Mostrar en carpeta" aria-label="Mostrar en carpeta"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h5l1.7 2H20a1 1 0 0 1 1 1v7.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8.5a2 2 0 0 1 2-2Z"/></svg></button>` : '';
      return `<article class="job-card" data-job-id="${job.id}"><div class="job-thumb">${thumbnail}</div><div class="job-info"><div class="job-heading"><strong>${escapeHtml(jobTitle)}</strong>${job.state === 'completed' ? '<span class="job-check">✓ Listo</span>' : ''}</div><p>${escapeHtml(message)}</p><div class="progress-track"><i style="width:${progress}%"></i></div></div><div class="job-actions">${['queued','running'].includes(job.state) ? `<div class="job-progress-ring" style="--progress:${progress}" data-progress="${progress}%"></div>` : ''}${queueControls}${aiAction}<span class="job-state-label">${stateLabel}</span>${folderAction}<button class="premiere-job-button ${sent ? 'sent' : ''}" data-send-job="${job.id}" ${!completed || sent ? 'disabled' : ''} title="${sent ? 'Ya enviado a Premiere' : completed ? 'Enviar a Premiere' : 'Disponible al terminar'}">Pr</button></div></article>`;
    }).join('');
    }
    let sessionChanged = false;
    for (const item of downloadSession) {
      const job = jobs.find(entry => entry.id === item.jobId);
      if (job?.state === 'completed' && typeof job.result === 'string' && item.result !== job.result) { item.result = job.result; sessionChanged = true; }
    }
    if (sessionChanged) renderDownloadSession();
    if (jobs.some(job => job.state === 'completed' && String(jobVisuals.get(job.id)?.kind || '').startsWith('asset-'))) loadAssets();
    if (settings.autoAdobe || requestedAdobeJobs.size) {
      for (const job of jobs) {
        if ((settings.autoAdobe || requestedAdobeJobs.has(job.id)) && job.state === 'completed' && typeof job.result === 'string' && job.result && !adobeSentJobs.has(job.id)) {
          sendJobToAdobe(job.id, true);
        }
      }
    }
  } catch (_) { /* backend may still be starting */ }
}

async function checkHealth() {
  try {
    const data = await api('/health');
    if (engineFailureToast?.isConnected) engineFailureToast.remove();
    engineFailureToast = null;
    return data;
  } catch (error) {
    if (!engineFailureToast?.isConnected) {
      showEngineFailure({ message: 'No se pudo conectar con el motor interno. Puedes reintentar el arranque o abrir los logs.' });
    }
    return null;
  }
}

async function checkAdobe() {
  try {
    const data = await api('/api/adobe');
    const online = Boolean(data.target);
    $('#queue-adobe-state').classList.toggle('online', online);
    $('#queue-adobe-state').textContent = online ? `Premiere conectado · ${data.target}` : 'Premiere sin conexión';
    if (data.receivedFiles?.length) {
      toast(`${data.receivedFiles.length} archivo(s) recibidos desde Adobe`);
      try {
        await routeFiles(data.receivedFiles, 'Adobe');
      } catch (routeError) {
        toast(`ClipDock recibió la selección, pero no pudo abrirla: ${routeError.message || routeError}. Primer archivo: ${String(data.receivedFiles[0] || '').slice(0, 180)}`, 'error', { sticky: true, key: 'adobe-route-error' });
      }
    }
    if (data.downloadRequests?.length) {
      for (const request of data.downloadRequests) await handleAdobeDownloadRequest(request);
    }
  } catch (_) { /* bridge unavailable */ }
}


async function handleAdobeDownloadRequest(request = {}) {
  const url = normalizeUrl(request.url);
  if (!url) return;
  switchView('download');
  $('#url-input').value = url;
  try {
    const info = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ url, source: 'adobe-fallback' }) });
    renderAnalysis(info);
    addAnalysisToSession(info, url);
    const item = downloadSession.find(entry => entry.url === url);
    if (item) {
      item.saveThumbnail = Boolean(request.thumbnail);
      item.subtitles = Array.isArray(request.subtitles) ? request.subtitles.length > 0 : Boolean(request.subtitles);
      item.subtitleFormat = request.subtitleFormat || item.subtitleFormat || 'srt';
      item.subtitleLang = request.subtitleLang || item.subtitleLang || 'auto';
      item.requestId = request.requestId || request.id || '';
      item.remoteSource = request.source || 'adobe-extension';
      item.recode = { mode: 'quick', preset: 'h264_standard', keepOriginal: false, ...(request.recode || {}), autoAdobe: Boolean(request.addToTimeline) };
      item.autoAdobe = Boolean(request.addToTimeline);
      renderDownloadSession();
      if (request.autoStart !== false) {
        if (!outputDir) outputDir = settings.outputDir || outputDir;
        if (!outputDir) {
          toast('Adobe mandó una descarga, pero falta carpeta de salida. Elige una carpeta y presiona Descargar.', 'error', { sticky: true, key: 'adobe-output-missing' });
          return;
        }
        const job = await startSessionDownload(item);
        if (job) {
          requestedAdobeJobs.add(job.id);
          toast('Descarga recibida desde Adobe y enviada a la cola', 'progress');
          switchView('queue');
        }
      }
    }
  } catch (error) {
    if (error?.code === 'components_required') {
      const fallbackInfo = {
        title: request.title || 'Descarga desde Adobe',
        thumbnail: request.sourceThumbnail || '',
        duration: 0,
        formats: [],
        extractor_key: 'Adobe',
        uploader: 'Premiere / ClipDock'
      };
      renderAnalysis(fallbackInfo);
      addAnalysisToSession(fallbackInfo, url);
      const item = downloadSession.find(entry => entry.url === url);
      if (item) {
        item.saveThumbnail = Boolean(request.thumbnail);
        item.subtitles = Array.isArray(request.subtitles) ? request.subtitles.length > 0 : Boolean(request.subtitles);
        item.subtitleFormat = request.subtitleFormat || 'srt';
        item.subtitleLang = request.subtitleLang || 'auto';
        item.requestId = request.requestId || request.id || '';
        item.remoteSource = request.source || 'adobe-extension';
        item.recode = { mode: 'quick', preset: 'h264_standard', keepOriginal: false, ...(request.recode || {}), autoAdobe: Boolean(request.addToTimeline) };
        item.autoAdobe = Boolean(request.addToTimeline);
        renderDownloadSession();
        if (request.autoStart !== false) {
          const job = await startSessionDownload(item);
          if (job) {
            requestedAdobeJobs.add(job.id);
            toast('ClipDock instalará dependencias si hacen falta y continuará la descarga de Adobe', 'progress');
            switchView('queue');
          }
        }
      }
      return;
    }
    if (showComponentRequirement(error)) {
      toast('Adobe mandó el enlace, pero ClipDock necesita instalar un componente. Usa el botón Instalar ahora; se guardará en Documentos/ClipDock/Componentes.', 'info', { sticky: true, key: `adobe-components-${url}` });
      return;
    }
    if (isYoutubeAuthError(error.message)) {
      $('#auth-help').classList.remove('hidden');
      $('#auth-help p').textContent = String(error.message || 'YouTube pidió confirmar tu sesión.').slice(0, 360);
    }
    toast(`Adobe mandó el enlace, pero ClipDock no pudo iniciarlo: ${error.message}`, 'error', { sticky: true, key: `adobe-download-${url}` });
  }
}

async function sendJobToAdobe(jobId, automatic = false) {
  const job = latestJobs.find(item => item.id === jobId);
  if (!job || job.state !== 'completed' || typeof job.result !== 'string' || !job.result || adobeSentJobs.has(jobId)) return;
  try {
    const response = await api('/api/adobe/send', { method: 'POST', body: JSON.stringify({ files: [job.result], targetBin: 'ClipDock', deliveryId: `job_${jobId}` }) });
    if (!response.confirmed) throw new Error(response.delivery?.result || 'Premiere no confirmó la importación. Revisa que el proyecto siga enlazado.');
    adobeSentJobs.add(jobId);
    persistSentJobs();
    loadJobs();
    toast(automatic ? 'Resultado enviado automáticamente a Premiere' : 'Archivo enviado a Premiere');
  } catch (error) { toast(error.message, 'error'); }
}

async function sendAllToAdobe() {
  const pending = latestJobs.filter(job => job.state === 'completed' && typeof job.result === 'string' && job.result && !adobeSentJobs.has(job.id));
  if (!pending.length) return toast('No hay archivos nuevos para enviar', 'error');
  try {
    const deliveryId = `batch_${pending.map(job => job.id).join('_')}`;
    const response = await api('/api/adobe/send', { method: 'POST', body: JSON.stringify({ files: pending.map(job => job.result), targetBin: 'ClipDock', deliveryId }) });
    if (!response.confirmed) throw new Error(response.delivery?.result || 'Premiere no confirmó la importación del lote.');
    pending.forEach(job => adobeSentJobs.add(job.id));
    persistSentJobs();
    loadJobs();
    toast(`${pending.length} archivo(s) enviados a Premiere`);
  } catch (error) { toast(error.message, 'error'); }
}

async function controlQueueJob(jobId, action) {
  const labels = { pause: 'Trabajo pausado; la cola continuará con el siguiente', resume: 'Trabajo reanudado', cancel: 'Trabajo saltado' };
  try {
    await api(`/api/jobs/${jobId}/${action}`, { method: 'POST', body: '{}' });
    toast(labels[action] || 'Cola actualizada');
    await loadJobs();
  } catch (error) { toast(error.message, 'error'); }
}

async function pickImage() {
  const files = await window.desktop?.pickFiles([{ name: 'Imágenes y documentos', extensions: ['png','jpg','jpeg','webp','avif','tif','tiff','bmp','svg','pdf','ai','eps','dng','raw'] }]);
  if (!files?.length) return;
  await addImagesToSession(files, 'equipo');
}

function imageName(filePath) {
  return String(filePath || '').split(/[\\/]/).pop() || 'Imagen';
}

function makeImageId(filePath) {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}_${imageName(filePath)}`;
}

function paintImagePreview(item) {
  currentImage = item?.path || null;
  $('#selected-file').textContent = item ? imageName(item.path) : 'Ningún archivo';
  if (item?.preview) {
    $('#image-preview').src = item.preview;
    $('#pick-image').classList.add('has-image');
  } else {
    $('#image-preview').removeAttribute('src');
    $('#pick-image').classList.remove('has-image');
  }
}

async function selectImageItem(itemId) {
  const item = imageSession.find(entry => entry.id === itemId);
  if (!item) return;
  activeImageId = item.id;
  if (!item.preview) {
    try {
      const preview = await window.desktop?.previewFile(item.path);
      if (preview && String(preview).length < 12000000) item.preview = preview;
    } catch (_) { /* la ruta puede venir de Adobe/offline; aun así la mostramos */ }
  }
  paintImagePreview(item);
  renderImageSession();
}

async function setCurrentImage(filePath, dataUrl = null) {
  if (!filePath) return;
  let item = imageSession.find(entry => entry.path === filePath);
  if (!item) {
    item = { id: makeImageId(filePath), path: filePath, name: imageName(filePath), preview: '' };
    imageSession.push(item);
  }
  try {
    const preview = dataUrl || await window.desktop?.previewFile(filePath);
    if (preview && String(preview).length < 12000000) item.preview = preview;
  } catch (_) {
    item.preview = item.preview || '';
  }
  await selectImageItem(item.id);
}

async function addImagesToSession(files = [], source = 'equipo') {
  const cleanFiles = [...new Set((files || []).filter(Boolean))];
  if (!cleanFiles.length) return;
  for (const file of cleanFiles) await setCurrentImage(file);
  if (cleanFiles.length > 1) toast(`${cleanFiles.length} imágenes agregadas desde ${source}`);
}

async function pasteImageFromClipboard() {
  const image = await window.desktop?.readClipboardImage();
  if (!image) return toast('El portapapeles no contiene una imagen', 'error');
  await setCurrentImage(image.path, image.dataUrl);
  toast('Imagen agregada a la sesión');
}

function renderImageSession() {
  const count = $('#image-session-count');
  const list = $('#image-session-list');
  if (!count || !list) return;
  count.textContent = imageSession.length;
  updateImageFolderButton();
  const allButton = $('#process-all-images');
  if (allButton) allButton.disabled = imageSession.length === 0;
  if (!imageSession.length) {
    list.innerHTML = '<div class="empty-mini">Pega o elige imágenes para armar la sesión.</div>';
    paintImagePreview(null);
    return;
  }
  list.innerHTML = imageSession.slice().reverse().map(item => {
    const active = item.id === activeImageId;
    const thumb = item.preview ? `<img src="${escapeHtml(item.preview)}" alt="">` : '<span>▧</span>';
    return `<article class="image-session-item ${active ? 'active' : ''}" data-image-id="${escapeHtml(item.id)}"><button class="image-session-thumb" data-image-select="${escapeHtml(item.id)}">${thumb}</button><div><strong>${escapeHtml(item.name || imageName(item.path))}</strong><small>${active ? 'Seleccionada' : 'Lista para procesar'}</small></div><div class="image-session-actions"><button class="session-tool" data-image-select="${escapeHtml(item.id)}">Usar</button><button class="session-tool ai" data-image-process="${escapeHtml(item.id)}">Procesar</button><button class="remove-session" data-image-remove="${escapeHtml(item.id)}">×</button></div></article>`;
  }).join('');
}

function readImageOptions() {
  const engineName = $('#upscale-engine').value;
  const modelNames = {
    'Real-ESRGAN': 'Anime Video v3 (Rápido, Multi-escala)',
    'Waifu2x': 'CU-Net (Alta Calidad)',
    'RealSR': 'Estándar (DF2K)',
    'SRMD': 'Estándar (General)'
  };
  const interpolationNames = { Lanczos: 'Lanczos (Mejor Calidad)', Bicubic: 'Bicúbico (Rápido)', Nearest: 'Nearest (Pixelado)' };
  const positionNames = { center: 'Centro', top: 'Arriba Centro', bottom: 'Abajo Centro', left: 'Centro Izquierda', right: 'Centro Derecha' };
  const width = Number($('#image-width').value || 0);
  const height = Number($('#image-height').value || 0);
  const canvasWidth = Number($('#canvas-width').value || 0);
  const canvasHeight = Number($('#canvas-height').value || 0);
  const quality = Number($('#image-quality').value || 90);
  const preserveMetadata = Boolean($('#preserve-metadata').checked);
  return {
    format: $('#image-format').value.replace(/^\./, '').toUpperCase(),
    jpg_quality: quality, webp_quality: quality, avif_quality: quality, png_compression: Math.round((100 - quality) / 11),
    webp_metadata: preserveMetadata, preserve_metadata: preserveMetadata,
    resize_enabled: $('#resize-enabled').checked && width > 0 && height > 0,
    resize_width: width, resize_height: height,
    resize_maintain_aspect: $('#maintain-aspect').checked,
    interpolation_method: interpolationNames[$('#image-interpolation').value] || 'Lanczos (Mejor Calidad)',
    upscale_enabled: $('#upscale-enabled').checked,
    upscale_engine: engineName,
    upscale_model_friendly: modelNames[engineName],
    upscale_scale: $('#image-scale').value,
    upscale_tile: '0',
    rembg_enabled: $('#remove-background').checked,
    rembg_model: `${$('#rembg-model').value}.onnx`,
    rembg_gpu: true,
    canvas_enabled: $('#canvas-enabled').checked && canvasWidth > 0 && canvasHeight > 0,
    canvas_option: 'Personalizado...', canvas_width: canvasWidth, canvas_height: canvasHeight,
    canvas_position: positionNames[$('#canvas-position').value] || 'Centro',
    canvas_overflow_mode: 'Reducir hasta que quepa',
    background_enabled: $('#background-enabled').checked,
    background_type: 'Color Sólido', background_color: $('#background-color').value
  };
}

function updateImageFolderButton() {
  const button = $('#image-folder-settings');
  if (!button) return;
  button.classList.toggle('active', Boolean(imageExportFolderName));
  button.title = imageExportFolderName ? `Exportar en carpeta: ${imageExportFolderName}` : 'Exportar en carpeta';
}

function sanitizeImageFolderName(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 80);
}

function imageOutputDir(usePreparedFolder = false) {
  if (!usePreparedFolder || !imageExportFolderName) return outputDir;
  const folderName = sanitizeImageFolderName(imageExportFolderName);
  if (!folderName) return outputDir;
  const separator = outputDir.includes('\\') ? '\\' : '/';
  return `${outputDir}${separator}${folderName}`;
}

function openImageFolderModal() {
  const modal = $('#image-folder-modal');
  const input = $('#image-folder-name');
  if (!modal || !input) return;
  input.value = imageExportFolderName || '';
  modal.classList.remove('hidden');
  requestAnimationFrame(() => { input.focus(); input.select(); });
}

function closeImageFolderModal() {
  $('#image-folder-modal')?.classList.add('hidden');
}

function applyImageFolderName() {
  const rawValue = ($('#image-folder-name')?.value || '').trim();
  const value = sanitizeImageFolderName(rawValue);
  if (rawValue && !value) return toast('Escribe un nombre de carpeta válido', 'error');
  imageExportFolderName = value;
  if ($('#image-folder-name')) $('#image-folder-name').value = value;
  localStorage.setItem('imageExportFolderName', value);
  updateImageFolderButton();
  closeImageFolderModal();
  toast(value ? `Carpeta preparada: ${value}` : 'Exportar en carpeta desactivado');
}

function setImagePanelMode(mode = 'selected') {
  const modal = mode === 'modal';
  if ($('#image-panel-eyebrow')) $('#image-panel-eyebrow').textContent = modal ? 'AJUSTE UNIVERSAL' : 'IMAGEN SELECCIONADA';
  if ($('#image-tool-title')) $('#image-tool-title').textContent = modal ? 'Una receta para tus imágenes' : 'Formato, tamaño e IA';
  if ($('#image-tool-description')) $('#image-tool-description').textContent = modal
    ? 'Formato, calidad, tamaño, escala IA y fondo en un solo lugar.'
    : 'Configura la imagen activa de la lista. El ajuste universal vive arriba en la sesión.';
}

function openImageUniversalModal() {
  setImagePanelMode('modal');
  $('#image-universal-backdrop')?.classList.remove('hidden');
  $('#image-universal-panel')?.classList.remove('hidden');
  document.body.classList.add('image-modal-open');
}

function closeImageUniversalModal() {
  $('#image-universal-backdrop')?.classList.add('hidden');
  document.body.classList.remove('image-modal-open');
  setImagePanelMode('selected');
}

async function processImageItem(item, switchToQueue = true, options = {}) {
  if (!item?.path) return toast('Elige primero una imagen', 'error');
  if (!outputDir) await chooseOutput();
  if (!outputDir) return null;
  const targetDir = options.outputDir || outputDir;
  const extension = $('#image-format').value;
  const base = imageName(item.path).replace(/\.[^.]+$/, '');
  const separator = targetDir.includes('\\') ? '\\' : '/';
  const output = `${targetDir}${separator}${base}_clipdock.${extension}`;
  try {
    const job = await api('/api/jobs/image', { method: 'POST', body: JSON.stringify({ input: item.path, output, options: readImageOptions() }) });
    const preview = item.preview || '';
    jobVisuals.set(job.id, { title: base, thumbnail: preview.length < 180000 ? preview : '', kind: 'image' });
    persistJobVisuals();
    if (switchToQueue) {
      closeImageUniversalModal();
      toast('Imagen añadida a la cola');
      switchView('queue');
    }
    return job;
  } catch (error) { toast(error.message, 'error'); return null; }
}
async function processImage() {
  const item = imageSession.find(entry => entry.id === activeImageId) || imageSession[imageSession.length - 1];
  await processImageItem(item, true);
}

async function processAllImages() {
  if (!imageSession.length) return toast('Agrega primero una imagen', 'error');
  if (!outputDir) await chooseOutput();
  if (!outputDir) return;
  const targetDir = imageOutputDir(true);
  let added = 0;
  for (const item of imageSession) {
    const job = await processImageItem(item, false, { outputDir: targetDir });
    if (job) added += 1;
  }
  if (added) {
    closeImageUniversalModal();
    toast(imageExportFolderName ? `${added} imagen(es) añadidas a la cola en ${imageExportFolderName}` : `${added} imagen(es) añadidas a la cola`);
    switchView('queue');
  }
}
function updateImageControlStates() {
  const resize = Boolean($('#resize-enabled')?.checked);
  ['image-width','image-height','maintain-aspect','image-interpolation'].forEach(id => { const node = $(`#${id}`); if (node) node.disabled = !resize; });
  $('#image-options-size')?.classList.toggle('enabled-resize', resize);

  const upscale = Boolean($('#upscale-enabled')?.checked);
  ['upscale-engine','image-scale'].forEach(id => { const node = $(`#${id}`); if (node) node.disabled = !upscale; });
  $('#image-options-ai')?.classList.toggle('enabled-upscale', upscale);

  const removeBg = Boolean($('#remove-background')?.checked);
  if ($('#rembg-model')) $('#rembg-model').disabled = !removeBg;
  $('#image-options-canvas')?.classList.toggle('enabled-rembg', removeBg);

  const canvas = Boolean($('#canvas-enabled')?.checked);
  ['canvas-width','canvas-height','canvas-position'].forEach(id => { const node = $(`#${id}`); if (node) node.disabled = !canvas; });
  $('#image-options-canvas')?.classList.toggle('enabled-canvas', canvas);

  const background = Boolean($('#background-enabled')?.checked);
  ['background-color'].forEach(id => { const node = $(`#${id}`); if (node) node.disabled = !background; });
  $('#image-options-canvas')?.classList.toggle('enabled-background', background);
}

function showAiTool(tool) {
  $('#image-workbench')?.classList.remove('hidden');
  const removeMode = tool === 'remove-bg';
  if ($('#remove-background')) $('#remove-background').checked = removeMode;
  if ($('#upscale-enabled')) $('#upscale-enabled').checked = !removeMode;
  updateImageControlStates();
}

function videoFileName(filePath) {
  return String(filePath || '').split(/[\\/]/).pop() || 'Video';
}

function renderConvertSession() {
  $('#convert-session-count').textContent = currentConvertFiles.length;
  $('#process-all-videos').disabled = currentConvertFiles.length === 0;
  $('#process-ai-video').disabled = !currentAiVideo;
  updateConvertFolderButton();
  if (!currentConvertFiles.length) {
    $('#convert-session-list').innerHTML = '<div class="empty-mini">Sube uno o varios videos para armar la sesión.</div>';
    return;
  }
  $('#convert-session-list').innerHTML = [...currentConvertFiles].reverse().map(filePath => {
    const active = filePath === currentAiVideo;
    return `<article class="video-session-item ${active ? 'active' : ''}" data-convert-file="${escapeHtml(filePath)}"><button class="video-session-thumb" data-convert-select="${escapeHtml(filePath)}"><span>▶</span></button><div><strong>${escapeHtml(videoFileName(filePath))}</strong><small>${active ? 'En vista previa' : 'Listo para procesar'}</small></div><div class="video-session-actions"><button class="session-tool" data-convert-select="${escapeHtml(filePath)}">Usar</button><button class="session-tool ai" data-convert-process="${escapeHtml(filePath)}">Procesar</button><button class="remove-session" data-convert-remove="${escapeHtml(filePath)}">×</button></div></article>`;
  }).join('');
}

function updateConvertFolderButton() {
  const button = $('#convert-folder-settings');
  if (!button) return;
  button.classList.toggle('active', Boolean(convertExportFolderName));
  button.title = convertExportFolderName ? `Exportar en carpeta: ${convertExportFolderName}` : 'Exportar en carpeta';
}

function openConvertFolderModal() {
  const modal = $('#convert-folder-modal');
  const input = $('#convert-folder-name');
  if (!modal || !input) return;
  input.value = convertExportFolderName || '';
  modal.classList.remove('hidden');
  requestAnimationFrame(() => { input.focus(); input.select(); });
}

function closeConvertFolderModal() {
  $('#convert-folder-modal')?.classList.add('hidden');
}

function sanitizeConvertFolderName(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 80);
}

function convertOutputDir(usePreparedFolder = false) {
  if (!usePreparedFolder || !convertExportFolderName) return outputDir;
  const folderName = sanitizeConvertFolderName(convertExportFolderName);
  if (!folderName) return outputDir;
  const separator = outputDir.includes('\\') ? '\\' : '/';
  return `${outputDir}${separator}${folderName}`;
}

function applyConvertFolderName() {
  const rawValue = ($('#convert-folder-name')?.value || '').trim();
  const value = sanitizeConvertFolderName(rawValue);
  if (rawValue && !value) return toast('Escribe un nombre de carpeta válido', 'error');
  convertExportFolderName = value;
  if ($('#convert-folder-name')) $('#convert-folder-name').value = value;
  localStorage.setItem('convertExportFolderName', value);
  updateConvertFolderButton();
  closeConvertFolderModal();
  toast(value ? `Carpeta preparada: ${value}` : 'Exportar en carpeta desactivado');
}


function activeVideoOutputFormat() {
  return LOCAL_VIDEO_OUTPUT_FORMATS[$('#video-output-format')?.value] || LOCAL_VIDEO_OUTPUT_FORMATS.h264;
}

function renderVideoOutputProfiles() {
  const format = activeVideoOutputFormat();
  const profileSelect = $('#video-output-profile');
  if (!profileSelect) return;
  const current = profileSelect.value;
  profileSelect.innerHTML = format.profiles.map(profile => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.label)}</option>`).join('');
  if (format.profiles.some(profile => profile.id === current)) profileSelect.value = current;
  else profileSelect.value = format.profiles[0]?.id || '';
  updateVideoOutputState();
}

function selectedVideoOutputProfile() {
  const format = activeVideoOutputFormat();
  return format.profiles.find(profile => profile.id === $('#video-output-profile')?.value) || format.profiles[0] || {};
}

function updateVideoOutputState() {
  const enabled = $('#video-output-enabled')?.checked !== false;
  const format = activeVideoOutputFormat();
  const fields = $('#video-output-fields');
  if (fields) fields.classList.toggle('disabled', !enabled);
  $$('#video-output-fields select').forEach(control => { control.disabled = !enabled; });
  const speed = $('#video-output-speed');
  if (speed) speed.disabled = !enabled || !format.speedEnabled;
  const help = $('#video-output-help');
  if (help) {
    if (!enabled) help.textContent = 'Salida desactivada: útil para mejorar con IA o recortar sin elegir formato nuevo.';
    else if (format.kind === 'gif') help.textContent = 'GIF usa sus propios perfiles; no se mezcla con H.264 ni ProRes.';
    else if (format.kind === 'audio') help.textContent = 'Solo exporta audio; el video se ignora.';
    else help.textContent = 'El formato define automáticamente el códec correcto.';
  }
  $('#video-output-format')?.closest('.video-output-section')?.classList.toggle('output-off', !enabled);
}

function readSelectedVideoRecipe() {
  const enabled = $('#video-output-enabled')?.checked !== false;
  if (!enabled) return { mode: 'off' };
  const format = activeVideoOutputFormat();
  const profile = selectedVideoOutputProfile();
  return {
    mode: 'manual',
    container: format.container,
    videoCodec: format.videoCodec,
    audioCodec: profile.audioCodec || format.audioCodec,
    audioBitrate: profile.audioBitrate || format.audioBitrate || '192k',
    quality: profile.quality ?? 23,
    speed: $('#video-output-speed')?.value || 'medium',
    proresProfile: profile.proresProfile ?? 2,
    width: profile.width || '',
    height: profile.height || '',
    fps: profile.fps || '',
    keepOriginal: false
  };
}

function outputContainerForAiRecipe(recipe) {
  if (!recipe || recipe.mode === 'off') return 'mp4';
  if (['mp4', 'mov', 'mkv', 'avi'].includes(recipe.container)) return recipe.container;
  return 'mp4';
}

function codecForAiRecipe(recipe) {
  if (!recipe || recipe.mode === 'off') return 'h264';
  return ['h264', 'h265', 'prores'].includes(recipe.videoCodec) ? recipe.videoCodec : 'h264';
}

function qualityForAiRecipe(recipe) {
  if (!recipe || recipe.mode === 'off') return 18;
  return Number(recipe.quality ?? 18);
}

async function pickAiVideo(mode = 'append') {
  const files = await window.desktop?.pickFiles([{ name: 'Videos', extensions: ['mp4','mov','mkv','webm','avi','m4v'] }]);
  if (!files?.length) return;
  if (mode === 'replace' && currentAiVideo) {
    const index = currentConvertFiles.indexOf(currentAiVideo);
    if (index >= 0) currentConvertFiles.splice(index, 1, files[0]);
    currentAiVideo = files[0];
    for (const extra of files.slice(1)) if (!currentConvertFiles.includes(extra)) currentConvertFiles.push(extra);
  } else {
    for (const file of files) if (!currentConvertFiles.includes(file)) currentConvertFiles.push(file);
  }
  await setAiVideo(files[0]);
  renderConvertSession();
  if (files.length > 1) toast(`${files.length} videos agregados a la sesión`, 'info');
}

async function processAiVideo(files = null, options = {}) {
  const targets = Array.isArray(files) ? files : (currentAiVideo ? [currentAiVideo] : []);
  if (!targets.length) return toast('Elige primero un video de la sesión', 'error');
  if (!outputDir) await chooseOutput();
  if (!outputDir) return;
  const targetOutputDir = convertOutputDir(Boolean(options.exportFolder));
  const separator = targetOutputDir.includes('\\') ? '\\' : '/';
  const aiEnabled = $('#video-ai-enabled').checked;
  const trimStart = parseClock($('#video-trim-start').value);
  const trimEnd = parseClock($('#video-trim-end').value);
  const selectedRecipe = readSelectedVideoRecipe();
  const hasTrim = trimStart > 0 || (trimEnd > 0 && trimEnd < Math.max(1, Math.floor(currentVideoDuration || trimEnd || 1)));
  if (selectedRecipe.mode === 'off' && !aiEnabled && !hasTrim) {
    return toast('Activa una salida, un recorte o la mejora IA para procesar', 'error');
  }
  try {
    for (const input of targets) {
      const base = input.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
      let job;
      if (aiEnabled) {
        const container = outputContainerForAiRecipe(selectedRecipe);
        const codec = codecForAiRecipe(selectedRecipe);
        const output = `${targetOutputDir}${separator}${base}_ClipDock_IA.${container}`;
        const options = {
          upscale_engine: $('#video-upscale-engine').value, upscale_scale: $('#video-upscale-scale').value,
          upscale_container: container, upscale_model_friendly: $('#video-upscale-model').value,
          upscale_codec: codec, upscale_quality: qualityForAiRecipe(selectedRecipe), upscale_preset: selectedRecipe.speed || 'fast',
          trim_start: trimStart, trim_end: trimEnd, upscale_tile: '0', upscale_denoise: '-1'
        };
        job = await api('/api/jobs/video-upscale', { method: 'POST', body: JSON.stringify({ input, output, options }) });
      } else {
        const recode = selectedRecipe.mode === 'off'
          ? { mode: 'manual', container: String(input.split('.').pop() || 'mp4').toLowerCase(), videoCodec: 'copy', audioCodec: 'copy', trimStart: trimStart ? formatClock(trimStart) : '', trimEnd: trimEnd ? formatClock(trimEnd) : '', outputDir: targetOutputDir }
          : { ...selectedRecipe, trimStart: trimStart ? formatClock(trimStart) : '', trimEnd: trimEnd ? formatClock(trimEnd) : '', outputDir: targetOutputDir };
        job = await api('/api/jobs/recode', { method: 'POST', body: JSON.stringify({ input, recode }) });
      }
      jobVisuals.set(job.id, { title: `${base} · ${aiEnabled ? 'Mejora IA' : 'Conversión'}`, thumbnail: '', kind: aiEnabled ? 'video-upscale' : 'recode' });
    }
    persistJobVisuals();
    toast(`${targets.length} video${targets.length === 1 ? '' : 's'} añadido${targets.length === 1 ? '' : 's'} a la cola`, 'progress');
    switchView('queue');
  } catch (error) { toast(error.message, 'error'); }
}

function clampScale(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1.5, Math.max(0.9, number));
}

function clampTitleScale(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1.2, Math.max(0.65, number));
}

function isDirectTextElement(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'VIDEO', 'IMG', 'CANVAS'].includes(element.tagName)) return false;
  if (['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'BUTTON', 'OUTPUT'].includes(element.tagName)) return true;
  return [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
}

function rememberOriginalFont(element) {
  if (originalFontStyles.has(element)) return;
  originalFontStyles.set(element, {
    value: element.style.getPropertyValue('font-size'),
    priority: element.style.getPropertyPriority('font-size'),
    baseSize: null
  });
  originalFontElements.add(element);
}

function restoreOriginalFonts() {
  for (const element of originalFontElements) {
    if (!element.isConnected) {
      originalFontElements.delete(element);
      continue;
    }
    const original = originalFontStyles.get(element);
    if (original?.value) element.style.setProperty('font-size', original.value, original.priority);
    else element.style.removeProperty('font-size');
  }
}

function applyFontScaleToDocument(scale) {
  const titleScale = clampTitleScale(settings.titleScale ?? 1, 1);
  restoreOriginalFonts();
  const targets = [document.body, ...document.body.querySelectorAll('*')].filter(isDirectTextElement);
  targets.forEach(rememberOriginalFont);
  restoreOriginalFonts();
  for (const element of targets) {
    const original = originalFontStyles.get(element);
    if (!Number.isFinite(original.baseSize)) original.baseSize = Number.parseFloat(getComputedStyle(element).fontSize);
  }
  if (Math.abs(scale - 1) < 0.001 && Math.abs(titleScale - 1) < 0.001) return;
  for (const element of targets) {
    const baseSize = originalFontStyles.get(element)?.baseSize;
    const multiplier = element.matches('h1,h2,h3') ? scale * titleScale : scale;
    if (Number.isFinite(baseSize)) element.style.setProperty('font-size', `${baseSize * multiplier}px`, 'important');
  }
}

function scheduleFontScale() {
  if (fontScaleScheduled) return;
  fontScaleScheduled = true;
  requestAnimationFrame(() => {
    fontScaleScheduled = false;
    applyFontScaleToDocument(clampScale(settings.fontScale ?? 1, 1));
  });
}

function observeDynamicText() {
  if (fontScaleObserver) return;
  fontScaleObserver = new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.type === 'childList')) scheduleFontScale();
  });
  fontScaleObserver.observe(document.body, { childList: true, subtree: true });
}


function applyAccentColor(colorId = 'acid') {
  const id = ACCENT_COLORS[colorId] ? colorId : 'acid';
  document.documentElement.style.setProperty('--acid', ACCENT_COLORS[id]);
  document.documentElement.style.setProperty('--accent-contrast', ACCENT_CONTRAST_COLORS[id] || '#9a88ff');
  document.body.dataset.accentColor = id;
}

function syncAccentControls() {
  const active = settings.accentColor || 'acid';
  $$('[data-accent-color]').forEach(button => {
    button.classList.toggle('active', button.dataset.accentColor === active);
  });
}

async function updateAccentColor(colorId, persist = true) {
  const id = ACCENT_COLORS[colorId] ? colorId : 'acid';
  settings.accentColor = id;
  applyAccentColor(id);
  syncAccentControls();
  if (persist) await saveSettings({ accentColor: id });
}

function applyInterfaceSettings() {
  const interfaceScale = clampScale(settings.interfaceScale ?? 1, 1);
  const fontScale = clampScale(settings.fontScale ?? 1, 1);
  applyAccentColor(settings.accentColor || 'acid');
  document.documentElement.style.setProperty('--clipdock-interface-scale', String(interfaceScale));
  document.documentElement.style.setProperty('--clipdock-font-scale', String(fontScale));
  document.body.style.removeProperty('zoom');
  $('.app-shell')?.style.removeProperty('height');
  $('.sidebar-bottom')?.style.removeProperty('zoom');
  document.body.dataset.uiScaleActive = Math.abs(interfaceScale - 1) > 0.001 ? 'true' : 'false';
  document.body.dataset.fontScaleActive = 'false';
  applyFontScaleToDocument(fontScale);
  observeDynamicText();
  syncSidebarCompactMode();
  setupRuntimeSetupModal();
  showRuntimeSetupIfNeeded();
}

function setSidebarCompact(enabled, persist = true) {
  const compact = Boolean(enabled);
  document.body.classList.toggle('sidebar-compact', compact);
  const button = $('#sidebar-compact-toggle');
  if (button) {
    button.querySelector('span').textContent = compact ? '›' : '‹';
    button.title = compact ? 'Expandir barra lateral' : 'Contraer barra lateral';
    button.setAttribute('aria-label', button.title);
  }
  if (persist) localStorage.setItem('sidebarCompact', compact ? '1' : '0');
  // Reposiciona el indicador durante y después de la transición de ancho.
  requestAnimationFrame(moveNavIndicator);
  setTimeout(moveNavIndicator, 200);
  setTimeout(moveNavIndicator, 380);
}

function syncSidebarCompactMode() {
  const forcedByWidth = window.innerWidth <= 1050;
  const saved = localStorage.getItem('sidebarCompact') === '1';
  setSidebarCompact(forcedByWidth || saved, false);
  document.body.classList.toggle('sidebar-auto-compact', forcedByWidth);
}

function syncInterfaceControls() {
  const interfaceValue = Math.round(clampScale(settings.interfaceScale ?? 1, 1) * 100);
  const fontValue = Math.round(clampScale(settings.fontScale ?? 1, 1) * 100);
  const titleValue = Math.round(clampTitleScale(settings.titleScale ?? 1, 1) * 100);
  const interfaceInput = $('#interface-scale');
  const fontInput = $('#font-scale');
  const titleInput = $('#title-scale');
  if (interfaceInput) interfaceInput.value = interfaceValue;
  if (fontInput) fontInput.value = fontValue;
  if (titleInput) titleInput.value = titleValue;
  if ($('#interface-scale-value')) $('#interface-scale-value').textContent = `${interfaceValue}%`;
  if ($('#font-scale-value')) $('#font-scale-value').textContent = `${fontValue}%`;
  if ($('#title-scale-value')) $('#title-scale-value').textContent = `${titleValue}%`;
  syncAccentControls();
  applyInterfaceSettings();
}

async function updateInterfaceScale(kind, percent, persist = true) {
  const value = String((Number(percent) || 100) / 100);
  if (kind === 'interface') settings.interfaceScale = value;
  if (kind === 'font') settings.fontScale = value;
  if (kind === 'title') settings.titleScale = value;
  syncInterfaceControls();
  if (persist) {
    const key = kind === 'interface' ? 'interfaceScale' : kind === 'title' ? 'titleScale' : 'fontScale';
    await saveSettings({ [key]: value });
  }
}

async function saveSettings(changes = {}) {
  settings = { ...settings, ...changes };
  $('#settings-save-state').textContent = 'Guardando…';
  try {
    settings = await api('/api/settings', { method: 'POST', body: JSON.stringify(settings) });
    $('#settings-save-state').textContent = 'Guardado automáticamente';
  } catch (error) {
    $('#settings-save-state').textContent = 'No se pudo guardar';
    toast(error.message, 'error');
  }
}

function syncSettingsUI() {
  $$('[data-setting]').forEach(input => { input.checked = Boolean(settings[input.dataset.setting]); });
  settings.cookieMode = 'file';
  $('#cookie-mode').value = 'file';
  $('#cookie-file').value = settings.cookieFile || '';
  $('#cookie-browser').value = settings.browser || '';
  $('#cookie-profile').value = settings.browserProfile || '';
  outputDir = settings.outputDir || outputDir;
  if ($('#output-folder')) {
    $('#output-folder').textContent = outputDir || 'Sin seleccionar';
    $('#change-folder')?.setAttribute('title', outputDir ? `Salida: ${outputDir}` : 'Salida');
  }
  $('#settings-output-folder').textContent = outputDir || 'Sin seleccionar';
  syncInterfaceControls();
  updateCookiePanels();
  refreshCookieStatus();
}

async function loadSettingsPanels() {
  try { settings = await api('/api/settings'); syncSettingsUI(); }
  catch (_) { syncSettingsUI(); }
  loadComponents();
  loadModels();
  loadSetupRepairStatus();
  refreshUpdateStatus(true);
}

function updateCookiePanels() {
  const mode = $('#cookie-mode').value;
  $('#cookie-file-panel').classList.toggle('hidden', mode !== 'file');
  $('#cookie-browser-panel').classList.toggle('hidden', mode !== 'browser');
}

function setCookieStatusView(status = {}) {
  const card = $('#cookie-status-card');
  const title = $('#cookie-status-title');
  const detail = $('#cookie-status-detail');
  const pathLabel = $('#cookie-current-path');
  if (!card || !title || !detail || !pathLabel) return;
  const ready = Boolean(status.exists && status.looksValid);
  card.classList.remove('hidden');
  card.classList.toggle('ready', ready);
  card.classList.toggle('warning', Boolean(status.exists && !status.looksValid));
  if (!ready) {
    title.textContent = status.exists ? 'El motor no puede usar este cookies.txt' : 'Sin cookies.txt usable para el motor';
    detail.textContent = status.message || 'Importa un archivo cookies.txt para activarlo.';
    pathLabel.textContent = status.path || settings.cookieFile || 'Sin seleccionar';
    return;
  }
  title.textContent = 'Cookies listas para el motor';
  detail.textContent = `${status.message || 'Archivo cookies.txt detectado correctamente.'} ClipDock usará exactamente esta ruta para analizar y descargar.`;
  pathLabel.textContent = status.path || settings.cookieFile;
}

async function refreshCookieStatus() {
  try {
    const backendStatus = await api('/api/cookies/status');
    setCookieStatusView(backendStatus);
  } catch (error) {
    setCookieStatusView({ exists: false, looksValid: false, message: error.message, path: settings.cookieFile });
  }
}

async function testCookies() {
  const button = $('#test-cookies');
  if (button) { button.disabled = true; button.textContent = 'Probando…'; }
  try {
    const result = await api('/api/cookies/test', { method: 'POST', body: JSON.stringify({ url: $('#url-input')?.value || '' }) });
    if (result.status) setCookieStatusView(result.status);
    toast(result.message || 'Cookies probadas correctamente.');
  } catch (error) {
    toast(error.message || 'No se pudieron probar las cookies', 'error');
    await refreshCookieStatus();
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Probar cookies'; }
  }
}

async function importCookieExport(sourcePath = '') {
  let filePath = sourcePath;
  if (!filePath) {
    const files = await window.desktop?.pickFiles([{ name: 'Cookies exportadas', extensions: ['txt'] }]);
    if (!files?.length) return;
    filePath = files[0];
  }
  try {
    const imported = window.desktop?.importCookieFile ? await window.desktop.importCookieFile(filePath) : { path: filePath, status: { path: filePath, exists: true, looksValid: true, message: 'Archivo seleccionado.' } };
    $('#cookie-file').value = imported.path;
    $('#cookie-mode').value = 'file';
    updateCookiePanels();
    await saveSettings({ cookieMode: 'file', cookieFile: imported.path });
    setCookieStatusView(imported.status || { path: imported.path, exists: true, looksValid: true });
    toast(imported.status?.message || 'Cookies importadas y activadas.');
  } catch (error) {
    toast(error.message || 'No se pudo importar el cookies.txt', 'error');
  }
}

function formatBytes(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes; let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
}

// Python mini: el motor interno se muestra como componente, pero lo administra
// el proceso principal de Electron (no el backend, porque el backend corre sobre él).
async function buildRuntimeComponentRow() {
  if (!window.desktop?.engineRuntimeStatus) return '';
  try {
    const rt = await window.desktop.engineRuntimeStatus();
    if (!rt) return '';
    let detail;
    if (rt.devMode && !rt.installed) detail = 'Modo desarrollo: se usa el entorno .venv del proyecto.';
    else if (rt.busy) detail = 'Actualizando el motor…';
    else if (rt.updateAvailable) detail = `Actualización disponible: Python ${rt.expectedVersion} (instalado ${rt.installedVersion})`;
    else if (rt.installed) detail = `Instalado: Python ${rt.installedVersion || rt.expectedVersion}${rt.bundled ? ' · incluido con la app' : ''} — motor de descargas, conversión e IA.`;
    else detail = 'Se descarga automáticamente en el primer arranque.';
    let action = '';
    if (rt.busy) {
      action = '<span class="row-status" id="runtime-update-status">…</span>';
    } else if (rt.updateAvailable) {
      action = '<button class="primary-mini update-mini" data-runtime-update>Actualizar</button>';
    } else if (rt.installed && !rt.devMode) {
      action = '<span class="row-status">LISTO</span><button class="secondary-mini" data-runtime-update data-runtime-reinstall>Reinstalar</button>';
    } else if (rt.installed) {
      action = '<span class="row-status">LISTO</span>';
    }
    const badge = rt.updateAvailable ? '<span class="update-badge">UPDATE</span>' : rt.installed ? '<span class="update-badge ready">OK</span>' : '';
    return `<article class="component-row runtime-component ${rt.installed ? 'installed' : ''} ${rt.updateAvailable ? 'needs-update' : ''}" data-component-id="python-mini"><div class="component-icon">${rt.installed ? '✓' : '·'}</div><div><strong>Python mini (motor) ${badge}</strong><p>${escapeHtml(detail)}</p></div><div class="component-actions">${action}</div></article>`;
  } catch (_) {
    return '';
  }
}

async function updateEngineRuntime(button) {
  if (!window.desktop?.engineRuntimeUpdate) return;
  const isReinstall = button.hasAttribute('data-runtime-reinstall');
  const confirmed = await confirmAction({
    title: isReinstall ? '¿Reinstalar el motor Python mini?' : '¿Actualizar el motor Python mini?',
    message: 'ClipDock descargará el motor de nuevo desde GitHub y se reiniciará su proceso interno.',
    detail: 'Los trabajos en curso se detendrán. Tus archivos y configuraciones no se tocan.',
    confirmText: isReinstall ? 'Reinstalar motor' : 'Actualizar motor',
    eyebrow: 'MOTOR INTERNO'
  });
  if (!confirmed) return;
  const actions = button.closest('.component-actions');
  if (actions) actions.innerHTML = '<span class="row-status" id="runtime-update-status">0%</span>';
  const result = await window.desktop.engineRuntimeUpdate();
  if (result?.ok) {
    toast('Motor actualizado. Recargando ClipDock…', 'ok', { title: 'Python mini listo' });
    setTimeout(() => location.reload(), 1200);
  } else {
    toast(result?.error || 'No se pudo actualizar el motor.', 'error');
    loadComponents();
  }
}

window.desktop?.onEngineRuntimeProgress?.((p) => {
  const status = document.getElementById('runtime-update-status');
  if (!status) return;
  const labels = { stop: 'Deteniendo…', download: 'Descargando', extract: 'Descomprimiendo Python…', install: 'Instalando…', restart: 'Reiniciando…', done: 'Listo' };
  const percent = typeof p.percent === 'number' ? `${p.percent}%` : '';
  status.textContent = ['download', 'extract'].includes(p.phase) && percent ? `${percent}` : (labels[p.phase] || percent || '…');
});

async function loadComponents() {
  try {
    const items = await api('/api/components');
    let hasActive = false;
    const root = items.find(item => item.root)?.root || 'Documentos/ClipDock/Componentes';
    const installedCount = items.filter(item => item.installed).length;
    const totalCount = items.filter(item => !item.root).length || items.length;
    const overviewComponents = $('#overview-components-status');
    if (overviewComponents) overviewComponents.textContent = `${installedCount}/${totalCount} listo(s)`;
    const rows = items.map(item => {
      const active = item.job && ['queued', 'running'].includes(item.job.state);
      const failed = item.job?.state === 'failed';
      const progress = Math.round(item.job?.progress?.percent || 0);
      const update = componentUpdateInfo[item.id];
      const updateAvailable = updateIsStillAvailable(item, update);
      if (active) hasActive = true;
      let action = '';
      if (item.installed) {
        const updateButton = updateAvailable ? `<button class="primary-mini update-mini" data-component-install="${escapeHtml(item.id)}">Actualizar</button>` : '<span class="row-status">LISTO</span>';
        action = `${updateButton}<button class="danger-mini" data-component-delete="${escapeHtml(item.id)}">Eliminar</button>`;
      } else if (active) {
        action = `<span class="row-status">${progress}%</span>`;
      } else {
        action = `<button class="primary-mini" data-component-install="${escapeHtml(item.id)}">${failed ? 'Reintentar' : 'Instalar'}</button>`;
      }
      const updateText = update
        ? update.checked
          ? updateAvailable
            ? `Actualización disponible: ${update.latestVersion || 'versión nueva'}`
            : item.installed
              ? `Al día${update.latestVersion ? ` · ${update.latestVersion}` : ''}`
              : 'No instalado'
          : `No se pudo consultar actualización: ${update.error || 'sin respuesta'}`
        : '';
      const versionText = item.installedVersion ? `Instalado: ${item.installedVersion}` : (item.installed ? 'Instalado: versión local sin registro' : '');
      const detail = active ? item.job.progress?.message : failed ? item.job.error : updateText || versionText || item.description;
      const updateBadge = updateAvailable ? '<span class="update-badge">UPDATE</span>' : update && item.installed ? '<span class="update-badge ready">OK</span>' : '';
      return `<article class="component-row ${item.installed ? 'installed' : ''} ${updateAvailable ? 'needs-update' : ''}" data-component-id="${escapeHtml(item.id)}"><div class="component-icon">${item.installed ? '✓' : active ? '↓' : '·'}</div><div><strong>${escapeHtml(item.name)} ${updateBadge}</strong><p>${escapeHtml(detail)}</p>${active ? `<div class="inline-progress"><i style="width:${progress}%"></i></div>` : ''}</div><div class="component-actions">${item.size ? `<span class="model-size">${formatBytes(item.size)}</span>` : ''}${action}</div></article>`;
    }).join('');
    reconcileUpdateInfo('components', items);
    const runtimeRow = await buildRuntimeComponentRow();
    $('#component-list').innerHTML = `<div class="model-root-note"><span>Carpeta</span><strong>${escapeHtml(root)}</strong></div>${runtimeRow}${rows}`;
    clearTimeout(componentRefreshTimer);
    if (hasActive) {
      componentWasActive = true;
      componentRefreshTimer = setTimeout(loadComponents, 900);
    } else if (componentWasActive) {
      componentWasActive = false;
      setTimeout(() => checkComponentUpdates(null, true), 250);
    }
  } catch (error) { $('#component-list').innerHTML = `<div class="settings-loading">${error.message}</div>`; }
}

async function checkComponentUpdates(button = null, silent = false) {
  const btn = button || (silent ? null : $('#check-component-updates'));
  if (btn) { btn.disabled = true; btn.textContent = 'Buscando…'; }
  try {
    const data = await api('/api/components/updates');
    componentUpdateInfo = Object.fromEntries((data.updates || []).map(item => [item.id, item]));
    const count = (data.updates || []).filter(item => item.updateAvailable).length;
    updateToolUpdateBadges(count, null);
    if (!silent) toast(count ? `${count} componente(s) con actualización disponible` : 'Componentes multimedia al día', count ? 'info' : 'ok', {
      title: 'Componentes revisados',
      actions: count ? [{ label: 'Abrir componentes', run: () => navigateToSettings('components') }] : []
    });
    loadComponents();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Buscar actualizaciones'; }
  }
}


async function checkStartupToolUpdates() {
  try {
    const [componentData, modelData] = await Promise.all([
      api('/api/components/updates'),
      api('/api/models/updates')
    ]);
    const componentUpdates = (componentData.updates || []).filter(item => item.updateAvailable);
    const modelUpdates = (modelData.updates || []).filter(item => item.updateAvailable);
    componentUpdateInfo = Object.fromEntries((componentData.updates || []).map(item => [item.id, item]));
    modelUpdateInfo = Object.fromEntries((modelData.updates || []).map(item => [item.id, item]));
    updateToolUpdateBadges(componentUpdates.length, modelUpdates.length);
    const total = componentUpdates.length + modelUpdates.length;
    if (!total) return;
    const parts = [];
    if (componentUpdates.length) parts.push(`${componentUpdates.length} motor(es) o componente(s)`);
    if (modelUpdates.length) parts.push(`${modelUpdates.length} modelo(s) de IA`);
    const actions = [];
    if (componentUpdates.length) actions.push({ label: `Componentes (${componentUpdates.length})`, run: () => navigateToSettings('components') });
    if (modelUpdates.length) actions.push({ label: `Modelos IA (${modelUpdates.length})`, run: () => navigateToSettings('models') });
    toast(`${parts.join(' y ')} con actualización disponible. Puedes entrar directo desde este aviso.`, 'info', {
      title: 'Actualizaciones de motores disponibles',
      key: 'startup-tool-updates',
      duration: 12000,
      actions,
      onClick: () => navigateToSettings(componentUpdates.length ? 'components' : 'models')
    });
  } catch (error) {
    console.warn('No se pudieron consultar actualizaciones de motores/modelos al iniciar:', error);
  }
}


function startupUpdateTitle(payload = startupUpdatePayload) {
  if (!payload) return 'Actualizaciones disponibles';
  if (payload.app?.updateAvailable) return `ClipDock v${payload.app.latestVersion} disponible`;
  const total = (payload.plugins?.length || 0) + (payload.components?.length || 0) + (payload.models?.length || 0) + (payload.runtime?.updateAvailable ? 1 : 0);
  return `${total} actualización${total === 1 ? '' : 'es'} disponible${total === 1 ? '' : 's'}`;
}

function closeStartupUpdateModal() {
  if (startupUpdateBusy) return;
  $('#startup-update-modal')?.classList.add('hidden');
}

function setStartupUpdateStatus(message = '', percent = null) {
  const status = $('#startup-update-status');
  const bar = $('#startup-update-progress-bar');
  if (status) status.textContent = message;
  if (bar && percent !== null) bar.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
}

function setStartupUpdateBusy(value) {
  startupUpdateBusy = Boolean(value);
  $('#startup-update-action')?.toggleAttribute('disabled', startupUpdateBusy);
  $('#startup-update-later')?.toggleAttribute('disabled', startupUpdateBusy);
  $('#startup-update-close')?.toggleAttribute('disabled', startupUpdateBusy);
  $('#startup-update-modal')?.classList.toggle('is-busy', startupUpdateBusy);
  $('#startup-update-modal .startup-update-card')?.classList.toggle('is-busy', startupUpdateBusy);
}

function updateNamesList(items = [], limit = 3) {
  const names = items.map(item => item.name || item.label || item.id).filter(Boolean);
  if (!names.length) return '';
  const visible = names.slice(0, limit).join(', ');
  const rest = names.length - limit;
  return rest > 0 ? `${visible} y ${rest} más` : visible;
}

function renderStartupUpdateModal(payload) {
  startupUpdatePayload = payload;
  const modal = $('#startup-update-modal');
  if (!modal) return;
  const appUpdate = payload.app?.updateAvailable;
  const pluginCount = payload.plugins?.length || 0;
  const componentCount = payload.components?.length || 0;
  const modelCount = payload.models?.length || 0;
  const runtimeUpdate = Boolean(payload.runtime?.updateAvailable);
  const totalSecondary = pluginCount + componentCount + modelCount + (runtimeUpdate ? 1 : 0);
  const list = [];
  if (appUpdate) {
    list.push(`<li class="priority"><span>1</span><div><strong>Programa principal</strong><small>ClipDock ${payload.app.currentVersion || ''} → ${payload.app.latestVersion}. Esta actualización tiene prioridad y se instalará primero.</small></div></li>`);
  }
  if (pluginCount) list.push(`<li><span>${appUpdate ? '2' : '✓'}</span><div><strong>Complementos</strong><small>${pluginCount} complemento${pluginCount === 1 ? '' : 's'} con update: ${escapeHtml(updateNamesList(payload.plugins))}. Se actualizarán juntos cuando no haya update del programa pendiente.</small></div></li>`);
  if (componentCount) list.push(`<li><span>↻</span><div><strong>Componentes multimedia</strong><small>${componentCount} componente${componentCount === 1 ? '' : 's'} con update: ${escapeHtml(updateNamesList(payload.components))}.</small></div></li>`);
  if (modelCount) list.push(`<li><span>IA</span><div><strong>Modelos de IA</strong><small>${modelCount} modelo${modelCount === 1 ? '' : 's'} con update: ${escapeHtml(updateNamesList(payload.models))}.</small></div></li>`);
  if (runtimeUpdate) list.push(`<li><span>Py</span><div><strong>Motor interno</strong><small>Python mini ${payload.runtime.installedVersion || ''} → ${payload.runtime.expectedVersion || ''}.</small></div></li>`);

  $('#startup-update-title').textContent = startupUpdateTitle(payload);
  $('#startup-update-message').textContent = appUpdate
    ? 'Hay una actualización del programa. Por seguridad y estabilidad, ClipDock actualizará primero la app; al abrirse de nuevo volverá a revisar complementos y demás paquetes.'
    : 'Hay actualizaciones disponibles. Se recomienda instalarlas para evitar errores de funcionamiento, incompatibilidades o riesgos de seguridad.';
  $('#startup-update-list').innerHTML = list.join('');
  $('#startup-update-detail').textContent = appUpdate && totalSecondary
    ? `También hay ${totalSecondary} update${totalSecondary === 1 ? '' : 's'} adicional${totalSecondary === 1 ? '' : 'es'}, pero se dejarán para el siguiente arranque después de reinstalar ClipDock.`
    : 'Puedes cerrar este aviso y seguir trabajando; el aviso queda registrado visualmente para el usuario.';
  $('#startup-update-action span').textContent = appUpdate ? 'Actualizar ClipDock' : 'Actualizar todo';
  setStartupUpdateStatus(appUpdate ? 'Prioridad: programa principal.' : 'Listo para actualizar complementos y paquetes pendientes.', 0);
  setStartupUpdateBusy(false);
  modal.classList.remove('hidden');
}

async function collectStartupUpdates() {
  const payload = { app: null, plugins: [], components: [], models: [], runtime: null, errors: [] };

  const appResult = await Promise.allSettled([window.desktop?.checkUpdates?.()]);
  const appInfo = appResult[0]?.status === 'fulfilled' ? appResult[0].value : null;
  if (appResult[0]?.status === 'rejected') payload.errors.push(appResult[0].reason?.message || String(appResult[0].reason));
  if (appInfo) {
    payload.app = appInfo;
    window.latestUpdateInfo = appInfo;
    window.updateRepoUrl = appInfo.repoUrl || appInfo.releaseUrl || appInfo.feedUrl || '';
    $('#sidebar-version')?.classList.toggle('has-update', Boolean(appInfo.updateAvailable));
    $('#sidebar-version')?.setAttribute('title', appInfo.updateAvailable ? `Actualización disponible v${appInfo.latestVersion}` : 'Ver actualizaciones');
    if ($('#overview-update-status')) $('#overview-update-status').textContent = appInfo.updateAvailable ? `Disponible v${appInfo.latestVersion}` : (appInfo.disabled ? 'Sin feed' : 'Al día');
    if ($('#update-status')) $('#update-status').textContent = appInfo.updateAvailable ? `Disponible v${appInfo.latestVersion}` : (appInfo.message || 'ClipDock está actualizado');
    $('#install-update')?.classList.toggle('hidden', !appInfo.updateAvailable);
    if ($('#github-repo-label')) $('#github-repo-label').textContent = appInfo.githubRepo || appInfo.repoUrl || 'Pendiente';
  }

  const [pluginsResult, componentsResult, modelsResult, runtimeResult] = await Promise.allSettled([
    window.desktop?.listPlugins?.(),
    api('/api/components/updates'),
    api('/api/models/updates'),
    window.desktop?.engineRuntimeStatus?.()
  ]);

  if (pluginsResult.status === 'fulfilled' && pluginsResult.value) {
    pluginCatalogMeta = pluginsResult.value || {};
    pluginCatalog = Array.isArray(pluginsResult.value.plugins) ? pluginsResult.value.plugins : [];
    payload.plugins = pluginCatalog.filter(item => item.updateAvailable);
    renderPlugins();
  } else if (pluginsResult.status === 'rejected') payload.errors.push(pluginsResult.reason?.message || String(pluginsResult.reason));

  if (componentsResult.status === 'fulfilled') {
    const updates = componentsResult.value?.updates || [];
    componentUpdateInfo = Object.fromEntries(updates.map(item => [item.id, item]));
    payload.components = updates.filter(item => item.updateAvailable);
  } else payload.errors.push(componentsResult.reason?.message || String(componentsResult.reason));

  if (modelsResult.status === 'fulfilled') {
    const updates = modelsResult.value?.updates || [];
    modelUpdateInfo = Object.fromEntries(updates.map(item => [item.id, item]));
    payload.models = updates.filter(item => item.updateAvailable);
  } else payload.errors.push(modelsResult.reason?.message || String(modelsResult.reason));

  if (runtimeResult.status === 'fulfilled') payload.runtime = runtimeResult.value || null;
  else payload.errors.push(runtimeResult.reason?.message || String(runtimeResult.reason));

  updateToolUpdateBadges(payload.components.length, payload.models.length);
  return payload;
}

async function checkStartupUpdateCenter() {
  try {
    const payload = await collectStartupUpdates();
    const hasUpdates = Boolean(payload.app?.updateAvailable || payload.plugins.length || payload.components.length || payload.models.length || payload.runtime?.updateAvailable);
    if (hasUpdates) renderStartupUpdateModal(payload);
  } catch (error) {
    console.warn('No se pudo completar la revisión automática de actualizaciones:', error);
  }
}

async function runStartupUpdateAction() {
  const payload = startupUpdatePayload;
  if (!payload || startupUpdateBusy) return;
  setStartupUpdateBusy(true);
  try {
    if (payload.app?.updateAvailable) {
      setStartupUpdateStatus('Descargando actualización principal de ClipDock…', 4);
      await window.desktop.downloadUpdate(payload.app);
      return;
    }

    let steps = 0;
    const totalSteps = (payload.plugins.length ? 1 : 0) + payload.components.length + payload.models.length + (payload.runtime?.updateAvailable ? 1 : 0);
    const advance = message => {
      steps += 1;
      setStartupUpdateStatus(message, totalSteps ? Math.round((steps / totalSteps) * 96) : 100);
    };

    if (payload.plugins.length) {
      setStartupUpdateStatus(`Actualizando ${payload.plugins.length} complemento${payload.plugins.length === 1 ? '' : 's'}…`, 10);
      const result = await window.desktop.installPluginUpdates();
      const failed = (result?.results || []).filter(item => !item.ok);
      if (failed.length) toast(`Algunos complementos no pudieron actualizarse (${failed.length}).`, 'error');
      advance('Complementos actualizados.');
    }

    for (const item of payload.components) {
      await api(`/api/components/${encodeURIComponent(item.id)}/install`, { method: 'POST', body: '{}' });
      advance(`Componente iniciado: ${item.name || item.id}`);
    }

    for (const item of payload.models) {
      await api(`/api/models/${encodeURIComponent(item.id)}/download`, { method: 'POST', body: '{}' });
      advance(`Modelo iniciado: ${item.name || item.id}`);
    }

    if (payload.runtime?.updateAvailable) {
      setStartupUpdateStatus('Actualizando motor interno…', 94);
      const result = await window.desktop.engineRuntimeUpdate();
      if (!result?.ok) throw new Error(result?.error || 'No se pudo actualizar el motor interno.');
      advance('Motor interno actualizado.');
    }

    setStartupUpdateStatus('Actualizaciones iniciadas correctamente.', 100);
    toast('Actualizaciones aplicadas o iniciadas correctamente.', 'ok');
    await Promise.allSettled([loadPlugins(), loadComponents(), loadModels()]);
    setTimeout(() => { setStartupUpdateBusy(false); closeStartupUpdateModal(); }, 900);
  } catch (error) {
    setStartupUpdateStatus(error.message || 'No se pudo completar la actualización.', 0);
    toast(error.message || 'No se pudo actualizar.', 'error');
    setStartupUpdateBusy(false);
  }
}

async function loadModels() {
  try {
    const items = await api('/api/models');
    let hasActive = false;
    const root = items.find(item => item.root)?.root || 'Documentos/ClipDock/Modelos';
    const installedCount = items.filter(item => item.installed).length;
    const totalCount = items.filter(item => !item.root).length || items.length;
    const overviewModels = $('#overview-models-status');
    if (overviewModels) overviewModels.textContent = `${installedCount}/${totalCount} listo(s)`;
    const rows = items.map(item => {
      const active = item.job && ['queued', 'running'].includes(item.job.state);
      const failed = item.job?.state === 'failed';
      const progress = Math.round(item.job?.progress?.percent || 0);
      const update = modelUpdateInfo[item.id];
      const updateAvailable = updateIsStillAvailable(item, update);
      if (active) hasActive = true;
      const versionText = item.installedVersion ? `Instalado: ${item.installedVersion}` : (item.installed ? 'Instalado: versión local sin registro' : '');
      const updateText = update
        ? updateAvailable
          ? `Actualización disponible: ${update.latestVersion || 'versión nueva'}`
          : item.installed
            ? `Al día${update.latestVersion ? ` · ${update.latestVersion}` : ''}`
            : 'No instalado'
        : '';
      const description = active ? item.job.progress?.message : failed ? item.job.error : updateText || versionText || `${item.group} · ${item.description}`;
      let action = '';
      if (item.installed) {
        action = `${updateAvailable ? `<button class="primary-mini update-mini" data-model-download="${escapeHtml(item.id)}">Actualizar</button>` : '<span class="row-status">LISTO</span>'}<button class="danger-mini" data-model-delete="${escapeHtml(item.id)}">Eliminar</button>`;
      } else if (active) {
        action = `<span class="row-status">${progress}%</span>`;
      } else {
        action = `<button class="primary-mini" data-model-download="${escapeHtml(item.id)}">${failed ? 'Reintentar' : 'Instalar'}</button>`;
      }
      const updateBadge = updateAvailable ? '<span class="update-badge">UPDATE</span>' : update && item.installed ? '<span class="update-badge ready">OK</span>' : '';
      return `<article class="model-row ${item.installed ? 'installed' : ''} ${updateAvailable ? 'needs-update' : ''}" data-model-id="${escapeHtml(item.id)}"><div class="model-icon">${item.installed ? '✓' : active ? '↓' : '✦'}</div><div><strong>${escapeHtml(item.name)} ${updateBadge}</strong><p>${escapeHtml(description)}</p>${active ? `<div class="inline-progress"><i style="width:${progress}%"></i></div>` : ''}</div><div class="model-actions">${item.size ? `<span class="model-size">${formatBytes(item.size)}</span>` : ''}${action}</div></article>`;
    }).join('');
    reconcileUpdateInfo('models', items);
    $('#model-list').innerHTML = `<div class="model-root-note"><span>Carpeta</span><strong>${escapeHtml(root)}</strong></div>${rows}`;
    clearTimeout(modelRefreshTimer);
    if (hasActive) {
      modelWasActive = true;
      modelRefreshTimer = setTimeout(loadModels, 900);
    } else if (modelWasActive) {
      modelWasActive = false;
      setTimeout(() => checkModelUpdates(null, true), 250);
    }
  } catch (error) { $('#model-list').innerHTML = `<div class="settings-loading">${error.message}</div>`; }
}

async function checkModelUpdates(button = null, silent = false) {
  const btn = button || (silent ? null : $('#check-model-updates'));
  if (btn) { btn.disabled = true; btn.textContent = 'Buscando…'; }
  try {
    const data = await api('/api/models/updates');
    modelUpdateInfo = Object.fromEntries((data.updates || []).map(item => [item.id, item]));
    const count = (data.updates || []).filter(item => item.updateAvailable).length;
    updateToolUpdateBadges(null, count);
    if (!silent) toast(count ? `${count} modelo(s) con actualización disponible` : 'Modelos de IA al día', count ? 'info' : 'ok', {
      title: 'Modelos revisados',
      actions: count ? [{ label: 'Abrir modelos IA', run: () => navigateToSettings('models') }] : []
    });
    loadModels();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Buscar actualizaciones'; }
  }
}

async function installComponent(componentId, button) {
  button.disabled = true; button.textContent = 'Iniciando…';
  try {
    await api(`/api/components/${componentId}/install`, { method: 'POST', body: '{}' });
    toast('Instalación/actualización iniciada; al terminar aparecerá LISTO automáticamente');
    loadComponents();
  } catch (error) { toast(error.message, 'error'); button.disabled = false; button.textContent = 'Reintentar'; }
}

async function deleteComponent(componentId) {
  const label = componentLabels[componentId] || componentId;
  if (!await confirmAction({ title: `¿Eliminar ${label}?`, message: 'Se quitarán los archivos instalados de este componente.', detail: 'No perderás tus proyectos ni configuraciones. Si vuelve a hacer falta, podrás reinstalarlo aquí con un solo clic.', confirmText: 'Eliminar componente', eyebrow: 'LIBERAR ESPACIO', danger: true })) return;
  try { await api(`/api/components/${componentId}/delete`, { method: 'POST', body: '{}' }); toast('Componente eliminado'); loadComponents(); }
  catch (error) { toast(error.message, 'error'); }
}

async function installModel(modelId, button) {
  button.disabled = true; button.textContent = 'Iniciando…';
  try { await api(`/api/models/${modelId}/download`, { method: 'POST', body: '{}' }); toast('Instalación/actualización iniciada; al terminar aparecerá LISTO automáticamente'); loadModels(); }
  catch (error) { toast(error.message, 'error'); button.disabled = false; button.textContent = 'Reintentar'; }
}

async function deleteModel(modelId) {
  if (!await confirmAction({ title: '¿Eliminar este modelo de IA?', message: 'El modelo dejará de estar disponible para los procesos que lo utilizan.', detail: 'Tus imágenes y resultados no se borrarán. Puedes descargar el modelo nuevamente cuando quieras.', confirmText: 'Eliminar modelo', eyebrow: 'LIBERAR ESPACIO', danger: true })) return;
  try { await api(`/api/models/${modelId}/delete`, { method: 'POST', body: '{}' }); toast('Modelo eliminado'); loadModels(); }
  catch (error) { toast(error.message, 'error'); }
}



function selectedRuntimeSetupProfile() {
  return localStorage.getItem(RUNTIME_SETUP_KEY) || 'recommended';
}

function setSetupRepairProgress(percent = 0, message = '') {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0));
  const progress = $('#setup-repair-progress');
  const bar = $('#setup-repair-progress-bar');
  const status = $('#setup-repair-status');
  if (progress) progress.classList.toggle('hidden', !message);
  if (bar) bar.style.width = `${safe}%`;
  if (status && message) status.textContent = message;
}

async function loadSetupRepairStatus() {
  const card = $('#setup-repair-card');
  if (!card) return;
  const profileId = selectedRuntimeSetupProfile();
  try {
    const data = await api(`/api/runtime/setup-status?profile=${encodeURIComponent(profileId)}`);
    const profile = data.profile || { label: RUNTIME_SETUP_LABELS[profileId] || profileId, id: profileId };
    const state = data.state || { total: 0, ready: [], missing: [] };
    const ready = state.ready?.length || 0;
    const missing = state.missing?.length || 0;
    const total = state.total || ready + missing;
    const missingText = missing ? ` · faltan ${missing}` : ' · completo';
    const overviewProfile = $('#overview-profile-status');
    if (overviewProfile) overviewProfile.textContent = `${profile.label} · ${ready}/${total}`;
    $('#setup-repair-summary').textContent = `Perfil elegido: ${profile.label} · ${ready}/${total} listo(s)${missingText}`;
    $('#setup-repair-log').textContent = data.lastLogPath ? `Último log: ${data.lastLogPath}` : `Logs: ${data.logsRoot || 'Documentos/ClipDock/Logs/Setup'}`;
    if (!$('#setup-repair-status')?.textContent || $('#setup-repair-status')?.textContent.includes('Leyendo')) {
      $('#setup-repair-status').textContent = missing ? 'Hay componentes pendientes. Usa Reparar perfil para instalarlos.' : 'El perfil elegido ya está completo.';
    }
  } catch (error) {
    $('#setup-repair-summary').textContent = 'No se pudo leer el estado de la preparación inicial.';
    $('#setup-repair-log').textContent = error.message || 'Error leyendo logs';
  }
}

async function pollSetupRepairJob(profileId, jobId) {
  window.clearTimeout(setupRepairPollTimer);
  while (jobId) {
    await new Promise(resolve => { setupRepairPollTimer = window.setTimeout(resolve, 850); });
    const job = await api(`/api/jobs/${jobId}`);
    const progress = job.progress || {};
    setSetupRepairProgress(progress.percent || 0, progress.message || 'Reparando perfil…');
    if (progress.details?.logPath) {
      localStorage.setItem('clipdockRuntimeSetupLastLog', progress.details.logPath);
      const log = $('#setup-repair-log');
      if (log) log.textContent = `Último log: ${progress.details.logPath}`;
    }
    if (job.state === 'completed') {
      setSetupRepairProgress(100, progress.message || 'Perfil reparado.');
      toast('Perfil reparado correctamente', 'ok');
      await Promise.allSettled([loadComponents(), loadModels(), loadSetupRepairStatus()]);
      return;
    }
    if (['failed', 'cancelled'].includes(job.state)) {
      throw new Error(job.error || 'No se pudo reparar el perfil');
    }
  }
}

async function repairRuntimeSetupProfile(button = null) {
  const profileId = selectedRuntimeSetupProfile();
  const label = RUNTIME_SETUP_LABELS[profileId] || profileId;
  if (button) { button.disabled = true; button.textContent = 'Reparando…'; }
  setSetupRepairProgress(0, `Revisando perfil ${label}…`);
  try {
    const response = await api('/api/runtime/setup', { method: 'POST', body: JSON.stringify({ profile: profileId }) });
    const jobId = response.jobId || response.job?.id;
    if (!jobId) throw new Error('No se pudo iniciar la reparación del perfil');
    await pollSetupRepairJob(profileId, jobId);
  } catch (error) {
    setSetupRepairProgress(100, error.message || 'No se pudo reparar el perfil.');
    toast(error.message || 'No se pudo reparar el perfil', 'error');
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Reparar perfil'; }
  }
}

async function openSetupLogsFolder() {
  try {
    const data = await api('/api/runtime/setup-logs-folder', { method: 'POST', body: '{}' });
    if (data.path) window.desktop?.openPath?.(data.path);
  } catch (error) { toast(error.message || 'No se pudieron abrir los logs', 'error'); }
}

async function openLastSetupLog() {
  try {
    const data = await api('/api/runtime/setup-last-log', { method: 'POST', body: '{}' });
    if (data.exists && data.path) {
      window.desktop?.openPath?.(data.path);
      return;
    }
    if (data.path) window.desktop?.openPath?.(data.path);
    toast('Todavía no hay log de setup; abrí la carpeta de logs.', 'info');
  } catch (error) { toast(error.message || 'No se pudo abrir el último log', 'error'); }
}


function pluginLabel(plugin) {
  const category = String(plugin.category || plugin.type || '').toLowerCase();
  if (category === 'adobe') return 'Adobe';
  if (category === 'ai') return 'IA';
  if (category === 'clipdock') return 'ClipDock';
  if (category === 'utility') return 'Utilidad';
  return category ? category.toUpperCase() : 'Plugin';
}

function pluginIcon(plugin) {
  const category = String(plugin.category || plugin.type || '').toLowerCase();
  if (category === 'adobe') return 'Pr';
  if (category === 'ai') return 'AI';
  if (category === 'utility') return '⚙';
  return '＋';
}
// Color "normal" (no ligado al acento) para el icono de respaldo de un complemento
// que no trae su propio logo. Así no se ve verde cuando el acento es rosa.
function pluginIconColor(plugin) {
  const category = String(plugin.category || plugin.type || '').toLowerCase();
  if (category === 'adobe') return '#b98bff';
  if (category === 'ai') return '#5ecfa6';
  if (category === 'utility') return '#ffb454';
  const key = String(plugin.id || plugin.name || '');
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const palette = ['#6aa9ff', '#ffb454', '#b98bff', '#5ecfa6', '#ff8f8f', '#57c8e6'];
  return palette[hash % palette.length];
}

function pluginMatches(plugin) {
  const text = `${plugin.name || ''} ${plugin.summary || ''} ${plugin.description || ''} ${(plugin.tags || []).join(' ')} ${(plugin.host || []).join(' ')}`.toLowerCase();
  const query = ($('#plugin-search')?.value || '').trim().toLowerCase();
  const category = String(plugin.category || '').toLowerCase();
  if (query && !text.includes(query)) return false;
  if (pluginFilter === 'installed') return Boolean(plugin.installed);
  if (pluginFilter === 'updates') return Boolean(plugin.updateAvailable);
  if (pluginFilter !== 'all' && category !== pluginFilter) return false;
  return true;
}


function isOfficialClipDockPlugin(plugin) {
  const text = `${plugin?.id || ''} ${plugin?.name || ''}`.toLowerCase();
  return text.includes('clipdock remote') || text.includes('clipdock-remote') || text.includes('clipdock_remote');
}

function officialClipDockPlugin() {
  return (pluginCatalog || []).find(isOfficialClipDockPlugin) || null;
}

let pendingOfficialPluginFocus = false;

const OFFICIAL_PLUGIN_NOTICE_DISMISSED_KEY = 'clipdockOfficialPluginNoticeDismissed';

function isOfficialPluginNoticeDismissed() {
  try { return localStorage.getItem(OFFICIAL_PLUGIN_NOTICE_DISMISSED_KEY) === '1'; }
  catch (_) { return false; }
}

function setOfficialPluginNoticeDismissed(value) {
  try {
    if (value) localStorage.setItem(OFFICIAL_PLUGIN_NOTICE_DISMISSED_KEY, '1');
    else localStorage.removeItem(OFFICIAL_PLUGIN_NOTICE_DISMISSED_KEY);
  } catch (_) {}
}

function dismissOfficialPluginNotice() {
  setOfficialPluginNoticeDismissed(true);
  updatePluginWelcomeNotice();
}


function focusOfficialPluginCard() {
  const plugin = officialClipDockPlugin();
  if (!plugin) return;
  const card = document.querySelector(`.plugin-card[data-plugin-id="${CSS.escape(plugin.id)}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.remove('welcome-spotlight');
  void card.offsetWidth;
  card.classList.add('welcome-spotlight');
  setTimeout(() => card.classList.remove('welcome-spotlight'), 3400);
}

function updatePluginWelcomeNotice() {
  const notice = $('#sidebar-plugin-welcome');
  if (!notice) return;
  const plugin = officialClipDockPlugin();
  const dismissed = isOfficialPluginNoticeDismissed();
  const show = Boolean(plugin && !plugin.installed && !dismissed);
  notice.classList.toggle('hidden', !show);
  if (!show) return;
  notice.dataset.pluginId = plugin.id;
}

function openOfficialPluginWelcome() {
  pendingOfficialPluginFocus = true;
  pluginFilter = 'all';
  const search = $('#plugin-search');
  if (search) search.value = '';
  switchView('plugins');
  setTimeout(() => focusOfficialPluginCard(), 450);
}

function resolveShareReleaseUrl() {
  return 'https://depsoniac.github.io/ClipDock/';
}
async function copyShareReleaseUrl() {
  const url = resolveShareReleaseUrl();
  try {
    if (window.desktop?.writeClipboard) {
      await window.desktop.writeClipboard(url);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      throw new Error('clipboard-unavailable');
    }
    toast('Link de la página copiado. Ya puedes compartir ClipDock.', 'ok', { title: 'Compartir ClipDock' });
  } catch (_) {
    toast(`No se pudo copiar automáticamente. Usa este link: ${url}`, 'info', { title: 'Compartir ClipDock' });
  }
}

const DOWP_EASTER_SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'Enter'];
let dowpEasterIndex = 0;

function normalizeDowpEasterKey(event) {
  if (event.key === 'Enter') return 'Enter';
  if (event.key?.startsWith('Arrow')) return event.key;
  return String(event.key || '').toLowerCase();
}

function isTypingTarget(target) {
  const tag = target?.tagName?.toLowerCase?.() || '';
  return target?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
}

function openDowpEasterEgg() {
  const modal = $('#dowp-easter-modal');
  const video = $('#dowp-easter-video');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('dowp-easter-open');
  if (video) {
    try { video.currentTime = 0; } catch (_) {}
    const play = video.play?.();
    if (play?.catch) play.catch(() => {});
  }
}

function closeDowpEasterEgg() {
  const modal = $('#dowp-easter-modal');
  const video = $('#dowp-easter-video');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('dowp-easter-open');
  if (video) {
    try { video.pause(); video.currentTime = 0; } catch (_) {}
  }
}

function handleDowpEasterKey(event) {
  if (event.key === 'Escape' && !$('#dowp-easter-modal')?.classList.contains('hidden')) {
    closeDowpEasterEgg();
    return;
  }
  if (isTypingTarget(event.target)) return;
  const key = normalizeDowpEasterKey(event);
  const expected = DOWP_EASTER_SEQUENCE[dowpEasterIndex];
  if (key === expected) {
    dowpEasterIndex += 1;
    if (dowpEasterIndex >= DOWP_EASTER_SEQUENCE.length) {
      dowpEasterIndex = 0;
      openDowpEasterEgg();
    }
    return;
  }
  dowpEasterIndex = key === DOWP_EASTER_SEQUENCE[0] ? 1 : 0;
}

function renderPlugins() {
  const list = $('#plugin-catalog-list');
  if (!list) return;
  const items = (pluginCatalog || []).filter(pluginMatches);
  if (!items.length) {
    list.innerHTML = '<div class="plugin-empty"><strong>No encontré complementos con ese filtro</strong><span>Prueba con Todos o borra la búsqueda.</span></div>';
    return;
  }
  list.innerHTML = items.map(plugin => {
    const rawTags = [pluginLabel(plugin), plugin.version ? `v${plugin.version}` : '', ...(plugin.host || []), ...(plugin.tags || []).slice(0, 2)].filter(Boolean);
    const tags = [...new Set(rawTags)].filter(tag => !['Premiere Pro', 'Premiere'].includes(String(tag)));
    const sameVersionPackageUpdate = plugin.updateAvailable && plugin.updateReason === 'package';
    const status = plugin.retired
      ? `Retirado del catálogo${plugin.installedVersion ? ` · instalado <b>v${escapeHtml(plugin.installedVersion)}</b>` : ''}`
      : plugin.installed
        ? plugin.updateAvailable
          ? sameVersionPackageUpdate
            ? `Actualización disponible: paquete nuevo en el store · <b>v${escapeHtml(plugin.latestVersion || plugin.version || plugin.installedVersion || '?')}</b>`
            : `Actualización disponible: <b>v${escapeHtml(plugin.installedVersion || '?')}</b> → <b>v${escapeHtml(plugin.latestVersion || plugin.version || '?')}</b>`
          : `Instalado <b>v${escapeHtml(plugin.installedVersion || plugin.version || '')}</b>`
        : plugin.available
          ? 'Disponible para instalar'
          : 'Pendiente de publicar en GitHub Releases';
    const isOfficial = isOfficialClipDockPlugin(plugin);
    const primaryText = plugin.installed ? (plugin.updateAvailable ? 'Actualizar' : 'Reinstalar') : (isOfficial ? 'Instalar oficial' : 'Instalar');
    const disabled = plugin.available ? '' : ' disabled';
    const bannerHtml = plugin.bannerUrl
      ? `<div class="plugin-banner" style="background-image:url('${escapeHtml(plugin.bannerUrl)}')"></div>`
      : '';
    const logoHtml = plugin.logoUrl
      ? `<img src="${escapeHtml(plugin.logoUrl)}" alt="" loading="lazy" onerror="this.remove()">`
      : escapeHtml(pluginIcon(plugin));
    return `<article class="plugin-card ${plugin.installed ? 'installed' : ''} ${plugin.updateAvailable ? 'update' : ''} ${plugin.bannerUrl ? 'has-banner' : ''} ${isOfficial ? 'official-plugin' : ''}" data-plugin-id="${escapeHtml(plugin.id)}">
      ${bannerHtml}
      <button class="plugin-corner-action" data-plugin-location="${escapeHtml(plugin.id)}" title="Abrir ubicación" aria-label="Abrir ubicación">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h5l1.7 2H20a1 1 0 0 1 1 1v7.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8.5a2 2 0 0 1 2-2Z"/><path d="M3.5 10.5h17"/></svg>
      </button>
      <div class="plugin-icon${plugin.logoUrl ? '' : ' plugin-icon-fallback'}"${plugin.logoUrl ? '' : ` style="--chip:${pluginIconColor(plugin)}"`}>${logoHtml}</div>
      <div>
        <h3>${escapeHtml(plugin.name)} ${isOfficial ? '<span class="plugin-official-pill">OFICIAL</span>' : ''} ${plugin.updateAvailable ? '<span class="plugin-update-pill">UPDATE</span>' : ''}</h3>
        <p>${escapeHtml(plugin.description || plugin.summary || '')}</p>
        <div class="plugin-meta">${tags.map((tag, index) => `<span class="${plugin.installed && index === 0 ? 'ready' : ''}">${escapeHtml(tag)}</span>`).join('')}</div>
        ${isOfficial && !plugin.installed ? '<div class="plugin-official-copy">Extensión oficial de ClipDock para Adobe. Recomendado para empezar.</div>' : ''}
        <div class="plugin-status">${status}</div>
      </div>
      <div class="plugin-actions">
        <div class="plugin-actions-left">
          ${plugin.retired ? '' : `<button class="primary ${isOfficial ? 'official-install-button' : ''}" data-plugin-install="${escapeHtml(plugin.id)}"${disabled}>${primaryText}</button>`}
          ${plugin.installed || plugin.retired ? `<button class="danger" data-plugin-uninstall="${escapeHtml(plugin.id)}">Desinstalar</button>` : ''}
        </div>
      </div>
    </article>`;
  }).join('');
}

// Badge de updates de complementos en el menú lateral.
function updatePluginNavBadge(count, mode = 'updates') {
  const navItem = document.querySelector('.nav-item[data-view="plugins"]');
  if (!navItem) return;
  let badge = navItem.querySelector('.plugin-nav-badge');
  if (!count) { badge?.remove(); return; }
  if (!badge) {
    badge = document.createElement('b');
    badge.className = 'plugin-nav-badge';
    navItem.appendChild(badge);
  }
  badge.textContent = count;
  badge.classList.toggle('welcome', mode === 'welcome');
}

// Al abrir la app se consulta el catálogo remoto (listPlugins ya refresca
// desde GitHub): si subiste un zip nuevo con versión mayor en su plugin.json,
// aquí se detecta y se avisa sin que el usuario entre a Complementos.
async function checkPluginUpdatesOnBoot() {
  try {
    if (!window.desktop?.listPlugins) return;
    const data = await window.desktop.listPlugins();
    const plugins = data?.plugins || [];
    pluginCatalogMeta = data || pluginCatalogMeta || {};
    if (!pluginCatalog.length) pluginCatalog = Array.isArray(plugins) ? plugins : [];
    const official = plugins.find(isOfficialClipDockPlugin);
    if (official?.installed) setOfficialPluginNoticeDismissed(false);
    const updates = plugins.filter(item => item.updateAvailable);
    updatePluginNavBadge(official && !official.installed ? 1 : updates.length, official && !official.installed ? 'welcome' : 'updates');
    updatePluginWelcomeNotice();
    if (updates.length) {
      const names = updates.slice(0, 3).map(item => item.name).join(', ');
      toast(`Actualización disponible: ${names}${updates.length > 3 ? '…' : ''}`, 'info', {
        title: `Complemento${updates.length === 1 ? '' : 's'} con versión nueva`
      });
    }
  } catch (_) {}
}
setTimeout(checkPluginUpdatesOnBoot, 1800);

async function loadPlugins() {
  const list = $('#plugin-catalog-list');
  if (!list || !window.desktop?.listPlugins) return;
  list.innerHTML = '<div class="settings-loading">Cargando escaparate…</div>';
  try {
    const data = await window.desktop.listPlugins();
    pluginCatalogMeta = data || {};
    pluginCatalog = Array.isArray(data.plugins) ? data.plugins : [];
    const updateCount = pluginCatalog.filter(item => item.updateAvailable).length;
    const official = officialClipDockPlugin();
    if (official?.installed) setOfficialPluginNoticeDismissed(false);
    const showOfficialWelcome = Boolean(official && !official.installed);
    updatePluginNavBadge(showOfficialWelcome ? 1 : updateCount, showOfficialWelcome ? 'welcome' : 'updates');
    updatePluginWelcomeNotice();
    const updateAllButton = $('#update-all-plugins');
    if (updateAllButton) {
      updateAllButton.classList.toggle('hidden', updateCount < 1);
      updateAllButton.textContent = updateCount > 1 ? `Actualizar ${updateCount}` : 'Actualizar 1';
    }
    const meta = $('#plugin-catalog-meta');
    if (meta) {
      const source = data.registryMode === 'folder-manifest-registry'
        ? 'registro remoto por carpetas'
        : data.registryMode === 'folder-manifest-registry-local'
          ? 'registro por carpetas incluido'
        : data.remote
          ? 'catálogo remoto'
          : data.override
            ? 'catálogo personalizado'
            : data.sourcePath
              ? 'catálogo incluido'
              : 'catálogo de respaldo';
      const fetched = data.remoteFetchedAt ? ` · actualizado ${new Date(data.remoteFetchedAt).toLocaleString()}` : '';
      const updates = updateCount ? ` · ${updateCount} update${updateCount === 1 ? '' : 's'}` : ' · sin updates';
      meta.textContent = `${pluginCatalog.length} complemento${pluginCatalog.length === 1 ? '' : 's'} · ${source}${fetched}${updates}`;
      meta.title = data.remoteUrl || data.sourcePath || '';
    }
    renderPlugins();
    if (pendingOfficialPluginFocus) {
      pendingOfficialPluginFocus = false;
      requestAnimationFrame(() => setTimeout(focusOfficialPluginCard, 140));
    }
    if (data.remoteError) toast(`Catálogo remoto con aviso: ${data.remoteError}`, 'info');
    if (data.error) toast(`Catálogo local con aviso: ${data.error}`, 'info');
  } catch (error) {
    list.innerHTML = `<div class="plugin-empty"><strong>No se pudo leer el catálogo</strong><span>${escapeHtml(error.message)}</span></div>`;
  }
}

// Instalación con presencia: aunque los paquetes pesen poco, la descarga se
// presenta con una barra animada (~5 s) y fases reales del proceso.
const PLUGIN_INSTALL_PHASES = [
  { at: 0, label: 'Conectando con el escaparate…' },
  { at: 16, label: 'Descargando paquete…' },
  { at: 60, label: 'Verificando firma SHA-256…' },
  { at: 80, label: 'Instalando en Adobe CEP…' }
];

function pluginProgressTemplate() {
  return `<div class="plugin-progress">
    <div class="plugin-progress-bar"><i style="width:0%"></i></div>
    <div class="plugin-progress-row"><span class="plugin-progress-label">Conectando…</span><b class="plugin-progress-percent">0%</b></div>
  </div>`;
}

function pluginProgressTargets(pluginId) {
  const escaped = CSS.escape(pluginId);
  return [
    document.querySelector(`.plugin-card[data-plugin-id="${escaped}"] .plugin-actions`),
    document.querySelector(`#plugin-detail-card [data-detail-actions="${escaped}"]`)
  ].filter(Boolean);
}

async function installPlugin(pluginId, button) {
  if (!window.desktop?.installPlugin) return;
  const plugin = pluginCatalog.find(item => item.id === pluginId);
  const isUpdate = Boolean(plugin?.updateAvailable);
  const targets = pluginProgressTargets(pluginId);
  const restores = targets.map(el => ({ el, html: el.innerHTML }));
  targets.forEach(el => { el.innerHTML = pluginProgressTemplate(); });
  const setProgress = (percent, label) => {
    targets.forEach(el => {
      const bar = el.querySelector('.plugin-progress-bar i');
      const pct = el.querySelector('.plugin-progress-percent');
      const lab = el.querySelector('.plugin-progress-label');
      if (bar) bar.style.width = `${percent}%`;
      if (pct) pct.textContent = `${Math.round(percent)}%`;
      if (lab && label) lab.textContent = label;
    });
  };
  const MIN_MS = 5000;
  const started = performance.now();
  let raf = 0;
  const animate = () => {
    const t = Math.min(1, (performance.now() - started) / (MIN_MS - 500));
    const eased = 1 - Math.pow(1 - t, 2.2);
    const percent = eased * 93;
    const phase = [...PLUGIN_INSTALL_PHASES].reverse().find(item => percent >= item.at);
    setProgress(percent, phase?.label);
    if (t < 1) raf = requestAnimationFrame(animate);
  };
  raf = requestAnimationFrame(animate);
  try {
    await window.desktop.installPlugin(pluginId);
    const remaining = MIN_MS - (performance.now() - started);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    cancelAnimationFrame(raf);
    setProgress(100, isUpdate ? 'Actualizado' : 'Instalado');
    await new Promise(resolve => setTimeout(resolve, 500));
    toast(isUpdate ? 'Complemento actualizado. Si Premiere estaba abierto, ciérralo y vuelve a abrirlo para que detecte la extensión nueva.' : 'Complemento instalado. Si Premiere estaba abierto, ciérralo y vuelve a abrirlo para que detecte la extensión.', 'ok', {
      title: isUpdate ? 'Complemento actualizado' : 'Complemento listo',
      actions: [{ label: 'Abrir ubicación', run: () => window.desktop?.openPluginLocation?.(pluginId) }]
    });
    await loadPlugins();
    if (activePluginDetailId === pluginId) openPluginDetail(pluginId);
  } catch (error) {
    cancelAnimationFrame(raf);
    restores.forEach(({ el, html }) => { el.innerHTML = html; });
    toast(error.message, 'error');
  }
}

// ---- Página de producto de cada complemento ----
let activePluginDetailId = null;

function pluginDetailChips(plugin) {
  const chips = [pluginLabel(plugin), plugin.version ? `v${plugin.version}` : '', plugin.sizeLabel || plugin.package?.sizeLabel || '', ...(plugin.host || [])].filter(Boolean);
  return [...new Set(chips)].filter(chip => !['Premiere Pro', 'Premiere'].includes(String(chip))).map(chip => `<span>${escapeHtml(chip)}</span>`).join('');
}

function openPluginDetail(pluginId) {
  const plugin = pluginCatalog.find(item => item.id === pluginId);
  const modal = $('#plugin-detail-modal');
  const card = $('#plugin-detail-card');
  if (!plugin || !modal || !card) return;
  activePluginDetailId = pluginId;
  const status = plugin.retired
    ? 'Retirado del catálogo'
    : plugin.installed
      ? plugin.updateAvailable
        ? `Actualización disponible → v${plugin.latestVersion || plugin.version}`
        : `Instalado v${plugin.installedVersion || plugin.version}`
      : plugin.available ? 'Disponible para instalar' : 'Pendiente de publicar';
  const isOfficial = isOfficialClipDockPlugin(plugin);
  const primaryText = plugin.installed ? (plugin.updateAvailable ? 'Actualizar' : 'Reinstalar') : (isOfficial ? 'Instalar oficial' : 'Instalar');
  const shots = Array.isArray(plugin.screenshotUrls) ? plugin.screenshotUrls : [];
  const details = Array.isArray(plugin.details) ? plugin.details : [];
  card.innerHTML = `
    <button class="plugin-detail-close" id="plugin-detail-close" aria-label="Cerrar">×</button>
    <div class="plugin-detail-hero${plugin.bannerUrl ? '' : ' no-banner'}"${plugin.bannerUrl ? ` style="background-image:linear-gradient(180deg,rgba(9,11,15,.12),rgba(13,16,20,.96)),url('${escapeHtml(plugin.bannerUrl)}')"` : ''}>
      <div class="plugin-detail-head">
        <div class="plugin-detail-logo${plugin.logoUrl ? '' : ' plugin-icon-fallback'}"${plugin.logoUrl ? '' : ` style="--chip:${pluginIconColor(plugin)}"`}>${plugin.logoUrl ? `<img src="${escapeHtml(plugin.logoUrl)}" alt="" onerror="this.remove()">` : escapeHtml(pluginIcon(plugin))}</div>
        <div class="plugin-detail-title">
          <h2>${escapeHtml(plugin.name)} ${isOfficial ? '<span class="plugin-official-pill">OFICIAL</span>' : ''}</h2>
          <p>por ${escapeHtml(plugin.author || 'Depson')} · ${escapeHtml(status)}</p>
          <div class="plugin-detail-chips">${pluginDetailChips(plugin)}</div>
        </div>
        <div class="plugin-detail-actions" data-detail-actions="${escapeHtml(plugin.id)}">
          ${plugin.retired ? '' : `<button class="detail-install ${isOfficial ? 'official-install-button' : ''}" data-plugin-install="${escapeHtml(plugin.id)}"${plugin.available ? '' : ' disabled'}>${primaryText}</button>`}
          ${plugin.installed || plugin.retired ? `<button class="detail-uninstall" data-plugin-uninstall="${escapeHtml(plugin.id)}">Desinstalar</button>` : ''}
        </div>
      </div>
    </div>
    <div class="plugin-detail-body">
      ${isOfficial && !plugin.installed ? '<div class="plugin-official-copy detail">Extensión oficial de ClipDock para Adobe. Instálala desde aquí para conectar mejor tu flujo con Premiere.</div>' : ''}
      <p class="plugin-detail-summary">${escapeHtml(plugin.description || plugin.summary || '')}</p>
      ${shots.length ? `<div class="plugin-detail-gallery">${shots.map(src => `<img src="${escapeHtml(src)}" alt="Captura del complemento" loading="lazy" onerror="this.remove()">`).join('')}</div>` : ''}
      ${details.length ? `<div class="plugin-detail-sections">${details.map((section, index) => `<article><span>${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(section.title || '')}</strong><p>${escapeHtml(section.text || '')}</p></div></article>`).join('')}</div>` : ''}
      <div class="plugin-detail-footer">
        <span>${escapeHtml(plugin.id)} · v${escapeHtml(plugin.version || '')}</span>
        ${plugin.links?.support ? `<button class="detail-support" data-detail-support="${escapeHtml(plugin.links.support)}">Reportar problema</button>` : ''}
      </div>
    </div>`;
  modal.classList.remove('hidden');
  card.scrollTop = 0;
}

function closePluginDetail() {
  $('#plugin-detail-modal')?.classList.add('hidden');
  activePluginDetailId = null;
}

async function uninstallPlugin(pluginId) {
  const plugin = pluginCatalog.find(item => item.id === pluginId);
  if (!await confirmAction({
    title: `¿Desinstalar ${plugin?.name || 'este complemento'}?`,
    message: 'Se quitarán los archivos del complemento instalado, pero ClipDock y tus configuraciones se quedan intactos.',
    detail: 'Puedes volver a instalarlo desde Complementos cuando quieras.',
    confirmText: 'Desinstalar',
    eyebrow: 'COMPLEMENTOS',
    danger: true
  })) return;
  try {
    await window.desktop?.uninstallPlugin?.(pluginId);
    toast('Complemento desinstalado');
    await loadPlugins();
    if (activePluginDetailId === pluginId) {
      const stillExists = pluginCatalog.some(item => item.id === pluginId);
      if (stillExists) openPluginDetail(pluginId);
      else closePluginDetail();
    }
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function updateAllPlugins(button) {
  if (!window.desktop?.installPluginUpdates) return;
  const updates = pluginCatalog.filter(item => item.updateAvailable);
  if (!updates.length) {
    toast('No hay complementos pendientes.');
    return;
  }
  if (!await confirmAction({
    title: `¿Actualizar ${updates.length} complemento${updates.length === 1 ? '' : 's'}?`,
    message: 'ClipDock descargará e instalará las versiones nuevas del catálogo actual.',
    detail: 'Si Premiere está abierto, conviene cerrarlo y abrirlo otra vez después de actualizar extensiones CEP.',
    confirmText: 'Actualizar',
    eyebrow: 'COMPLEMENTOS'
  })) return;
  const original = button?.textContent || 'Actualizar todo';
  if (button) { button.disabled = true; button.textContent = 'Actualizando…'; }
  try {
    const result = await window.desktop.installPluginUpdates();
    const failed = (result?.results || []).filter(item => !item.ok);
    if (failed.length) toast(`Se actualizaron ${Math.max(0, (result?.count || 0) - failed.length)} y fallaron ${failed.length}.`, 'error');
    else toast(`Complementos actualizados: ${result?.count || updates.length}`, 'ok');
    await loadPlugins();
  } catch (error) {
    toast(error.message || 'No se pudieron actualizar los complementos', 'error');
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

async function configureRemotePluginCatalog() {
  const current = pluginCatalogMeta?.remoteUrl || '';
  const url = window.prompt('URL pública del catalog.json remoto. Deja vacío para volver al catálogo incluido/local.', current);
  if (url === null) return;
  const value = String(url || '').trim();
  try {
    if (!value) {
      if (!await confirmAction({
        title: '¿Desactivar catálogo remoto?',
        message: 'ClipDock volverá a usar el catálogo incluido o el catalog.json local de Documentos.',
        detail: 'Los complementos instalados no se borran.',
        confirmText: 'Desactivar remoto',
        eyebrow: 'CATÁLOGO REMOTO'
      })) return;
      const data = await window.desktop?.clearPluginCatalogUrl?.();
      if (data) {
        pluginCatalogMeta = data;
        pluginCatalog = Array.isArray(data.plugins) ? data.plugins : [];
        renderPlugins();
      }
      toast('Catálogo remoto desactivado');
      await loadPlugins();
      return;
    }
    const data = await window.desktop?.setPluginCatalogUrl?.(value);
    pluginCatalogMeta = data || {};
    pluginCatalog = Array.isArray(data?.plugins) ? data.plugins : [];
    renderPlugins();
    toast('Catálogo remoto conectado', 'ok');
    await loadPlugins();
  } catch (error) {
    toast(error.message || 'No se pudo conectar el catálogo remoto', 'error');
  }
}

async function refreshUpdateStatus(silent = false) {
  const status = $('#update-status');
  const button = $('#check-updates');
  const install = $('#install-update');
  if (!status || !window.desktop?.checkUpdates) return;
  try {
    button.disabled = true;
    button.textContent = 'Buscando…';
    status.textContent = 'Consultando actualizaciones…';
    const info = await window.desktop.checkUpdates();
    window.latestUpdateInfo = info;
    window.updateRepoUrl = info.repoUrl || info.releaseUrl || info.feedUrl || '';
    $('#app-version-label').textContent = info.currentVersion || '0.5.43';
    if ($('#sidebar-version-number')) $('#sidebar-version-number').textContent = `v${info.currentVersion || '0.5.43'}`;
    if ($('#github-repo-label')) $('#github-repo-label').textContent = info.githubRepo || 'depsoniac/ClipDock';
    $('#sidebar-version')?.classList.toggle('has-update', Boolean(info.updateAvailable));
    $('#sidebar-version')?.setAttribute('title', info.updateAvailable ? `Actualización disponible v${info.latestVersion}` : 'Ver actualizaciones');
    const overviewUpdate = $('#overview-update-status');
    if (info.disabled) {
      status.textContent = info.message || 'Actualizaciones desactivadas. Configura update-config.json cuando tengas tu feed.';
      if (overviewUpdate) overviewUpdate.textContent = 'Sin feed';
      install.classList.add('hidden');
    } else if (info.updateAvailable) {
      status.textContent = `Disponible v${info.latestVersion}${info.notes ? ` · ${info.notes}` : ''}`;
      if (overviewUpdate) overviewUpdate.textContent = `Disponible v${info.latestVersion}`;
      install.classList.remove('hidden');
      install.disabled = !info.asset?.url;
      install.textContent = info.asset?.url ? 'Descargar e instalar' : 'Sin instalador adjunto';
      if (!silent) toast(`Nueva versión v${info.latestVersion} disponible`);
    } else {
      status.textContent = `Estás al día · v${info.currentVersion}`;
      if (overviewUpdate) overviewUpdate.textContent = 'Al día';
      install.classList.add('hidden');
      if (!silent) toast('ClipDock está actualizado');
    }
  } catch (error) {
    status.textContent = error.message;
    install.classList.add('hidden');
    if (!silent) toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Buscar actualización';
  }
}

async function installLatestUpdate() {
  const info = window.latestUpdateInfo;
  if (!info?.updateAvailable || !info.asset?.url) return toast('No hay actualización lista para instalar', 'error');
  if (!await confirmAction({ title: `Instalar ClipDock v${info.latestVersion}`, message: 'La actualización se descargará y preparará automáticamente.', detail: 'ClipDock se cerrará únicamente cuando el instalador esté listo para continuar.', confirmText: 'Descargar e instalar', eyebrow: 'ACTUALIZACIÓN DISPONIBLE' })) return;
  const install = $('#install-update');
  install.disabled = true;
  install.textContent = 'Descargando…';
  try { await window.desktop.downloadUpdate(info); }
  catch (error) {
    toast(error.message, 'error');
    $('#update-status').textContent = error.message;
    install.disabled = false;
    install.textContent = 'Reintentar instalación';
  }
}

function bindUpdateProgress() {
  if (!window.desktop?.onUpdateProgress) return;
  window.desktop.onUpdateProgress(data => {
    const percent = Math.max(0, Math.min(100, Number(data?.percent || 0)));
    const bar = $('#update-progress-bar');
    if (bar) bar.style.width = `${percent}%`;
    if ($('#update-status') && data?.message) $('#update-status').textContent = data.message;
  });
}

async function importThumbnailToAI() {
  if (!currentAnalysis?.thumbnail) return toast('Este contenido no tiene portada', 'error');
  try {
    const data = await api('/api/import-remote-image', { method: 'POST', body: JSON.stringify({ url: currentAnalysis.thumbnail, name: currentAnalysis.title }) });
    await setCurrentImage(data.path);
    $('#image-workbench').classList.remove('hidden');
    switchView('enhance');
    toast('Portada enviada al laboratorio IA');
  } catch (error) { toast(error.message, 'error'); }
}

function normalizeIncomingFilePath(value) {
  let text = String(value || '').trim();
  if (!text) return '';
  text = text.replace(/^file:\/\//i, '');
  try { text = decodeURIComponent(text); } catch (_) { /* Premiere puede mandar rutas no URI */ }
  if (/^\/[A-Za-z]:\//.test(text)) text = text.slice(1);
  return text;
}

async function routeFiles(paths, source = 'equipo') {
  const normalized = [...new Set((paths || []).map(normalizeIncomingFilePath).filter(Boolean))];
  if (!normalized.length) {
    return;
  }
  const imageExt = new Set(['png','jpg','jpeg','jfif','webp','avif','tif','tiff','bmp','gif','svg','pdf','ai','eps','psd','psb','dng','raw','cr2','cr3','nef','arw','heic','heif','exr']);
  const mediaExt = new Set(['mp4','mov','mkv','webm','avi','m4v','mpg','mpeg','mxf','mts','m2ts','3gp','prores','mp3','wav','flac','m4a','aac','ogg','aiff','aif']);
  const extOf = path => String(path || '').split(/[?#]/)[0].split('.').pop().toLowerCase();
  const images = normalized.filter(path => imageExt.has(extOf(path)));
  const media = normalized.filter(path => mediaExt.has(extOf(path)));
  const unknown = normalized.filter(path => !images.includes(path) && !media.includes(path));
  const forceSmartRoute = source === 'Adobe' || source === 'arrastre' || $('#view-enhance')?.classList.contains('active') || $('#view-convert')?.classList.contains('active');
  let routed = false;
  if ((settings.smartRoute || forceSmartRoute) && images.length) {
    await addImagesToSession(images, source);
    routed = true;
  }
  if (media.length) {
    for (const file of media) if (!currentConvertFiles.includes(file)) currentConvertFiles.push(file);
    await setAiVideo(media[0]);
    $('#selected-video-file').textContent = media.length === 1 ? media[0].split(/[\\/]/).pop() : `${media.length} videos seleccionados · vista previa del primero`;
    routed = true;
  }
  if (media.length) switchView('convert');
  else if (images.length) switchView('enhance');
  if (routed) {
    const parts = [];
    if (images.length) parts.push(`${images.length} imagen(es) a IA`);
    if (media.length) parts.push(`${media.length} video/audio al taller`);
    toast(`${parts.join(' · ')} desde ${source}`);
    return;
  }
  toast(`ClipDock recibió ${normalized.length} archivo(s), pero no reconoció el tipo: ${unknown.slice(0, 2).map(item => item.split(/[\\/]/).pop()).join(', ')}`, 'error');
}


async function loadAssets() {
  try {
    const data = await api('/api/assets');
    assetLibrary = Array.isArray(data.assets) ? data.assets : [];
    assetFolders = data.folders || assetFolders || {};
    renderAssetLibrary();
  } catch (error) {
    toast(error.message || 'No se pudo leer la biblioteca SFX/VFX', 'error');
  }
}

function formatAssetClock(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  const secs = value % 60;
  if (minutes < 60) return `${minutes}:${String(secs).padStart(2, '0')}`;
  return formatClock(value);
}

function baseNameWithoutExtension(value) {
  const name = videoFileName(value || '').replace(/\.[^/.\\]+$/, '').trim();
  return name || String(value || '').replace(/\.[^/.\\]+$/, '').trim() || 'ClipDock clip';
}

function renderAssetPlayer(item, src) {
  const isAudio = item.mediaType === 'audio';
  const safeSrc = escapeHtml(src || '');
  const mediaTag = isAudio
    ? `<audio class="asset-media" preload="metadata" src="${safeSrc}"></audio>`
    : `<video class="asset-media" preload="metadata" playsinline src="${safeSrc}"></video>`;
  return `<div class="asset-player custom-asset-player ${isAudio ? 'audio-player' : 'video-player'} ${src ? '' : 'no-preview'}">
    ${mediaTag}
    <button class="asset-play-button" data-asset-play type="button" aria-label="Reproducir"><span>▶</span></button>
    <div class="asset-player-body">
      <div class="asset-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <button class="asset-progress" data-asset-seek type="button" aria-label="Buscar en el clip"><i></i></button>
      <small class="asset-time">0:00</small>
    </div>
  </div>`;
}

function updateAssetPlayer(media) {
  const player = media?.closest?.('.custom-asset-player');
  if (!player) return;
  const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0;
  const current = Number.isFinite(media.currentTime) ? media.currentTime : 0;
  const percent = duration ? Math.max(0, Math.min(100, current / duration * 100)) : 0;
  player.style.setProperty('--asset-progress', `${percent}%`);
  const label = player.querySelector('.asset-time');
  if (label) label.textContent = duration ? `${formatAssetClock(current)} / ${formatAssetClock(duration)}` : '0:00';
  const playing = !media.paused && !media.ended;
  player.classList.toggle('playing', playing);
  const icon = player.querySelector('.asset-play-button span');
  if (icon) icon.textContent = playing ? 'Ⅱ' : '▶';
}

function pauseOtherAssetPlayers(activeMedia) {
  $$('.custom-asset-player .asset-media').forEach(media => {
    if (media !== activeMedia && !media.paused) media.pause();
  });
}

async function toggleAssetPlayer(button) {
  const player = button?.closest?.('.custom-asset-player');
  const media = player?.querySelector?.('.asset-media');
  if (!media || !media.getAttribute('src')) return toast('Este archivo no tiene vista previa reproducible', 'error');
  try {
    if (media.paused || media.ended) {
      pauseOtherAssetPlayers(media);
      await media.play();
    } else {
      media.pause();
    }
    updateAssetPlayer(media);
  } catch (error) {
    toast('No se pudo reproducir este archivo desde la biblioteca', 'error');
  }
}

function seekAssetPlayer(button, event) {
  const player = button?.closest?.('.custom-asset-player');
  const media = player?.querySelector?.('.asset-media');
  if (!media || !Number.isFinite(media.duration) || media.duration <= 0) return;
  const rect = button.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
  media.currentTime = ratio * media.duration;
  updateAssetPlayer(media);
}

function bindAssetPlayerEvents() {
  $$('.custom-asset-player .asset-media').forEach(media => {
    media.addEventListener('loadedmetadata', () => {
      if (media.tagName === 'VIDEO' && Number(media.duration || 0) > 0 && media.currentTime === 0) {
        try { media.currentTime = Math.min(0.12, Math.max(0.01, media.duration / 20)); } catch (_) { /* ignore preview seek */ }
      }
      updateAssetPlayer(media);
    });
    media.addEventListener('timeupdate', () => updateAssetPlayer(media));
    media.addEventListener('play', () => updateAssetPlayer(media));
    media.addEventListener('pause', () => updateAssetPlayer(media));
    media.addEventListener('ended', () => { media.currentTime = 0; updateAssetPlayer(media); });
  });
}

async function renderAssetLibrary() {
  const list = $('#asset-list');
  if (!list) return;
  const items = assetLibrary.filter(item => assetFilter === 'all' || item.kind === assetFilter);
  if (!items.length) {
    list.innerHTML = '<div class="empty-mini">Todavía no hay archivos en esta categoría.</div>';
    return;
  }
  const rows = await Promise.all(items.map(async item => {
    let src = '';
    try { src = await window.desktop?.mediaPreviewUrl(item.path) || ''; } catch (_) { src = ''; }
    const size = item.size ? `${(Number(item.size) / 1048576).toFixed(1)} MB` : 'Archivo local';
    return `<article class="asset-row" data-asset-path="${escapeHtml(item.path)}">${renderAssetPlayer(item, src)}<div class="asset-info"><span>${escapeHtml(String(item.kind || '').toUpperCase())}</span><strong>${escapeHtml(item.name || videoFileName(item.path))}</strong><small>${escapeHtml(size)} · ${escapeHtml(item.modifiedLabel || '')}</small></div><div class="asset-row-actions"><button class="session-tool" data-asset-open="${escapeHtml(item.path)}">Ver</button><button class="session-tool ai" data-asset-premiere="${escapeHtml(item.path)}">Enviar a Premiere</button></div></article>`;
  }));
  list.innerHTML = rows.join('');
  bindAssetPlayerEvents();
}

function syncAssetTrimUI() {
  const startRange = $('#asset-start-range');
  const endRange = $('#asset-end-range');
  if (!startRange || !endRange) return;
  let start = Math.min(Number(startRange.value), Number(endRange.value) - 1);
  let end = Math.max(Number(endRange.value), start + 1);
  startRange.value = start; endRange.value = end;
  const max = Math.max(1, Number(endRange.max));
  $('#asset-trim-selection').style.left = `${start / max * 100}%`;
  $('#asset-trim-selection').style.width = `${(end - start) / max * 100}%`;
  $('#asset-start').value = formatClock(start);
  $('#asset-end').value = formatClock(end);
  $('#asset-duration-label').textContent = `${formatDuration(end - start)} seleccionados`;
}

function openAssetCapture(kind = 'sfx') {
  if (!currentAnalysis) return toast('Analiza primero un enlace para guardar SFX/VFX', 'error');
  const url = normalizeUrl($('#url-input').value);
  if (!url) return toast('Pega un enlace primero', 'error');
  pendingAssetCapture = { kind: kind === 'vfx' ? 'vfx' : 'sfx', info: currentAnalysis, url };
  const isSfx = pendingAssetCapture.kind === 'sfx';
  const duration = Math.max(1, Math.floor(Number(currentAnalysis.duration || 1)));
  $('#asset-capture-kind').textContent = pendingAssetCapture.kind.toUpperCase();
  $('#asset-capture-title').textContent = isSfx
    ? 'Se guardará como audio MP3. Recorta solo el sonido que necesitas.'
    : (currentAnalysis.title || 'Recorta el video y guárdalo.');
  const card = $('#asset-capture-modal .asset-capture-modal-card');
  card?.classList.toggle('audio-mode', isSfx);
  $('#asset-capture-cover').style.backgroundImage = (!isSfx && currentAnalysis.thumbnail) ? `linear-gradient(#0004,#0008),url("${currentAnalysis.thumbnail}")` : '';
  $('#asset-start-range').max = duration; $('#asset-end-range').max = duration;
  $('#asset-start-range').value = 0; $('#asset-end-range').value = duration;
  const defaultAssetName = baseNameWithoutExtension(currentAnalysis.title || currentAnalysis.filename || currentAnalysis.webpage_url || 'ClipDock clip');
  $('#asset-custom-name').value = defaultAssetName;
  $('#asset-custom-name').placeholder = isSfx ? 'Ej. claxon carro, golpe metálico, riser' : 'Ej. pantalla verde, explosión, transición';
  syncAssetTrimUI();
  $('#asset-capture-modal').classList.remove('hidden');
}

async function saveAssetFragment() {
  if (!pendingAssetCapture) return;
  const kind = pendingAssetCapture.kind === 'vfx' ? 'vfx' : 'sfx';
  const isSfx = kind === 'sfx';
  const start = Math.max(0, parseClock($('#asset-start').value));
  const end = Math.max(start + 1, parseClock($('#asset-end').value));
  try {
    if (!assetFolders[kind]) {
      const data = await api('/api/assets');
      assetFolders = data.folders || {};
    }
    const targetDir = assetFolders[kind];
    if (!targetDir) throw new Error('No encontré la carpeta de biblioteca.');
    const title = $('#asset-custom-name').value.trim() || `${kind.toUpperCase()} · ${pendingAssetCapture.info.title || 'Clip'}`;
    const request = {
      url: pendingAssetCapture.url,
      outputDir: targetDir,
      formatSelector: isSfx ? 'bestaudio/best' : 'bv*+ba/b',
      title,
      sourceThumbnail: isSfx ? '' : (pendingAssetCapture.info.thumbnail || ''),
      thumbnail: false,
      subtitles: false,
      ignoreCookies: false,
      fragment: { enabled: true, start, end },
      recode: isSfx
        ? { mode: 'manual', container: 'mp3', videoCodec: 'none', audioCodec: 'mp3', audioBitrate: '192k', keepOriginal: false }
        : { mode: 'off' }
    };
    const job = await api('/api/jobs/download', { method: 'POST', body: JSON.stringify(request) });
    jobVisuals.set(job.id, { title: `${title} · ${kind.toUpperCase()}`, thumbnail: isSfx ? '' : (pendingAssetCapture.info.thumbnail || ''), kind: `asset-${kind}` });
    persistJobVisuals();
    $('#asset-capture-modal').classList.add('hidden');
    toast(isSfx ? 'SFX añadido a la cola como audio MP3' : 'VFX añadido a la cola de biblioteca', 'progress');
    switchView('queue');
  } catch (error) {
    if (!showComponentRequirement(error)) toast(error.message || 'No se pudo guardar el fragmento', 'error');
  }
}

async function sendAssetToPremiere(filePath) {
  try {
    const response = await api('/api/adobe/send', { method: 'POST', body: JSON.stringify({ files: [filePath], targetBin: 'ClipDock SFX VFX', addToTimeline: true }) });
    if (!response.confirmed) throw new Error(response.delivery?.result || 'Premiere no confirmó la importación.');
    toast('Archivo enviado a Premiere');
  } catch (error) {
    toast(error.message || 'No se pudo enviar a Premiere', 'error');
  }
}

async function pickMediaFiles() {
  const files = await window.desktop?.pickFiles([{ name: 'Audio, video e imágenes', extensions: ['mp4','mov','mkv','webm','avi','mp3','wav','flac','m4a','png','jpg','jpeg','webp','svg','pdf'] }]);
  routeFiles(files, 'equipo');
}

async function checkClipboard() {
  if (!settings.autoPaste || !window.desktop?.readClipboard) return;
  const value = normalizeUrl(await window.desktop.readClipboard());
  if (!/^https?:\/\/\S+$/i.test(value) || value === lastClipboardUrl || value === $('#url-input').value.trim()) return;
  lastClipboardUrl = value;
  $('#url-input').value = value;
  switchView('download');
  toast('Enlace pegado automáticamente');
  if (settings.autoAnalyze) analyze();
}

let lastDroppedFilesSignature = '';
let lastDroppedFilesAt = 0;

function pathsFromDropEvent(event) {
  const files = event?.dataTransfer?.files;
  let paths = [];
  try { paths = window.desktop?.pathsFromFiles?.(files) || []; } catch (_) { paths = []; }
  if (!paths.length && files?.length) paths = Array.from(files).map(file => file.path || '').filter(Boolean);
  return paths;
}

function routeDroppedFilesOnce(paths) {
  const clean = [...new Set((paths || []).filter(Boolean))];
  if (!clean.length) return false;
  const signature = clean.join('|');
  const now = Date.now();
  if (signature === lastDroppedFilesSignature && now - lastDroppedFilesAt < 800) return true;
  lastDroppedFilesSignature = signature;
  lastDroppedFilesAt = now;
  routeFiles(clean, 'arrastre');
  return true;
}

function warnDropFallbackIfNeeded() {
  setTimeout(() => {
    if (Date.now() - lastDroppedFilesAt > 1200) {
      toast('No pude leer la ruta real del archivo arrastrado. Usa el botón Agregar como respaldo.', 'error');
    }
  }, 220);
}

function setupSmartDrop() {
  let dragDepth = 0;
  window.desktop?.onFilesDropped?.(paths => routeDroppedFilesOnce(paths));
  window.addEventListener('dragenter', event => { event.preventDefault(); dragDepth += 1; $('#drop-overlay').classList.add('visible'); });
  window.addEventListener('dragover', event => event.preventDefault());
  window.addEventListener('dragleave', event => { event.preventDefault(); dragDepth -= 1; if (dragDepth <= 0) $('#drop-overlay').classList.remove('visible'); });
  window.addEventListener('drop', event => {
    event.preventDefault(); dragDepth = 0; $('#drop-overlay').classList.remove('visible');
    const paths = pathsFromDropEvent(event);
    if (!routeDroppedFilesOnce(paths)) warnDropFallbackIfNeeded();
  });
}

function recipeName(recipe) {
  if (!recipe || recipe.mode === 'off') return 'Sin recodificar';
  if (recipe.mode === 'manual') return `${(recipe.videoCodec || 'h264').toUpperCase()} manual`;
  return (Array.isArray(recodePresets) ? recodePresets : []).find(item => item.id === recipe.preset)?.name || 'H.264 Normal';
}

function recipePrefersAudio(recipe) {
  if (!recipe || recipe.mode === 'off') return false;
  const preset = String(recipe.preset || '').toLowerCase();
  const container = String(recipe.container || '').toLowerCase();
  const videoCodec = String(recipe.videoCodec || '').toLowerCase();
  return preset.startsWith('mp3') || preset.startsWith('wav') || ['mp3','wav'].includes(container) || videoCodec === 'none';
}

function addAnalysisToSession(info, url) {
  if (!url) return;
  const existing = downloadSession.find(item => item.url === url);
  if (existing) {
    existing.info = info;
  } else {
    downloadSession.push({
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, url, info,
      title: info.title || 'Contenido sin título', thumbnail: info.thumbnail || '',
      quality: 'bv*+ba/b', content: 'video-audio', saveThumbnail: settings.saveThumbnail !== false,
      subtitles: false, subtitleFormat: universalRecode.subtitleFormat || localStorage.getItem('subtitleFormat') || 'srt', subtitleLang: preferredSubtitleLang(info), subtitleOpen: false,
      fragment: { enabled: false, start: 0, end: Number(info.duration || 0) }, recode: { ...universalRecode }
    });
  }
  renderDownloadSession();
}

function qualityOptions(item) {
  const heights = [...new Set((item.info?.formats || []).map(format => Number(format.height || 0)).filter(Boolean))].sort((a, b) => b - a).slice(0, 7);
  return [{ value: 'bv*+ba/b', label: 'Mejor calidad disponible · sin recodificar' }, ...heights.map(height => ({ value: `bv*[height<=${height}]+ba/b`, label: `Hasta ${height}p · si existe` }))];
}

function contentLabel(value) {
  return { 'video-audio': 'Video + audio', audio: 'Solo audio', video: 'Solo video' }[value] || 'Video + audio';
}

function recipeOutputLabel(recipe) {
  if (!recipe || recipe.mode === 'off') return 'Descarga directa';
  const preset = (Array.isArray(recodePresets) ? recodePresets : []).find(item => item.id === recipe.preset);
  if (recipe.mode === 'manual') return `${(recipe.container || 'mp4').toUpperCase()} · ${recipe.quality ?? 23} CRF`;
  return preset ? `${(preset.extension || '.mp4').replace(/^\./, '').toUpperCase()} · ${preset.name}` : recipeName(recipe);
}

const SESSION_TOOL_ICONS = {
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h8.5"/><circle cx="16" cy="8" r="2.4"/><path d="M19.9 8H20"/><path d="M4 16h3.5"/><circle cx="11" cy="16" r="2.4"/><path d="M14.5 16H20"/></svg>',
  trim: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="m8.7 8.5 10.8 7.8M8.7 15.5l10.8-7.8"/></svg>',
  cover: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="13" height="12" rx="2.6"/><path d="m6.3 14 2.7-3.1 2.4 2.6 1.6-1.8 2.2 2.3"/><path d="M20.3 3.6c.35 1.7 1.2 2.55 2.9 2.9-1.7.37-2.55 1.22-2.9 2.92-.37-1.7-1.22-2.55-2.92-2.92 1.7-.35 2.55-1.2 2.92-2.9Z"/></svg>',
  enhance: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 19 8.6-8.6"/><path d="M14.6 4.6 15.7 7l2.4 1.1L15.7 9.2l-1.1 2.4-1.1-2.4L11.1 8.1 13.5 7l1.1-2.4Z"/><path d="m19 14 .6 1.4L21 16l-1.4.6L19 18l-.6-1.4L17 16l1.4-.6L19 14Z"/></svg>'
};

function renderDownloadSession() {
  $('#download-session').classList.toggle('hidden', downloadSession.length === 0);
  $('#session-count').textContent = downloadSession.length;
  $('#session-list').innerHTML = [...downloadSession].reverse().map(item => {
    const state = item.result ? 'LISTO' : item.jobId ? 'EN COLA' : 'PREPARADO';
    const host = (() => { try { return new URL(item.url).hostname; } catch (_) { return 'Enlace'; } })();
    const fragment = item.fragment?.enabled ? item.fragment : null;
    const fragmentBadge = fragment
      ? `<span class="fragment-badge">✂ ${formatClock(fragment.start)} – ${formatClock(fragment.end)}</span>`
      : '';
    const outputExtras = `${escapeHtml(contentLabel(item.content))}${item.subtitles ? ` · Subs ${escapeHtml((item.subtitleFormat || 'srt').toUpperCase())}` : ''}${item.saveThumbnail ? ' · Portada' : ''}${fragment ? ' · Fragmento' : ''}`;
    return `<article class="session-item compact-session${fragment ? ' has-fragment' : ''}" data-session-id="${item.id}">
      <div class="session-thumb" style="${item.thumbnail ? `background-image:url(&quot;${encodeURI(item.thumbnail)}&quot;)` : ''}"></div>
      <div class="session-info">
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.info?.uploader || host)} · ${formatDuration(item.info?.duration)}</p>
        <div class="session-badges"><span>${state}</span>${fragmentBadge}</div>
      </div>
      <div class="session-output-mini">
        <span>Salida</span>
        <strong>${escapeHtml(recipeOutputLabel(item.recode))}</strong>
        <small>${outputExtras}</small>
      </div>
      <div class="session-primary-actions compact-actions">
        <div class="session-tool-row">
          <button class="session-tool icon-tool" data-session-advanced="${item.id}" title="Ajustes de descarga">${SESSION_TOOL_ICONS.settings}</button>
          <button class="session-tool icon-tool${fragment ? ' trim-active' : ''}" data-session-trim="${item.id}" title="${fragment ? 'Editar fragmento' : 'Recortar: descargar solo un fragmento'}">${SESSION_TOOL_ICONS.trim}</button>
          <button class="session-tool icon-tool ai" data-session-cover-ai="${item.id}" title="Mejorar portada con IA">${SESSION_TOOL_ICONS.cover}</button>
          <button class="session-tool icon-tool ai" data-session-result-ai="${item.id}" ${item.result ? '' : 'disabled'} title="Mejorar video con IA" data-tooltip="Disponible al terminar">${SESSION_TOOL_ICONS.enhance}</button>
        </div>
        <button class="session-tool session-download" data-session-download="${item.id}">Descargar</button>
        <button class="remove-session" data-session-remove="${item.id}" title="Quitar de la sesión">×</button>
      </div>
    </article>`;
  }).join('');
}


async function loadRecodePresets() {
  try {
    const data = await api('/api/recode-presets');
    recodePresets = Array.isArray(data) ? data : (data.presets || []);
    const target = recodeDraft || universalRecode;
    renderQuickPresetMenus(target.preset);
  } catch (error) { toast(error.message, 'error'); }
}

function quickSelectionForPreset(presetId) {
  for (const format of QUICK_PRESET_FORMATS) {
    const profile = format.presets.find(item => item.id === presetId);
    if (profile) return { format, profile };
  }
  const format = QUICK_PRESET_FORMATS[0];
  return { format, profile: format.presets[0] };
}

function outputSvgForPreset(kind = 'video') {
  if (kind === 'audio') {
    return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M17 34V15l18-4v19"/><circle cx="13" cy="34" r="5"/><circle cx="31" cy="30" r="5"/></svg>`;
  }
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M11 5h18l8 8v30H11z"/><path d="M29 5v9h8"/><path d="M18 24l13 7-13 7z"/></svg>`;
}

function renderQuickPresetMenus(presetId = 'h264_standard') {
  const selection = quickSelectionForPreset(presetId);
  $('#quick-format').innerHTML = QUICK_PRESET_FORMATS.map(item => `<option value="${item.id}">${item.label}</option>`).join('');
  $('#quick-format').value = selection.format.id;
  $('#quick-profile').innerHTML = selection.format.presets.map(item => `<option value="${item.id}">${item.label}</option>`).join('');
  $('#quick-profile').value = selection.profile.id;
  const preset = recodePresets.find(item => item.id === selection.profile.id);
  const extension = (preset?.extension || '.mp4').replace(/^\./, '').toUpperCase();
  const outputLabel = preset ? `${extension} · ${preset.name}` : `${extension} · ${selection.profile.label}`;
  const outputDescription = preset?.description || 'Salida configurada automáticamente.';
  const outputCard = $('#quick-output-card');
  if (outputCard) outputCard.innerHTML = `${outputSvgForPreset(selection.format.kind)}<div><span>Salida final</span><strong>${escapeHtml(extension)}</strong><small>${escapeHtml(outputLabel)}</small><em>${escapeHtml(outputDescription)}</em></div>`;
}

function changeQuickPreset(level) {
  let presetId;
  if (level === 'format') {
    const format = QUICK_PRESET_FORMATS.find(item => item.id === $('#quick-format').value) || QUICK_PRESET_FORMATS[0];
    presetId = format.presets[0].id;
  } else {
    presetId = $('#quick-profile').value;
  }
  if (!recodeDraft) recodeDraft = { ...universalRecode };
  recodeDraft.mode = 'quick';
  recodeDraft.preset = presetId;
  $('#disable-recode').checked = false;
  renderQuickPresetMenus(presetId);
  updateRecodeDisabledState();
  updateRecodeSummary();
}

function showRecodeSection(section) {
  $$('.recode-tabs button').forEach(button => button.classList.toggle('active', button.dataset.recodeTab === section));
  $$('.recode-section').forEach(node => node.classList.toggle('active', node.id === `recode-${section}`));
  if (recodeDraft && ['quick', 'manual'].includes(section)) recodeDraft.mode = section;
  updateRecodeSummary();
}

function readManualRecipe() {
  return {
    mode: 'manual', container: $('#manual-container').value,
    videoCodec: $('#manual-video-codec').value, quality: Number($('#manual-quality').value || 23),
    speed: $('#manual-speed').value, audioCodec: $('#manual-audio-codec').value,
    audioBitrate: $('#manual-audio-bitrate').value, width: $('#manual-width').value,
    height: $('#manual-height').value, fps: $('#manual-fps').value
  };
}

function updateRecodeDisabledState() {
  const modal = $('#universal-modal');
  const disabled = modal?.classList.contains('local-recode') ? false : Boolean($('#disable-recode')?.checked);
  if (modal) modal.classList.toggle('recode-disabled', disabled);
  $$('#recode-quick select, #recode-manual input, #recode-manual select').forEach(control => {
    control.disabled = disabled;
  });
}

function updateRecodeSummary() {
  const target = recodeDraft || universalRecode;
  const recipe = $('#disable-recode')?.checked ? { ...target, mode: 'off' } : target.mode === 'manual' ? { ...target, ...readManualRecipe() } : target;
  const presets = Array.isArray(recodePresets) ? recodePresets : [];
  const outputFormat = recipe.container?.toUpperCase()
    || presets.find(item => item.id === recipe.preset)?.extension?.replace(/^\./, '').toUpperCase()
    || 'MP4';
  $('#recode-summary').textContent = `${recipeName(recipe)} · ${recipe.mode === 'off' ? 'descarga directa' : outputFormat}`;
}

async function openUniversalSettings(scope = 'session', itemId = '') {
  const item = downloadSession.find(entry => entry.id === itemId);
  const source = scope === 'item' ? item?.recode : universalRecode;
  recodeDraft = { mode: 'quick', preset: 'h264_standard', thumbnail: true, keepOriginal: true, subtitleFormat: localStorage.getItem('subtitleFormat') || 'srt', subtitleLang: localStorage.getItem('subtitleLang') || 'auto', ...(source || {}) };
  if (scope === 'item' && item) {
    recodeDraft.subtitles = Boolean(item.subtitles);
    recodeDraft.subtitleFormat = item.subtitleFormat || recodeDraft.subtitleFormat;
    recodeDraft.subtitleLang = item.subtitleLang || preferredSubtitleLang(item.info) || recodeDraft.subtitleLang;
  }
  $('#universal-scope').textContent = scope === 'local' ? `Se aplicará a ${currentConvertFiles.length} archivo(s) locales.` : scope === 'item' ? `Solo cambiará “${item?.title || 'este video'}”.` : `Se aplicará a ${downloadSession.length} elemento(s) preparados.`;
  $('#universal-modal').dataset.scope = scope;
  $('#universal-modal').dataset.itemId = itemId;
  $('#universal-modal').classList.toggle('local-recode', scope === 'local');
  if (scope === 'local' && recodeDraft.mode === 'off') {
    recodeDraft.mode = 'quick';
    recodeDraft.preset = recodeDraft.preset || 'h264_standard';
  }
  $('#extra-thumbnail').checked = recodeDraft.thumbnail !== false;
  $('#extra-subtitles').checked = Boolean(recodeDraft.subtitles);
  populateUniversalSubtitleControls(scope, itemId);
  $('#extra-adobe').checked = Boolean(recodeDraft.autoAdobe);
  $('#extra-keep-original').checked = recodeDraft.keepOriginal !== false;
  $('#disable-recode').checked = scope !== 'local' && recodeDraft.mode === 'off';
  updateRecodeDisabledState();
  $('#apply-universal span').textContent = scope === 'item' ? 'Aplicar a este video' : scope === 'local' ? 'Aplicar a selección' : 'Aplicar a la sesión';
  if (recodeDraft.mode === 'manual') {
    $('#manual-container').value = recodeDraft.container || 'mp4'; $('#manual-video-codec').value = recodeDraft.videoCodec || 'h264';
    $('#manual-quality').value = recodeDraft.quality ?? 23; $('#manual-speed').value = recodeDraft.speed || 'medium';
    $('#manual-audio-codec').value = recodeDraft.audioCodec || 'aac'; $('#manual-audio-bitrate').value = recodeDraft.audioBitrate || '192k';
    $('#manual-width').value = recodeDraft.width || ''; $('#manual-height').value = recodeDraft.height || ''; $('#manual-fps').value = recodeDraft.fps || '';
  }
  $('#universal-modal').classList.remove('hidden');
  if (!recodePresets.length) await loadRecodePresets();
  renderQuickPresetMenus(recodeDraft.preset);
  showRecodeSection(recodeDraft.mode === 'manual' ? 'manual' : 'quick');
  updateRecodeDisabledState();
  if (recodeDraft.mode === 'off') updateRecodeSummary();
}

function applyUniversalSettings() {
  const scope = $('#universal-modal').dataset.scope;
  const extras = scope === 'local'
    ? { thumbnail: false, subtitles: false, subtitleFormat: localStorage.getItem('subtitleFormat') || 'srt', subtitleLang: localStorage.getItem('subtitleLang') || 'auto', autoAdobe: false, keepOriginal: false }
    : {
        thumbnail: $('#extra-thumbnail').checked, subtitles: $('#extra-subtitles').checked,
        subtitleFormat: $('#extra-subtitle-format')?.value || 'srt', subtitleLang: $('#extra-subtitle-lang')?.value || 'auto',
        autoAdobe: $('#extra-adobe').checked, keepOriginal: $('#extra-keep-original').checked
      };
  const disabled = scope === 'local' ? false : $('#disable-recode').checked;
  const mode = disabled ? 'off' : ($('.recode-tabs button.active')?.dataset.recodeTab || 'quick');
  const applied = mode === 'manual' ? { ...readManualRecipe(), ...extras } : { ...recodeDraft, mode, ...extras };
  if (applied.mode === 'off') {
    applied.keepOriginal = true;
  }
  if (scope === 'session') {
    universalRecode = { ...applied };
    const targetContent = recipePrefersAudio(applied) ? 'audio' : 'video-audio';
    downloadSession.forEach(item => { item.recode = { ...universalRecode }; item.content = targetContent; item.saveThumbnail = applied.thumbnail !== false; item.subtitles = Boolean(applied.subtitles); item.subtitleFormat = applied.subtitleFormat; item.subtitleLang = applied.subtitleLang; });
    renderDownloadSession();
  } else if (scope === 'item') {
    const item = downloadSession.find(entry => entry.id === $('#universal-modal').dataset.itemId);
    if (item) { item.recode = { ...applied }; item.content = recipePrefersAudio(applied) ? 'audio' : 'video-audio'; item.saveThumbnail = applied.thumbnail !== false; item.subtitles = Boolean(applied.subtitles); item.subtitleFormat = applied.subtitleFormat; item.subtitleLang = applied.subtitleLang; }
    renderDownloadSession();
  } else {
    universalRecode = { ...applied };
  }
  localStorage.setItem('subtitleFormat', applied.subtitleFormat || 'srt');
  localStorage.setItem('subtitleLang', applied.subtitleLang || 'auto');
  $('#universal-modal').classList.add('hidden');
  $('#universal-modal').classList.remove('local-recode');
  recodeDraft = null;
  toast(`Ajuste ${recipeName(applied)} aplicado`);
}

async function downloadAllSession() {
  if (!downloadSession.length) return;
  if (!outputDir) await chooseOutput();
  if (!outputDir) return;
  let added = 0;
  for (const item of downloadSession) if (await startSessionDownload(item)) added += 1;
  if (added) {
    toast(`${added} descarga${added === 1 ? '' : 's'} añadida${added === 1 ? '' : 's'} a la cola`);
    switchView('queue');
  }
}

async function processLocalSelection() {
  if (!currentConvertFiles.length) return;
  if (universalRecode.mode === 'off') return toast('Elige una salida rápida o manual', 'error');
  if (!outputDir) await chooseOutput();
  if (!outputDir) return;
  for (const input of currentConvertFiles) {
    const job = await api('/api/jobs/recode', { method: 'POST', body: JSON.stringify({ input, recode: { ...universalRecode, outputDir } }) });
    if (universalRecode.autoAdobe) requestedAdobeJobs.add(job.id);
  }
  toast(`${currentConvertFiles.length} archivo(s) añadidos a la cola`);
  switchView('queue');
}

async function importSessionCover(item) {
  if (!item?.thumbnail) return toast('Este video no tiene portada', 'error');
  try {
    const data = await api('/api/import-remote-image', { method: 'POST', body: JSON.stringify({ url: item.thumbnail, name: item.title }) });
    await setCurrentImage(data.path);
    switchView('enhance');
    showAiTool('upscale');
    toast('Portada enviada al laboratorio IA');
  } catch (error) { toast(error.message, 'error'); }
}

async function setAiVideo(filePath) {
  currentAiVideo = filePath;
  if (!currentConvertFiles.includes(filePath)) currentConvertFiles.push(filePath);
  $('#selected-video-file').textContent = currentAiVideo.split(/[\\/]/).pop();
  $('#pick-ai-video').classList.add('has-video');
  $('#pick-ai-video-button').classList.remove('hidden');
  $('#selected-video-file').classList.remove('hidden');
  try {
    const previewUrl = await window.desktop?.mediaPreviewUrl(currentAiVideo);
    if (previewUrl) $('#video-preview').src = previewUrl;
  } catch (_) {
    $('#video-preview').removeAttribute('src');
    $('#video-preview').load();
  }
  renderConvertSession();
}

function clearAiVideoPreview() {
  currentAiVideo = null;
  currentVideoDuration = 0;
  $('#video-preview').removeAttribute('src');
  $('#video-preview').load();
  $('#pick-ai-video').classList.remove('has-video');
  $('#pick-ai-video-button').classList.add('hidden');
  $('#selected-video-file').classList.add('hidden');
  $('#selected-video-file').textContent = 'Ningún archivo';
  resetVideoTrim();
  renderConvertSession();
}

function syncVideoTrimUI(source = 'range') {
  const startRange = $('#video-trim-start-range');
  const endRange = $('#video-trim-end-range');
  const max = Math.max(1, Number(endRange.max || currentVideoDuration || 1));
  if (source === 'text') {
    startRange.value = Math.min(parseClock($('#video-trim-start').value), max - 1);
    endRange.value = Math.min(parseClock($('#video-trim-end').value) || max, max);
  }
  let start = Math.min(Number(startRange.value), Number(endRange.value) - 1);
  let end = Math.max(Number(endRange.value), start + 1);
  startRange.value = start; endRange.value = end;
  $('#video-trim-selection').style.left = `${start / max * 100}%`;
  $('#video-trim-selection').style.width = `${(end - start) / max * 100}%`;
  $('#video-trim-start').value = formatClock(start);
  $('#video-trim-end').value = formatClock(end);
}

function resetVideoTrim() {
  const duration = Math.max(1, Math.floor(currentVideoDuration || 1));
  $('#video-trim-start-range').max = duration; $('#video-trim-end-range').max = duration;
  $('#video-trim-start-range').value = 0; $('#video-trim-end-range').value = duration;
  syncVideoTrimUI();
}

function syncFragmentUI() {
  const startRange = $('#trim-start-range');
  const endRange = $('#trim-end-range');
  let start = Math.min(Number(startRange.value), Number(endRange.value) - 1);
  let end = Math.max(Number(endRange.value), start + 1);
  startRange.value = start; endRange.value = end;
  const max = Math.max(1, Number(endRange.max));
  $('#trim-selection').style.left = `${start / max * 100}%`;
  $('#trim-selection').style.width = `${(end - start) / max * 100}%`;
  $('#fragment-start').value = formatClock(start);
  $('#fragment-end').value = formatClock(end);
  $('#fragment-duration-label').textContent = `${formatDuration(end - start)} seleccionados`;
}

function openFragment(itemId) {
  const item = downloadSession.find(entry => entry.id === itemId);
  if (!item) return;
  activeFragmentItemId = itemId;
  const duration = Math.max(1, Math.floor(Number(item.info?.duration || 1)));
  $('#fragment-title').textContent = item.title;
  $('#fragment-cover').style.backgroundImage = item.thumbnail ? `linear-gradient(#0002,#0005),url("${item.thumbnail}")` : '';
  $('#trim-start-range').max = duration; $('#trim-end-range').max = duration;
  $('#trim-start-range').value = Math.min(item.fragment?.start || 0, duration - 1);
  $('#trim-end-range').value = Math.min(item.fragment?.end || duration, duration);
  syncFragmentUI();
  $('#fragment-modal').classList.remove('hidden');
}

function applyFragment() {
  const item = downloadSession.find(entry => entry.id === activeFragmentItemId);
  if (!item) return;
  const duration = Math.max(1, Number(item.info?.duration || 1));
  const start = Math.max(0, Math.min(parseClock($('#fragment-start').value), duration - 1));
  const end = Math.max(start + 1, Math.min(parseClock($('#fragment-end').value), duration));
  item.fragment = { enabled: true, start, end };
  $('#fragment-modal').classList.add('hidden');
  renderDownloadSession();
}


function setRuntimeSetupProgress(percent = 0, message = 'Preparando ClipDock…', title = 'Preparando ClipDock', details = {}) {
  const progress = $('#runtime-setup-progress');
  if (progress) progress.classList.remove('hidden');
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  if ($('#runtime-setup-progress-title')) $('#runtime-setup-progress-title').textContent = title;
  if ($('#runtime-setup-progress-percent')) $('#runtime-setup-progress-percent').textContent = `${Math.round(safePercent)}%`;
  if ($('#runtime-setup-progress-bar')) $('#runtime-setup-progress-bar').style.width = `${safePercent}%`;
  if ($('#runtime-setup-progress-message')) $('#runtime-setup-progress-message').textContent = message;
  const meta = $('#runtime-setup-progress-meta');
  if (meta) {
    const chips = [];
    const step = Number(details.step || 0);
    const total = Number(details.total || 0);
    const requestedTotal = Number(details.requestedTotal || 0);
    const skipped = Number(details.skipped || 0);
    const installed = Number(details.installed || 0);
    if (step && total) chips.push(`${step} de ${total}`);
    else if (requestedTotal) chips.push(`${requestedTotal} total`);
    if (skipped) chips.push(`${skipped} ya listo${skipped === 1 ? '' : 's'}`);
    if (installed) chips.push(`${installed} instalado${installed === 1 ? '' : 's'}`);
    if (details.name) chips.push(String(details.name));
    meta.innerHTML = chips.map(chip => `<span>${escapeHtml(chip)}</span>`).join('');
    meta.classList.toggle('hidden', chips.length === 0);
  }
}

function setRuntimeSetupBusy(isBusy) {
  const card = $('#runtime-setup-modal .runtime-setup-card');
  card?.classList.toggle('installing', Boolean(isBusy));
  $$('#runtime-setup-modal [data-setup-profile]').forEach(button => { button.disabled = Boolean(isBusy); });
  $('#runtime-setup-progress-actions')?.classList.add('hidden');
}

function closeRuntimeSetupModal() {
  $('#runtime-setup-modal')?.classList.add('hidden');
  document.body.classList.remove('runtime-setup-open');
}

function completeRuntimeSetup(profile, label) {
  markRuntimeSetupChoice(profile, label);
  closeRuntimeSetupModal();
  setRuntimeSetupBusy(false);
  pendingRuntimeSetupProfile = null;
}

function exploreRuntimeSetupWhileInstalling() {
  const profile = pendingRuntimeSetupProfile || localStorage.getItem(RUNTIME_SETUP_KEY) || 'recommended';
  markRuntimeSetupChoice(profile, RUNTIME_SETUP_LABELS[profile] || 'Recomendado');
  closeRuntimeSetupModal();
  beginWelcomeTour();
  toast('Puedes explorar ClipDock mientras se terminan de instalar los complementos.', 'info');
}

async function auditRuntimeSetupSelection(profile, reason = 'setup-saltado') {
  if (!profile) return;
  const selectedAt = localStorage.getItem('clipdockRuntimeSetupDate') || '';
  const auditKey = `${profile}:${selectedAt || 'sin-fecha'}:${reason}`;
  if (localStorage.getItem(RUNTIME_SETUP_AUDIT_KEY) === auditKey) return;
  try {
    const result = await api('/api/runtime/setup-audit', { method: 'POST', body: JSON.stringify({ profile, reason, selectedAt }) });
    localStorage.setItem(RUNTIME_SETUP_AUDIT_KEY, auditKey);
    if (result?.logPath) localStorage.setItem('clipdockRuntimeSetupLastLog', result.logPath);
  } catch (error) {
    console.warn('No se pudo registrar el log de setup inicial', error);
  }
}

async function pollRuntimeSetupJob(profile, label, jobId) {
  window.clearTimeout(runtimeSetupPollTimer);
  while (jobId) {
    await new Promise(resolve => { runtimeSetupPollTimer = window.setTimeout(resolve, 850); });
    const job = await api(`/api/jobs/${jobId}`);
    const progress = job.progress || {};
    setRuntimeSetupProgress(progress.percent || 0, progress.message || 'Preparando ClipDock…', `Preparando ${label}`, progress.details || {});
    if (job.state === 'completed') {
      setRuntimeSetupProgress(100, `${label} listo. Entrando a ClipDock…`, `Preparando ${label}`, progress.details || {});
      if (progress.details?.logPath) localStorage.setItem('clipdockRuntimeSetupLastLog', progress.details.logPath);
      await new Promise(resolve => setTimeout(resolve, 450));
      completeRuntimeSetup(profile, label);
      toast(`ClipDock ${label} listo`, 'ok');
      return;
    }
    if (['failed', 'cancelled'].includes(job.state)) {
      throw new Error(job.error || 'No se pudo terminar la preparación inicial');
    }
  }
}

async function chooseRuntimeSetupProfile(profile) {
  const label = RUNTIME_SETUP_LABELS[profile] || 'Recomendado';
  pendingRuntimeSetupProfile = profile;
  $('#runtime-setup-modal .runtime-setup-card')?.classList.add('setup-profile-picked');
  setRuntimeSetupBusy(true);
  setRuntimeSetupProgress(0, `Preparando instalación ${label}…`, `Preparando ${label}`, {});
  try {
    const response = await api('/api/runtime/setup', { method: 'POST', body: JSON.stringify({ profile }) });
    const jobId = response.jobId || response.job?.id;
    if (!jobId) throw new Error('No se pudo iniciar la preparación inicial');
    await pollRuntimeSetupJob(profile, response.profile?.label || label, jobId);
  } catch (error) {
    setRuntimeSetupBusy(false);
    setRuntimeSetupProgress(100, error.message || 'No se pudo preparar ClipDock. Puedes reintentar o continuar y repararlo después desde Ajustes.', `Error preparando ${label}`, {});
    const actions = $('#runtime-setup-progress-actions');
    if (actions) actions.classList.remove('hidden');
    toast(error.message || 'No se pudo preparar ClipDock', 'error');
  }
}

function setupRuntimeSetupModal() {
  const modal = $('#runtime-setup-modal');
  if (!modal) return;
  modal.querySelectorAll('[data-setup-profile]').forEach(button => {
    button.addEventListener('click', () => chooseRuntimeSetupProfile(button.dataset.setupProfile || 'recommended'));
  });
  modal.querySelectorAll('[data-runtime-link]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      const url = button.dataset.runtimeLink || '';
      if (url) window.desktop?.openExternal?.(url);
    });
  });
  $('#runtime-setup-retry')?.addEventListener('click', () => chooseRuntimeSetupProfile(pendingRuntimeSetupProfile || 'recommended'));
  $('#runtime-setup-continue')?.addEventListener('click', () => {
    const profile = pendingRuntimeSetupProfile || 'recommended';
    completeRuntimeSetup(profile, RUNTIME_SETUP_LABELS[profile] || 'Recomendado');
    toast('Puedes completar componentes faltantes después desde Ajustes', 'info');
  });
  $('#runtime-setup-explore')?.addEventListener('click', exploreRuntimeSetupWhileInstalling);
  const track = $('#runtime-repos-track');
  const prev = $('#runtime-repos-prev');
  const next = $('#runtime-repos-next');
  const scrollRepos = direction => {
    if (!track) return;
    const amount = Math.max(260, Math.floor(track.clientWidth * 0.82));
    track.scrollBy({ left: amount * direction, behavior: 'smooth' });
  };
  prev?.addEventListener('click', event => { event.preventDefault(); scrollRepos(-1); });
  next?.addEventListener('click', event => { event.preventDefault(); scrollRepos(1); });
}

function showRuntimeSetupIfNeeded() {
  const modal = $('#runtime-setup-modal');
  if (!modal) return;
  const selected = localStorage.getItem(RUNTIME_SETUP_KEY);
  if (selected) {
    auditRuntimeSetupSelection(selected, 'setup-saltado-eleccion-previa');
    return;
  }
  modal.classList.remove('hidden');
  modal.querySelector('.runtime-setup-card')?.classList.remove('setup-profile-picked', 'installing', 'install-done');
  document.body.classList.add('runtime-setup-open');
  updateWelcomeTourHighlights();
}

document.addEventListener('DOMContentLoaded', async () => {
  const runtime = await window.desktop?.runtimeInfo();
  if (runtime?.baseUrl) baseUrl = runtime.baseUrl;
  try { settings = await api('/api/settings'); outputDir = settings.outputDir || outputDir; } catch (_) { /* motor still starting */ }
  applyInterfaceSettings();
  if ($('#output-folder')) {
    $('#output-folder').textContent = outputDir || 'Sin seleccionar';
    $('#change-folder')?.setAttribute('title', outputDir ? `Salida: ${outputDir}` : 'Salida');
  }
  $('#settings-output-folder').textContent = outputDir || 'Sin seleccionar';
  if (outputDir && $('#download-hint')) $('#download-hint').textContent = 'Añadir a la cola';
  $$('.nav-item').forEach(item => item.addEventListener('click', () => switchView(item.dataset.view)));
  $('#sidebar-compact-toggle')?.addEventListener('click', () => setSidebarCompact(!document.body.classList.contains('sidebar-compact'), true));
  window.addEventListener('resize', syncSidebarCompactMode);
  syncSidebarCompactMode();
  $('#sidebar-version')?.addEventListener('click', () => {
    switchView('settings');
    activateSettingsSection('updates');
  });
  $('#change-folder').addEventListener('click', chooseOutput);
  $('#analyze-button').addEventListener('click', analyze);
  applyDownloadMode(downloadMode);
  $$('#download-mode-switch .mode-option').forEach(button => button.addEventListener('click', () => applyDownloadMode(button.dataset.downloadMode)));
  $('#ultra-choices')?.addEventListener('click', event => {
    const choice = event.target.closest('[data-ultra-choice]');
    if (!choice) return;
    ultraChoice = choice.dataset.ultraChoice;
    $$('#ultra-choices .ultra-choice').forEach(button => button.classList.toggle('active', button === choice));
  });
  $('#ultra-trim-start-range')?.addEventListener('input', ultraSyncTrim);
  $('#ultra-trim-end-range')?.addEventListener('input', ultraSyncTrim);
  $('#ultra-start')?.addEventListener('change', () => { const s = $('#ultra-trim-start-range'); if (s) { s.value = Math.min(parseClock($('#ultra-start').value), Number(s.max) - 1); ultraSyncTrim(); } });
  $('#ultra-end')?.addEventListener('change', () => { const e = $('#ultra-trim-end-range'); if (e) { e.value = Math.min(parseClock($('#ultra-end').value), Number(e.max)); ultraSyncTrim(); } });
  $('#ultra-trim-reset')?.addEventListener('click', ultraResetTrim);
  $('#ultra-download')?.addEventListener('click', ultraDownload);
  $('#url-input').addEventListener('keydown', event => { if (event.key === 'Enter') analyze(); });
  $('#url-input').addEventListener('paste', () => setTimeout(() => { $('#url-input').value = normalizeUrl($('#url-input').value); if (settings.autoAnalyze) analyze(); }, 0));
  $('#url-input').addEventListener('input', () => {
    if (($('#url-input').value.match(/https?:\/\//ig) || []).length > 1) $('#url-input').value = normalizeUrl($('#url-input').value);
  });
  $('#paste-url').addEventListener('click', async () => {
    const clipboardText = window.desktop?.readClipboard ? await window.desktop.readClipboard() : await navigator.clipboard.readText();
    $('#url-input').value = normalizeUrl(clipboardText);
    if (settings.autoAnalyze) analyze();
  });
  $('#retry-analysis').addEventListener('click', analyze);
  $('#close-component-required').addEventListener('click', () => $('#component-required-modal').classList.add('hidden'));
  $('#component-required-modal').addEventListener('click', event => { if (event.target === $('#component-required-modal')) $('#component-required-modal').classList.add('hidden'); });
  $('#required-component-settings').addEventListener('click', openComponentsSettings);
  $('#required-component-install').addEventListener('click', installRequiredComponents);
  $('#confirm-close').addEventListener('click', () => finishConfirm(false));
  $('#confirm-cancel').addEventListener('click', () => finishConfirm(false));
  $('#confirm-accept').addEventListener('click', () => finishConfirm(true));
  $('#confirm-modal').addEventListener('click', event => { if (event.target === $('#confirm-modal')) finishConfirm(false); });
  $('#open-cookie-settings').addEventListener('click', () => {
    switchView('settings');
    activateSettingsSection('cookies');
  });
  $$('.tool-card').forEach(card => card.addEventListener('click', () => showAiTool(card.dataset.tool)));
  $('#pick-image').addEventListener('click', pickImage);
  $('#pick-image-button').addEventListener('click', pickImage);
  $('#paste-image').addEventListener('click', pasteImageFromClipboard);
  $$('.image-tabs button').forEach(button => button.addEventListener('click', () => {
    $$('.image-tabs button').forEach(item => item.classList.toggle('active', item === button));
    $$('.image-options').forEach(section => section.classList.toggle('active', section.id === `image-options-${button.dataset.imageTab}`));
  }));
  $('#image-quality').addEventListener('input', () => { $('#image-quality-value').textContent = $('#image-quality').value; });
  $('#process-image').addEventListener('click', processImage);
  $('#process-all-images').addEventListener('click', processAllImages);
  $('#image-universal-settings').addEventListener('click', openImageUniversalModal);
  $('#close-image-universal')?.addEventListener('click', closeImageUniversalModal);
  $('#image-universal-backdrop')?.addEventListener('click', closeImageUniversalModal);
  $('#image-folder-settings')?.addEventListener('click', openImageFolderModal);
  $('#close-image-folder')?.addEventListener('click', closeImageFolderModal);
  $('#cancel-image-folder')?.addEventListener('click', closeImageFolderModal);
  $('#apply-image-folder')?.addEventListener('click', applyImageFolderName);
  $('#image-folder-modal')?.addEventListener('click', event => { if (event.target === $('#image-folder-modal')) closeImageFolderModal(); });
  $('#image-folder-name')?.addEventListener('keydown', event => { if (event.key === 'Enter') applyImageFolderName(); if (event.key === 'Escape') closeImageFolderModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeImageUniversalModal(); closeImageFolderModal(); } });
  $('#image-session-list').addEventListener('click', async event => {
    const select = event.target.closest('[data-image-select]');
    const process = event.target.closest('[data-image-process]');
    const remove = event.target.closest('[data-image-remove]');
    if (select) await selectImageItem(select.dataset.imageSelect);
    if (process) await processImageItem(imageSession.find(item => item.id === process.dataset.imageProcess), true);
    if (remove) {
      imageSession = imageSession.filter(item => item.id !== remove.dataset.imageRemove);
      if (activeImageId === remove.dataset.imageRemove) activeImageId = imageSession.at(-1)?.id || null;
      if (activeImageId) await selectImageItem(activeImageId);
      else renderImageSession();
    }
  });
  ['resize-enabled','upscale-enabled','remove-background','canvas-enabled','background-enabled'].forEach(id => $(`#${id}`)?.addEventListener('change', updateImageControlStates));
  document.addEventListener('paste', event => {
    if (!$('#view-enhance')?.classList.contains('active')) return;
    if (['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName)) return;
    event.preventDefault();
    pasteImageFromClipboard();
  });
  updateImageControlStates();
  renderImageSession();
  $('#upload-ai-video-button').addEventListener('click', () => pickAiVideo('append'));
  $('#pick-ai-video-button').addEventListener('click', () => pickAiVideo('replace'));
  $('#convert-universal-settings')?.addEventListener('click', () => openUniversalSettings('local'));
  $('#convert-folder-settings')?.addEventListener('click', openConvertFolderModal);
  $('#close-convert-folder')?.addEventListener('click', closeConvertFolderModal);
  $('#cancel-convert-folder')?.addEventListener('click', closeConvertFolderModal);
  $('#apply-convert-folder')?.addEventListener('click', applyConvertFolderName);
  $('#convert-folder-modal')?.addEventListener('click', event => { if (event.target === $('#convert-folder-modal')) closeConvertFolderModal(); });
  $('#convert-folder-name')?.addEventListener('keydown', event => { if (event.key === 'Enter') applyConvertFolderName(); if (event.key === 'Escape') closeConvertFolderModal(); });
  $('#add-convert-videos').addEventListener('click', () => pickAiVideo('append'));
  $('#process-ai-video').addEventListener('click', () => processAiVideo());
  $('#process-all-videos').addEventListener('click', () => processAiVideo([...currentConvertFiles], { exportFolder: true }));
  $('#convert-session-list').addEventListener('click', async event => {
    const select = event.target.closest('[data-convert-select]');
    const process = event.target.closest('[data-convert-process]');
    const remove = event.target.closest('[data-convert-remove]');
    if (select) await setAiVideo(select.dataset.convertSelect);
    if (process) await processAiVideo([process.dataset.convertProcess]);
    if (remove) {
      const path = remove.dataset.convertRemove;
      currentConvertFiles = currentConvertFiles.filter(file => file !== path);
      if (currentAiVideo === path) {
        const next = currentConvertFiles.at(-1);
        if (next) await setAiVideo(next); else clearAiVideoPreview();
      } else renderConvertSession();
    }
  });
  renderConvertSession();
  $('#video-preview').addEventListener('loadedmetadata', () => { currentVideoDuration = $('#video-preview').duration || 0; resetVideoTrim(); });
  $('#video-trim-start-range').addEventListener('input', syncVideoTrimUI);
  $('#video-trim-end-range').addEventListener('input', syncVideoTrimUI);
  $('#video-trim-start').addEventListener('change', () => syncVideoTrimUI('text'));
  $('#video-trim-end').addEventListener('change', () => syncVideoTrimUI('text'));
  $('#reset-video-trim').addEventListener('click', resetVideoTrim);
  $('#video-ai-enabled').addEventListener('change', () => $('#video-ai-enabled').closest('.ai-video-section').classList.toggle('disabled', !$('#video-ai-enabled').checked));
  $('#video-output-format')?.addEventListener('change', renderVideoOutputProfiles);
  $('#video-output-profile')?.addEventListener('change', updateVideoOutputState);
  $('#video-output-speed')?.addEventListener('change', updateVideoOutputState);
  $('#video-output-enabled')?.addEventListener('change', updateVideoOutputState);
  renderVideoOutputProfiles();
  $('#refresh-jobs').addEventListener('click', loadJobs);
  $$('.queue-tab').forEach(tab => tab.addEventListener('click', () => switchQueueTab(tab.dataset.queueTab)));
  $('#refresh-programs')?.addEventListener('click', () => loadPrograms(true));
  $('#programs-list')?.addEventListener('click', event => {
    const folder = event.target.closest('[data-program-folder]');
    const uninstall = event.target.closest('[data-program-uninstall]');
    const update = event.target.closest('[data-program-update]');
    if (folder) { window.desktop?.showItem(folder.dataset.programFolder); return; }
    if (update) return updateProgram(update.dataset.programUpdate, update.dataset.programType);
    if (uninstall) uninstallProgram(uninstall.dataset.programUninstall, uninstall.dataset.programType);
  });

  $('#capture-sfx')?.addEventListener('click', () => openAssetCapture('sfx'));
  $('#capture-vfx')?.addEventListener('click', () => openAssetCapture('vfx'));
  $('#close-asset-capture')?.addEventListener('click', () => $('#asset-capture-modal').classList.add('hidden'));
  $('#asset-start-range')?.addEventListener('input', syncAssetTrimUI);
  $('#asset-end-range')?.addEventListener('input', syncAssetTrimUI);
  $('#asset-start')?.addEventListener('change', () => { const max = Number($('#asset-end-range').max || 1); $('#asset-start-range').value = Math.min(parseClock($('#asset-start').value), max - 1); syncAssetTrimUI(); });
  $('#asset-end')?.addEventListener('change', () => { const max = Number($('#asset-end-range').max || 1); $('#asset-end-range').value = Math.min(parseClock($('#asset-end').value), max); syncAssetTrimUI(); });
  $('#asset-full-video')?.addEventListener('click', () => {
    if (!pendingAssetCapture?.info) return;
    const duration = Math.max(1, Math.floor(Number(pendingAssetCapture.info.duration || 1)));
    $('#asset-start-range').value = 0; $('#asset-end-range').value = duration; syncAssetTrimUI();
  });
  $('#save-asset-fragment')?.addEventListener('click', saveAssetFragment);
  $('#refresh-assets')?.addEventListener('click', loadAssets);
  $('#open-assets-folder')?.addEventListener('click', async () => {
    try { const data = await api('/api/assets'); assetFolders = data.folders || {}; if (assetFolders.root) await window.desktop?.openPath(assetFolders.root); }
    catch (error) { toast(error.message || 'No se pudo abrir la carpeta', 'error'); }
  });
  $$('.asset-tabs button').forEach(button => button.addEventListener('click', () => { assetFilter = button.dataset.assetTab || 'all'; $$('.asset-tabs button').forEach(item => item.classList.toggle('active', item === button)); renderAssetLibrary(); }));
  $('#asset-list')?.addEventListener('click', async event => {
    const play = event.target.closest('[data-asset-play]');
    const seek = event.target.closest('[data-asset-seek]');
    const open = event.target.closest('[data-asset-open]');
    const premiere = event.target.closest('[data-asset-premiere]');
    if (play) { event.preventDefault(); await toggleAssetPlayer(play); return; }
    if (seek) { event.preventDefault(); seekAssetPlayer(seek, event); return; }
    if (open) await window.desktop?.showItem(open.dataset.assetOpen);
    if (premiere) await sendAssetToPremiere(premiere.dataset.assetPremiere);
  });
  $('#send-all-adobe').addEventListener('click', sendAllToAdobe);
  $('#queue-list').addEventListener('click', event => {
    const send = event.target.closest('[data-send-job]');
    const useAi = event.target.closest('[data-use-job-ai]');
    const pause = event.target.closest('[data-pause-job]');
    const resume = event.target.closest('[data-resume-job]');
    const skip = event.target.closest('[data-skip-job]');
    const openFolder = event.target.closest('[data-open-folder]');
    if (openFolder) return openJobFolder(openFolder.dataset.openFolder);
    if (send) sendJobToAdobe(send.dataset.sendJob);
    if (useAi) useJobResultForAI(useAi.dataset.useJobAi);
    if (pause) controlQueueJob(pause.dataset.pauseJob, 'pause');
    if (resume) controlQueueJob(resume.dataset.resumeJob, 'resume');
    if (skip) controlQueueJob(skip.dataset.skipJob, 'cancel');
  });
  $('#universal-settings').addEventListener('click', () => openUniversalSettings('session'));
  $('#download-all').addEventListener('click', downloadAllSession);
  $('#close-universal').addEventListener('click', () => { $('#universal-modal').classList.add('hidden'); $('#universal-modal').classList.remove('local-recode'); recodeDraft = null; });
  $('#universal-modal').addEventListener('click', event => { if (event.target === $('#universal-modal')) { $('#universal-modal').classList.add('hidden'); $('#universal-modal').classList.remove('local-recode'); } });
  $$('.recode-tabs button').forEach(button => button.addEventListener('click', () => {
    $('#disable-recode').checked = false;
    if (recodeDraft) recodeDraft.mode = button.dataset.recodeTab;
    showRecodeSection(button.dataset.recodeTab);
    updateRecodeDisabledState();
  }));
  $('#quick-format').addEventListener('change', () => changeQuickPreset('format'));
  $('#quick-profile').addEventListener('change', () => changeQuickPreset('profile'));
  $$('#recode-manual input, #recode-manual select').forEach(input => input.addEventListener('change', updateRecodeSummary));
  $('#disable-recode').addEventListener('change', () => {
    if (!recodeDraft) recodeDraft = { ...universalRecode };
    if ($('#disable-recode').checked) {
      recodeDraft.mode = 'off';
    } else {
      recodeDraft.mode = $('.recode-tabs button.active')?.dataset.recodeTab || 'quick';
      if (recodeDraft.mode === 'quick' && !recodeDraft.preset) recodeDraft.preset = 'h264_standard';
    }
    updateRecodeDisabledState();
    updateRecodeSummary();
  });
  $('#apply-universal').addEventListener('click', applyUniversalSettings);
  $('#extra-subtitles')?.addEventListener('change', () => { if (recodeDraft) recodeDraft.subtitles = $('#extra-subtitles').checked; updateSubtitleOptionsUI(); });
  $('#extra-subtitle-lang')?.addEventListener('change', () => { if (recodeDraft) recodeDraft.subtitleLang = $('#extra-subtitle-lang').value; updateSubtitleSummary(); });
  $('#extra-subtitle-format')?.addEventListener('change', () => { if (recodeDraft) recodeDraft.subtitleFormat = $('#extra-subtitle-format').value; updateSubtitleSummary(); });
  $('#session-list').addEventListener('click', async event => {
    const remove = event.target.closest('[data-session-remove]');
    const run = event.target.closest('[data-session-download]');
    const advanced = event.target.closest('[data-session-advanced]');
    const trim = event.target.closest('[data-session-trim]');
    const coverAi = event.target.closest('[data-session-cover-ai]');
    const resultAi = event.target.closest('[data-session-result-ai]');
    if (remove) { downloadSession = downloadSession.filter(item => item.id !== remove.dataset.sessionRemove); renderDownloadSession(); }
    if (advanced) openUniversalSettings('item', advanced.dataset.sessionAdvanced);
    if (trim) openFragment(trim.dataset.sessionTrim);
    if (coverAi) importSessionCover(downloadSession.find(item => item.id === coverAi.dataset.sessionCoverAi));
    if (resultAi && !resultAi.disabled) {
      const item = downloadSession.find(entry => entry.id === resultAi.dataset.sessionResultAi);
      if (item?.result) { switchView('convert'); setAiVideo(item.result); }
    }
    if (run) {
      if (!outputDir) await chooseOutput();
      const item = downloadSession.find(entry => entry.id === run.dataset.sessionDownload);
      if (item && outputDir && await startSessionDownload(item)) toast('Descarga añadida a la cola');
    }
  });
  $('#session-list').addEventListener('change', event => {
    const bindings = [
      ['sessionQuality', 'quality'], ['sessionContent', 'content'], ['sessionThumbnail', 'saveThumbnail'],
      ['sessionSubtitleFormat', 'subtitleFormat']
    ];
    for (const [datasetKey, property] of bindings) {
      const itemId = event.target.dataset[datasetKey];
      if (!itemId) continue;
      const item = downloadSession.find(entry => entry.id === itemId);
      if (!item) return;
      item[property] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      if (property === 'subtitleFormat') localStorage.setItem('subtitleFormat', item[property]);
      renderDownloadSession();
      return;
    }
    if (event.target.dataset.sessionSubtitles) {
      const item = downloadSession.find(entry => entry.id === event.target.dataset.sessionSubtitles);
      if (item) { item.subtitles = event.target.checked; item.subtitleOpen = event.target.checked; renderDownloadSession(); }
    }
    if (event.target.dataset.sessionFragmentToggle) {
      const item = downloadSession.find(entry => entry.id === event.target.dataset.sessionFragmentToggle);
      if (!item) return;
      if (event.target.checked) openFragment(item.id);
      else { item.fragment.enabled = false; renderDownloadSession(); }
    }
  });
  $('#trim-start-range').addEventListener('input', syncFragmentUI);
  $('#trim-end-range').addEventListener('input', syncFragmentUI);
  $('#fragment-start').addEventListener('change', () => { $('#trim-start-range').value = parseClock($('#fragment-start').value); syncFragmentUI(); });
  $('#fragment-end').addEventListener('change', () => { $('#trim-end-range').value = parseClock($('#fragment-end').value); syncFragmentUI(); });
  $('#apply-fragment').addEventListener('click', applyFragment);
  $('#close-fragment').addEventListener('click', () => $('#fragment-modal').classList.add('hidden'));
  $('#disable-fragment').addEventListener('click', () => { const item = downloadSession.find(entry => entry.id === activeFragmentItemId); if (item) item.fragment.enabled = false; $('#fragment-modal').classList.add('hidden'); renderDownloadSession(); });
  $('#settings-change-folder').addEventListener('click', chooseOutput);
  $('#pref-minimize-tray')?.addEventListener('change', event => saveAppPref('minimizeToTray', event.target.checked));
  $('#pref-auto-launch')?.addEventListener('change', event => saveAppPref('autoLaunch', event.target.checked));
  $('#pref-start-minimized')?.addEventListener('change', event => saveAppPref('startMinimized', event.target.checked));
  loadAppPrefs();
  $$('.settings-nav button').forEach(button => button.addEventListener('click', () => activateSettingsSection(button.dataset.settingsSection)));
  $$('[data-settings-jump]').forEach(button => button.addEventListener('click', () => activateSettingsSection(button.dataset.settingsJump)));
  $$('[data-open-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.openView)));
  $$('[data-accent-color]').forEach(button => button.addEventListener('click', () => updateAccentColor(button.dataset.accentColor, true)));
  $$('[data-setting]').forEach(input => input.addEventListener('change', () => saveSettings({ [input.dataset.setting]: input.checked })));
  $('#interface-scale')?.addEventListener('input', event => updateInterfaceScale('interface', event.target.value, false));
  $('#interface-scale')?.addEventListener('change', event => updateInterfaceScale('interface', event.target.value, true));
  $('#font-scale')?.addEventListener('input', event => updateInterfaceScale('font', event.target.value, false));
  $('#font-scale')?.addEventListener('change', event => updateInterfaceScale('font', event.target.value, true));
  $('#title-scale')?.addEventListener('input', event => updateInterfaceScale('title', event.target.value, false));
  $('#title-scale')?.addEventListener('change', event => updateInterfaceScale('title', event.target.value, true));
  $$('.scale-presets button').forEach(button => button.addEventListener('click', () => {
    const target = button.closest('.scale-presets')?.dataset.scaleTarget;
    const kind = target === 'interface-scale' ? 'interface' : target === 'title-scale' ? 'title' : 'font';
    updateInterfaceScale(kind, button.dataset.scaleValue, true);
  }));
  $('#cookie-mode').addEventListener('change', () => { $('#cookie-mode').value = 'file'; updateCookiePanels(); saveSettings({ cookieMode: 'file' }); });
  $('#cookie-browser').addEventListener('change', () => saveSettings({ browser: $('#cookie-browser').value }));
  $('#cookie-profile').addEventListener('change', () => saveSettings({ browserProfile: $('#cookie-profile').value }));
  $('#install-cookie-chrome').addEventListener('click', () => window.desktop?.openCookieExtension?.('chrome'));
  $('#install-cookie-firefox').addEventListener('click', () => window.desktop?.openCookieExtension?.('firefox'));
  $('#open-cookie-github').addEventListener('click', () => window.desktop?.openCookieExtension?.('github'));
  $('#open-cookies-folder').addEventListener('click', async () => { try { await window.desktop?.openCookiesFolder?.(); } catch (error) { toast(error.message, 'error'); } });
  $('#test-cookies')?.addEventListener('click', () => testCookies());
  $('#import-cookie-export').addEventListener('click', () => importCookieExport());
  $('#pick-cookie').addEventListener('click', async () => {
    const files = await window.desktop?.pickFiles([{ name: 'Cookies', extensions: ['txt'] }]);
    if (!files?.length) return;
    $('#cookie-file').value = files[0];
    await saveSettings({ cookieFile: files[0], cookieMode: 'file' });
    $('#cookie-mode').value = 'file';
    updateCookiePanels();
    refreshCookieStatus();
  });
  $('#model-list').addEventListener('click', event => {
    const install = event.target.closest('[data-model-download]');
    const remove = event.target.closest('[data-model-delete]');
    if (install) installModel(install.dataset.modelDownload, install);
    if (remove) deleteModel(remove.dataset.modelDelete);
  });
  $('#component-list').addEventListener('click', event => {
    const runtimeUpdate = event.target.closest('[data-runtime-update]');
    if (runtimeUpdate) return updateEngineRuntime(runtimeUpdate);
    const install = event.target.closest('[data-component-install]');
    const remove = event.target.closest('[data-component-delete]');
    if (install) installComponent(install.dataset.componentInstall, install);
    if (remove) deleteComponent(remove.dataset.componentDelete);
  });
  $('#plugin-catalog-list')?.addEventListener('click', event => {
    const install = event.target.closest('[data-plugin-install]');
    const remove = event.target.closest('[data-plugin-uninstall]');
    const location = event.target.closest('[data-plugin-location]');
    if (install) return installPlugin(install.dataset.pluginInstall, install);
    if (remove) return uninstallPlugin(remove.dataset.pluginUninstall);
    if (location) return window.desktop?.openPluginLocation?.(location.dataset.pluginLocation);
    // Clic en la tarjeta (fuera de botones): abre la página del complemento.
    const cardEl = event.target.closest('.plugin-card');
    if (cardEl?.dataset.pluginId) openPluginDetail(cardEl.dataset.pluginId);
  });
  $('#plugin-detail-modal')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) return closePluginDetail();
    if (event.target.closest('#plugin-detail-close')) return closePluginDetail();
    const install = event.target.closest('[data-plugin-install]');
    if (install && !install.disabled) return installPlugin(install.dataset.pluginInstall, install);
    const remove = event.target.closest('[data-plugin-uninstall]');
    if (remove) return uninstallPlugin(remove.dataset.pluginUninstall);
    const support = event.target.closest('[data-detail-support]');
    if (support) return window.desktop?.openExternal?.(support.dataset.detailSupport);
  });
  $('#sidebar-plugin-welcome')?.addEventListener('click', openOfficialPluginWelcome);
  $('#sidebar-plugin-welcome')?.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openOfficialPluginWelcome(); } });
  $('#sidebar-plugin-welcome-close')?.addEventListener('click', event => { event.stopPropagation(); dismissOfficialPluginNotice(); });
  $('#refresh-plugins')?.addEventListener('click', loadPlugins);
  $('#update-all-plugins')?.addEventListener('click', event => updateAllPlugins(event.currentTarget));
  $('#plugin-info-toggle')?.addEventListener('click', () => $('#plugin-info-modal')?.classList.remove('hidden'));
  $('#close-plugin-info')?.addEventListener('click', () => $('#plugin-info-modal')?.classList.add('hidden'));
  $('#plugin-info-modal')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) event.currentTarget.classList.add('hidden');
  });
  document.querySelectorAll('[data-plugin-info-link]').forEach(button => {
    button.addEventListener('click', () => window.desktop?.openExternal?.(button.dataset.pluginInfoLink));
  });
  $('#set-plugin-remote-catalog')?.addEventListener('click', configureRemotePluginCatalog);
  $('#plugin-search')?.addEventListener('input', renderPlugins);
  $('#plugin-search')?.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.currentTarget.value = '';
      $('#plugin-search-shell')?.setAttribute('hidden', 'hidden');
      renderPlugins();
    }
  });
  $('#plugin-search-toggle')?.addEventListener('click', () => {
    const shell = $('#plugin-search-shell');
    const input = $('#plugin-search');
    if (!shell || !input) return;
    const willOpen = shell.hasAttribute('hidden');
    if (willOpen) {
      shell.removeAttribute('hidden');
      requestAnimationFrame(() => input.focus());
    } else {
      const hadValue = Boolean(input.value.trim());
      input.value = '';
      shell.setAttribute('hidden', 'hidden');
      if (hadValue) renderPlugins();
    }
  });
  $$('[data-plugin-filter]').forEach(button => button.addEventListener('click', () => {
    pluginFilter = button.dataset.pluginFilter || 'all';
    $$('[data-plugin-filter]').forEach(item => item.classList.toggle('active', item === button));
    renderPlugins();
  }));
  $('#open-plugins-folder')?.addEventListener('click', () => window.desktop?.openPluginsRoot?.());
  $('#open-plugin-catalog')?.addEventListener('click', () => window.desktop?.openPluginCatalogSource?.());
  $('#open-components-folder').addEventListener('click', async () => {
    try { const data = await api('/api/components-folder', { method: 'POST', body: '{}' }); window.desktop?.openPath(data.path); }
    catch (error) { toast(error.message, 'error'); }
  });
  $('#open-models-folder').addEventListener('click', async () => {
    try { const data = await api('/api/models-folder', { method: 'POST', body: '{}' }); window.desktop?.openPath(data.path); }
    catch (error) { toast(error.message, 'error'); }
  });
  $('#repair-runtime-profile')?.addEventListener('click', event => repairRuntimeSetupProfile(event.currentTarget));
  $('#open-setup-logs')?.addEventListener('click', openSetupLogsFolder);
  $('#open-last-setup-log')?.addEventListener('click', openLastSetupLog);
  $('#check-component-updates')?.addEventListener('click', event => checkComponentUpdates(event.currentTarget));
  $('#check-model-updates')?.addEventListener('click', event => checkModelUpdates(event.currentTarget));
  $('#check-updates')?.addEventListener('click', () => refreshUpdateStatus(false));
  $('#install-update')?.addEventListener('click', installLatestUpdate);
  $('#startup-update-close')?.addEventListener('click', closeStartupUpdateModal);
  $('#startup-update-later')?.addEventListener('click', closeStartupUpdateModal);
  $('#startup-update-action')?.addEventListener('click', runStartupUpdateAction);
  $('#startup-update-modal')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeStartupUpdateModal();
  });
  $('#open-github-repo')?.addEventListener('click', () => {
    const url = window.updateRepoUrl || 'https://github.com/depsoniac/ClipDock';
    window.desktop?.openExternal?.(url);
  });
  $$('[data-about-link]').forEach(button => button.addEventListener('click', () => {
    const url = button.dataset.aboutLink;
    if (url) window.desktop?.openExternal?.(url);
  }));
  $('#titlebar-share')?.addEventListener('click', copyShareReleaseUrl);
  document.addEventListener('keydown', handleDowpEasterKey);
  $('#dowp-easter-close')?.addEventListener('click', closeDowpEasterEgg);
  $('#dowp-easter-modal')?.addEventListener('click', event => { if (event.target === event.currentTarget) closeDowpEasterEgg(); });
  $('#copy-about-handle')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard?.writeText?.('@depsonop');
      toast('@depsonop copiado al portapapeles', 'ok');
    } catch (_) {
      toast('Tu usuario es @depsonop', 'info');
    }
  });
  bindUpdateProgress();
  window.desktop?.appVersion?.().then(data => {
    const version = data.version || '0.5.43';
    if ($('#app-version-label')) $('#app-version-label').textContent = version;
    if ($('#about-version-label')) $('#about-version-label').textContent = version;
    if ($('#sidebar-version-number')) $('#sidebar-version-number').textContent = `v${version}`;
  }).catch(() => {});
  window.desktop?.onBackendError(showEngineFailure);
  syncSettingsUI();
  setupFloatingDockTooltips();
  $('#video-ai-enabled').closest('.ai-video-section').classList.add('disabled');
  setupSmartDrop();
  window.addEventListener('focus', () => setTimeout(checkClipboard, 180));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkClipboard(); });
  setTimeout(checkHealth, 700);
  setTimeout(loadRecodePresets, 900);
  setTimeout(checkStartupUpdateCenter, 1800);
  setTimeout(() => refreshUpdateStatus(true), 3600);
  setTimeout(checkClipboard, 1000);
  setInterval(() => {
    loadJobs();
    checkHealth();
    if ($('#view-queue')?.classList.contains('active') && $('#queue-pane-programs')?.classList.contains('active')) loadPrograms();
  }, 2500);
  setInterval(checkAdobe, 1500);
});
// ClipDock: cola de trabajos con pestañas Trabajos/Programas.
