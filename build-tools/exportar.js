#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const https = require('https');
const readline = require('readline');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const PY_VERSION = process.env.CLIPDOCK_EMBED_PYTHON_VERSION || '3.11.9';
process.chdir(root);

const MAC_PYTHON_STANDALONE = {
  arm64: {
    label: 'macOS Apple Silicon',
    url: process.env.CLIPDOCK_MAC_PYTHON_ARM64_URL || 'https://github.com/astral-sh/python-build-standalone/releases/download/20240415/cpython-3.11.9%2B20240415-aarch64-apple-darwin-install_only.tar.gz'
  },
  x64: {
    label: 'macOS Intel',
    url: process.env.CLIPDOCK_MAC_PYTHON_X64_URL || 'https://github.com/astral-sh/python-build-standalone/releases/download/20240415/cpython-3.11.9%2B20240415-x86_64-apple-darwin-install_only.tar.gz'
  }
};

function line() { console.log('=================================================='); }
function log(msg = '') { console.log(msg); }
function fail(msg) { throw new Error(msg); }
function sha256Text(text) { return crypto.createHash('sha256').update(String(text)).digest('hex'); }
function readStamp(stampPath) { try { return JSON.parse(fs.readFileSync(stampPath, 'utf8')); } catch (_) { return null; } }
function writeStamp(stampPath, data) { fs.mkdirSync(path.dirname(stampPath), { recursive: true }); fs.writeFileSync(stampPath, JSON.stringify(data, null, 2), 'utf8'); }
function fileExists(relPath) { return fs.existsSync(path.join(root, relPath)); }
function mark(ok, label, detail = '') { log(`${ok ? '[OK]' : '[ERROR]'} ${label}${detail ? ` - ${detail}` : ''}`); return { ok, label, detail }; }
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes; let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
function dirSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      try { if (entry.isDirectory()) walk(full); else total += fs.statSync(full).size; } catch (_) {}
    }
  };
  walk(dir);
  return total;
}
function readJson(file) { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); }
function writeJson(file, data) { fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + '\n', 'utf8'); }
function commandExists(file) {
  const check = cp.spawnSync(process.platform === 'win32' ? 'where' : 'which', [file], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', shell: false, windowsHide: true });
  return check.status === 0;
}
function needsWindowsShell(file) {
  if (process.platform !== 'win32') return false;
  const base = path.basename(String(file)).toLowerCase();
  return ['npm', 'npm.cmd', 'npx', 'npx.cmd'].includes(base);
}
function run(file, args = [], options = {}) {
  log(`> ${file} ${args.join(' ')}`);
  const res = cp.spawnSync(file, args, {
    cwd: options.cwd || root,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    shell: needsWindowsShell(file),
    windowsHide: true,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', ...(options.env || {}) }
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    if (options.capture) {
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
    }
    throw new Error(`Fallo: ${file} codigo ${res.status}`);
  }
  return res;
}
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(String(answer || '').trim()); }));
}
function parseArgs() {
  const out = { target: '', version: '', noVersionPrompt: false };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--target' || arg === '-t') out.target = String(args[++i] || '').trim();
    else if (arg.startsWith('--target=')) out.target = arg.split('=').slice(1).join('=').trim();
    else if (arg === '--version' || arg === '-v') out.version = String(args[++i] || '').trim();
    else if (arg.startsWith('--version=')) out.version = arg.split('=').slice(1).join('=').trim();
    else if (arg === '--no-version-prompt' || arg === '--ci') out.noVersionPrompt = true;
  }
  if (process.env.CLIPDOCK_EXPORT_TARGET && !out.target) out.target = process.env.CLIPDOCK_EXPORT_TARGET;
  if (process.env.CLIPDOCK_EXPORT_VERSION && !out.version) out.version = process.env.CLIPDOCK_EXPORT_VERSION;
  if (process.env.CI) out.noVersionPrompt = true;
  return out;
}
function validateVersion(version) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) fail(`Version invalida: ${version}. Usa formato tipo 1.0.6`);
}
function updateVersionFiles(version) {
  const pkg = readJson('package.json');
  pkg.version = version;
  writeJson('package.json', pkg);
  const lockPath = path.join(root, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (lock.version) lock.version = version;
      if (lock.packages && lock.packages['']) lock.packages[''].version = version;
      fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
    } catch (_) { log('Aviso: no pude actualizar package-lock.json, npm lo corregira si hace falta.'); }
  }
}
function ensureRequirements() {
  const reqPath = path.join(root, 'engine', 'requirements.txt');
  if (fs.existsSync(reqPath)) return;
  log('No encontre engine/requirements.txt, lo voy a regenerar...');
  fs.mkdirSync(path.dirname(reqPath), { recursive: true });
  fs.writeFileSync(reqPath, [
    'yt-dlp[default]', 'requests', 'py7zr', 'Pillow', 'pillow-avif-plugin', 'numpy', 'rawpy', 'onnxruntime', 'rembg',
    'CairoSVG', 'pdf2image', 'img2pdf', 'filetype', 'pikepdf', 'PyPDF2', 'Flask', 'Flask-SocketIO', 'gevent', 'gevent-websocket', ''
  ].join('\n'), 'utf8');
}
function ensureSource() {
  const required = ['package.json', 'main.js', 'preload.js', 'backend/app.py', 'engine/media_core', 'renderer/index.html', 'update-config.json'];
  for (const item of required) {
    if (!fs.existsSync(path.join(root, item))) fail(`Esta carpeta no parece ser el proyecto fuente completo de ClipDock. Falta: ${item}`);
  }
  ensureRequirements();
}
function readJsonFile(relPath, checks) {
  try { const data = JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8')); checks.push(mark(true, relPath, 'JSON valido')); return data; }
  catch (error) { checks.push(mark(false, relPath, `JSON invalido: ${error.message}`)); return null; }
}
function requirePath(relPath, checks, label = relPath) { const ok = fileExists(relPath); checks.push(mark(ok, label, ok ? relPath : `falta ${relPath}`)); return ok; }
function hasExtraResource(pkg, fromValue, toValue) { return Boolean((pkg.build?.extraResources || []).some(item => item.from === fromValue && (!toValue || item.to === toValue))); }
function runReleaseChecklist(stage = 'prebuild', target = 'win') {
  log(''); line(); log(`CHECKLIST DE EXPORTACION (${stage} / ${target})`); line();
  const checks = [];
  for (const [rel, label] of [
    ['package.json', 'package.json'], ['main.js', 'main.js'], ['preload.js', 'preload.js'], ['renderer/index.html', 'renderer/index.html'],
    ['renderer/app.js', 'renderer/app.js'], ['backend/app.py', 'backend/app.py'], ['engine/media_core', 'engine/media_core'],
    ['engine/bridge', 'engine/bridge'], ['engine/requirements.txt', 'engine/requirements.txt'], ['runtime/profiles.json', 'runtime/profiles.json'],
    ['assets/clipdock.ico', 'icono Windows'], ['assets/clipdock-512.png', 'icono macOS'], ['renderer/runtime-download.html', 'UI descarga motor']
  ]) requirePath(rel, checks, label);
  const pkg = readJsonFile('package.json', checks);
  if (pkg) {
    checks.push(mark(Boolean(pkg.version), 'version package.json', pkg.version || 'sin version'));
    checks.push(mark(Boolean(pkg.scripts?.['dist:win']), 'script dist:win', pkg.scripts?.['dist:win'] || 'faltante'));
    checks.push(mark(Boolean(pkg.scripts?.['dist:mac']), 'script dist:mac', pkg.scripts?.['dist:mac'] || 'faltante'));
    checks.push(mark(!pkg.build?.publish, 'electron-builder sin publish', 'publicacion manual'));
    checks.push(mark(hasExtraResource(pkg, 'backend', 'backend'), 'extraResource backend', 'backend -> backend'));
    checks.push(mark(hasExtraResource(pkg, 'engine', 'engine'), 'extraResource engine', 'engine -> engine'));
    checks.push(mark(Boolean(pkg.build?.win), 'config Windows', 'presente'));
    checks.push(mark(Boolean(pkg.build?.mac), 'config macOS', 'presente'));
    checks.push(mark(!hasExtraResource(pkg, 'dist/python-runtime'), 'runtime Python NO empaquetado', 'se descarga en primer arranque'));
  }
  const cfg = readJsonFile('update-config.json', checks);
  if (cfg) {
    checks.push(mark(Boolean(cfg.runtime?.asset), 'runtime Windows en update-config', cfg.runtime?.asset || 'faltante'));
    checks.push(mark(Boolean(cfg.runtime?.assetMacArm64), 'runtime macOS arm64 en update-config', cfg.runtime?.assetMacArm64 || 'faltante'));
    checks.push(mark(Boolean(cfg.runtime?.assetMacX64), 'runtime macOS x64 en update-config', cfg.runtime?.assetMacX64 || 'faltante'));
  }
  const mainText = fileExists('main.js') ? fs.readFileSync(path.join(root, 'main.js'), 'utf8') : '';
  checks.push(mark(/DEFAULT_REMOTE_CATALOG_URL/.test(mainText), 'catalogo remoto por defecto', 'ClipDock-Marketplace'));
  checks.push(mark(/assetMacArm64/.test(mainText) && /assetMacX64/.test(mainText), 'runtime macOS por arquitectura', 'arm64/x64'));
  if (stage === 'post-runtime-win') {
    const runtimeDir = path.join(root, 'dist', 'python-runtime');
    checks.push(mark(fs.existsSync(path.join(runtimeDir, 'python.exe')), 'runtime python.exe', 'dist/python-runtime/python.exe'));
    checks.push(mark(dirSizeBytes(runtimeDir) > 10 * 1024 * 1024, 'runtime Python Windows con contenido', formatBytes(dirSizeBytes(runtimeDir))));
  }
  if (stage === 'post-build-win') {
    const names = releaseFiles(/^ClipDock_Setup_.*\.exe$/i);
    checks.push(mark(Boolean(names[0]), 'instalador Windows generado', names[0]?.name || 'no encontrado'));
  }
  if (stage === 'post-build-mac') {
    const names = releaseFiles(/^ClipDock_Mac_.*\.dmg$/i);
    checks.push(mark(Boolean(names[0]), 'DMG macOS generado', names[0]?.name || 'no encontrado'));
  }
  const failed = checks.filter(item => !item.ok);
  if (failed.length) throw new Error(`Checklist de exportacion fallido (${stage} / ${target})`);
  log(''); log(`Checklist OK (${stage} / ${target}).`);
}
function releaseFiles(regex) {
  const releaseDir = path.join(root, 'release-dist');
  if (!fs.existsSync(releaseDir)) return [];
  return fs.readdirSync(releaseDir).filter(name => regex.test(name)).map(name => {
    const full = path.join(releaseDir, name); const stat = fs.statSync(full);
    return { name, full, size: stat.size, time: stat.mtimeMs };
  }).sort((a, b) => b.time - a.time);
}
function writeReleaseSummary(version, target, extraLines = []) {
  const releaseDir = path.join(root, 'release-dist');
  fs.mkdirSync(releaseDir, { recursive: true });
  const lines = [
    'ClipDock export summary',
    `Version: ${version}`,
    `Target: ${target}`,
    `Fecha: ${new Date().toISOString()}`,
    'Fuente: una sola base de código para Windows y macOS',
    'Complementos: NO empaquetados; se cargan desde github.com/depsoniac/ClipDock-Marketplace',
    ...extraLines,
    ''
  ];
  const output = path.join(releaseDir, `ClipDock_release_checklist_${version}_${target}.txt`);
  fs.writeFileSync(output, lines.join('\n'), 'utf8');
  log(`Resumen de exportacion: ${path.relative(root, output)}`);
}
function downloadToFile(url, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const tempDestination = `${destination}.part`;
  fs.rmSync(tempDestination, { force: true });
  return new Promise((resolve, reject) => {
    const failDownload = error => {
      fs.rmSync(tempDestination, { force: true });
      fs.rmSync(destination, { force: true });
      reject(error);
    };
    const request = (currentUrl, redirects = 0) => {
      const req = https.get(currentUrl, response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          if (redirects > 8) return failDownload(new Error(`Demasiadas redirecciones al descargar ${url}`));
          return request(new URL(response.headers.location, currentUrl).toString(), redirects + 1);
        }
        if (response.statusCode !== 200) {
          response.resume();
          return failDownload(new Error(`Descarga fallida ${response.statusCode}: ${currentUrl}`));
        }
        const file = fs.createWriteStream(tempDestination);
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            fs.renameSync(tempDestination, destination);
            resolve();
          });
        });
        file.on('error', failDownload);
      });
      req.on('error', failDownload);
    };
    request(url);
  });
}
function expandZip(zipPath, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  if (process.platform === 'win32') {
    run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(targetDir)} -Force`]);
    return;
  }
  if (commandExists('unzip')) { run('unzip', ['-q', zipPath, '-d', targetDir]); return; }
  fail('No encontre unzip para extraer ZIP.');
}
function pythonEmbeddablePthName(version) { const [major, minor] = String(version).split('.'); return `python${major}${minor}._pth`; }
function enablePortablePythonSite(runtimeDir, version) {
  const pthPath = path.join(runtimeDir, pythonEmbeddablePthName(version));
  if (!fs.existsSync(pthPath)) return;
  let lines = fs.readFileSync(pthPath, 'utf8').split(/\r?\n/); let hasImportSite = false;
  lines = lines.map(line => /^#?\s*import\s+site\s*$/.test(line) ? (hasImportSite = true, 'import site') : line);
  if (!hasImportSite) lines.push('import site');
  if (!lines.some(line => line.replace(/\\/g, '/') === 'Lib/site-packages')) {
    const importSiteIndex = lines.findIndex(line => /^import\s+site$/.test(line));
    lines.splice(importSiteIndex >= 0 ? importSiteIndex : lines.length, 0, 'Lib/site-packages');
  }
  fs.writeFileSync(pthPath, lines.join('\n'), 'utf8');
}
function pruneRuntimeDir(runtimeDir) {
  if (!fs.existsSync(runtimeDir)) return;
  const removeNames = new Set(['__pycache__', 'tests', 'test']);
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (removeNames.has(entry.name)) fs.rmSync(full, { recursive: true, force: true }); else walk(full);
      } else if (/\.(pyc|pyo)$/i.test(entry.name)) fs.rmSync(full, { force: true });
    }
  };
  walk(runtimeDir);
}
async function prepareWindowsPythonRuntime() {
  if (process.platform !== 'win32') fail('El runtime Windows se prepara desde Windows. Para macOS usa --target mac-runtime en una Mac o GitHub Actions.');
  const arch = process.env.CLIPDOCK_EMBED_PYTHON_ARCH || 'amd64';
  const zipName = `python-${PY_VERSION}-embed-${arch}.zip`;
  const pythonUrl = process.env.CLIPDOCK_EMBED_PYTHON_URL || `https://www.python.org/ftp/python/${PY_VERSION}/${zipName}`;
  const cacheDir = path.join(root, '.build', 'cache', 'python-runtime');
  const zipPath = path.join(cacheDir, zipName);
  const getPipPath = path.join(cacheDir, 'get-pip.py');
  const runtimeDir = path.join(root, 'dist', 'python-runtime');
  const pythonExe = path.join(runtimeDir, 'python.exe');
  const requirementsText = fs.existsSync(path.join(root, 'engine', 'requirements.txt')) ? fs.readFileSync(path.join(root, 'engine', 'requirements.txt'), 'utf8') : '';
  const fingerprint = sha256Text(['win', PY_VERSION, arch, requirementsText].join('\n---\n'));
  const stampPath = path.join(root, '.build', 'runtime-stamp-win.json');
  const previous = readStamp(stampPath);
  if (!process.env.CLIPDOCK_REBUILD_RUNTIME && fs.existsSync(pythonExe) && dirSizeBytes(runtimeDir) > 10 * 1024 * 1024 && previous?.fingerprint === fingerprint) {
    log(`[CACHE] Python mini Windows ${PY_VERSION} ya esta listo.`); return;
  }
  log(`Preparando Python mini Windows (${PY_VERSION})...`);
  if (!fs.existsSync(zipPath)) { log(`Descargando ${zipName}...`); await downloadToFile(pythonUrl, zipPath); }
  else log(`Usando cache: ${zipName}`);
  expandZip(zipPath, runtimeDir);
  enablePortablePythonSite(runtimeDir, PY_VERSION);
  if (!fs.existsSync(getPipPath)) { log('Descargando instalador de pip...'); await downloadToFile('https://bootstrap.pypa.io/get-pip.py', getPipPath); }
  const pipEnv = { env: { PIP_CACHE_DIR: path.join(root, '.build', 'cache', 'pip') } };
  run(pythonExe, [getPipPath, '--no-warn-script-location'], pipEnv);
  run(pythonExe, ['-m', 'pip', 'install', '--upgrade', 'pip', 'wheel', 'setuptools'], pipEnv);
  run(pythonExe, ['-m', 'pip', 'install', '--upgrade', '-r', path.join(root, 'engine', 'requirements.txt')], pipEnv);
  run(pythonExe, ['-m', 'pip', 'install', '--upgrade', 'CairoSVG', 'cairocffi', 'tinycss2', 'cssselect2', 'defusedxml'], pipEnv);
  run(pythonExe, ['-c', 'import sys, flask, requests, yt_dlp; from PIL import Image; print("Runtime Windows OK", sys.version)']);
  pruneRuntimeDir(runtimeDir);
  writeStamp(stampPath, { fingerprint, version: PY_VERSION, arch, builtAt: new Date().toISOString() });
  log('[OK] Python mini Windows listo.');
}
function packWindowsRuntimeAsset() {
  const runtimeDir = path.join(root, 'dist', 'python-runtime');
  if (!fs.existsSync(path.join(runtimeDir, 'python.exe'))) fail('No existe dist/python-runtime para empaquetar el motor Windows.');
  const releaseDir = path.join(root, 'release-dist'); fs.mkdirSync(releaseDir, { recursive: true });
  const zipPath = path.join(releaseDir, `ClipDock_Runtime_python-${PY_VERSION}.zip`);
  const stampPath = path.join(root, '.build', 'runtime-zip-stamp-win.json');
  const runtimeStamp = readStamp(path.join(root, '.build', 'runtime-stamp-win.json'));
  const zipStamp = readStamp(stampPath);
  if (fs.existsSync(zipPath) && runtimeStamp?.fingerprint && zipStamp?.fingerprint === runtimeStamp.fingerprint) { log(`[CACHE] Runtime Windows ya empaquetado: ${path.relative(root, zipPath)}`); return zipPath; }
  log('Empaquetando runtime Windows descargable...');
  fs.rmSync(zipPath, { force: true });
  if (process.platform === 'win32') {
    run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Compress-Archive -Path ${JSON.stringify(path.join(runtimeDir, '*'))} -DestinationPath ${JSON.stringify(zipPath)} -CompressionLevel Optimal -Force`]);
  } else {
    run('zip', ['-ryq', zipPath, '.'], { cwd: runtimeDir });
  }
  writeStamp(stampPath, { fingerprint: runtimeStamp?.fingerprint || '', builtAt: new Date().toISOString() });
  return zipPath;
}
async function prepareMacRuntimeArch(arch) {
  if (process.platform !== 'darwin') fail('El runtime macOS se prepara en macOS. Usa GitHub Actions si estas en Windows.');
  const info = MAC_PYTHON_STANDALONE[arch];
  if (!info) fail(`Arquitectura macOS invalida: ${arch}`);
  const requirementsText = fs.existsSync(path.join(root, 'engine', 'requirements.txt')) ? fs.readFileSync(path.join(root, 'engine', 'requirements.txt'), 'utf8') : '';
  const fingerprint = sha256Text(['mac', PY_VERSION, arch, info.url, requirementsText].join('\n---\n'));
  const releaseDir = path.join(root, 'release-dist'); fs.mkdirSync(releaseDir, { recursive: true });
  const zipPath = path.join(releaseDir, `ClipDock_Runtime_python-${PY_VERSION}-macos-${arch}.zip`);
  const stampPath = path.join(root, '.build', `runtime-stamp-macos-${arch}.json`);
  const previous = readStamp(stampPath);
  if (!process.env.CLIPDOCK_REBUILD_RUNTIME && fs.existsSync(zipPath) && previous?.fingerprint === fingerprint) {
    log(`[CACHE] Runtime ${info.label} ya empaquetado: ${path.relative(root, zipPath)}`); return zipPath;
  }
  const cacheDir = path.join(root, '.build', 'cache', `python-runtime-macos-${arch}`);
  const tarPath = path.join(cacheDir, `python-${PY_VERSION}-macos-${arch}.tar.gz`);
  const workDir = path.join(root, '.build', `python-runtime-macos-${arch}`);
  fs.mkdirSync(cacheDir, { recursive: true });
  if (!fs.existsSync(tarPath)) { log(`Descargando Python standalone ${info.label}...`); await downloadToFile(info.url, tarPath); }
  else log(`Usando cache: ${path.basename(tarPath)}`);
  fs.rmSync(workDir, { recursive: true, force: true }); fs.mkdirSync(workDir, { recursive: true });
  run('tar', ['-xzf', tarPath, '-C', workDir]);
  const runtimeDir = path.join(workDir, 'python');
  const pythonBin = path.join(runtimeDir, 'bin', 'python3');
  if (!fs.existsSync(pythonBin)) fail(`El tar de ${info.label} no contiene bin/python3.`);
  try { fs.chmodSync(pythonBin, 0o755); } catch (_) {}
  const pipEnv = { env: { PIP_CACHE_DIR: path.join(root, '.build', 'cache', `pip-macos-${arch}`) } };
  run(pythonBin, ['-m', 'pip', 'install', '--upgrade', 'pip', 'wheel', 'setuptools'], pipEnv);
  run(pythonBin, ['-m', 'pip', 'install', '--upgrade', '-r', path.join(root, 'engine', 'requirements.txt')], pipEnv);
  try { run(pythonBin, ['-m', 'pip', 'install', '--upgrade', 'CairoSVG', 'cairocffi', 'tinycss2', 'cssselect2', 'defusedxml'], pipEnv); }
  catch (_) { log('Aviso: CairoSVG quedo opcional en runtime macOS.'); }
  run(pythonBin, ['-c', 'import sys, flask, requests, yt_dlp; from PIL import Image; print("Runtime macOS OK", sys.version)']);
  pruneRuntimeDir(runtimeDir);
  fs.rmSync(zipPath, { force: true });
  run('zip', ['-ryq', zipPath, '.'], { cwd: runtimeDir });
  writeStamp(stampPath, { fingerprint, version: PY_VERSION, arch, builtAt: new Date().toISOString() });
  log(`[OK] Runtime ${info.label}: ${path.relative(root, zipPath)} (${formatBytes(fs.statSync(zipPath).size)})`);
  return zipPath;
}
async function prepareMacRuntime(targetArch = 'current') {
  const archs = targetArch === 'all' ? ['arm64', 'x64'] : [targetArch === 'current' ? (process.arch === 'arm64' ? 'arm64' : 'x64') : targetArch];
  const paths = [];
  for (const arch of archs) paths.push(await prepareMacRuntimeArch(arch));
  return paths;
}
function installNodeDeps() {
  if (!commandExists('node')) fail('No encontre Node.js. Instala Node.js LTS. El usuario final no lo necesitara.');
  if (!commandExists('npm')) fail('No encontre npm. Reinstala Node.js LTS marcando npm.');
  const npmStampPath = path.join(root, '.build', 'npm-stamp.json');
  const lockText = fs.existsSync(path.join(root, 'package-lock.json')) ? fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8') : '';
  let lockForHash = lockText;
  try { const lock = JSON.parse(lockText); delete lock.version; if (lock.packages && lock.packages['']) delete lock.packages[''].version; lockForHash = JSON.stringify(lock); } catch (_) {}
  const fingerprint = sha256Text(lockForHash);
  const ready = fs.existsSync(path.join(root, 'node_modules', 'electron')) && fs.existsSync(path.join(root, 'node_modules', 'electron-builder'));
  const previous = readStamp(npmStampPath);
  if (!process.env.CLIPDOCK_REBUILD_NODE && ready && previous?.fingerprint === fingerprint) { log('[CACHE] Dependencias de Node al dia. Salto npm install.'); return; }
  log('Instalando dependencias de Node...');
  run('npm', ['install', '--no-audit', '--no-fund']);
  writeStamp(npmStampPath, { fingerprint, builtAt: new Date().toISOString() });
}
async function chooseTarget(cliTarget) {
  const normalized = String(cliTarget || '').toLowerCase();
  if (['win', 'windows', 'mac', 'macos', 'mac-runtime', 'runtime-mac', 'all'].includes(normalized)) {
    return normalized === 'windows' ? 'win' : normalized === 'macos' ? 'mac' : normalized === 'runtime-mac' ? 'mac-runtime' : normalized;
  }
  if (process.env.CI) return process.platform === 'darwin' ? 'mac' : 'win';
  log('');
  log('¿Qué quieres exportar desde esta misma versión?');
  log('  1) Windows (.exe portable + runtime Windows)');
  log('  2) macOS (.dmg) - solo si estás en Mac o GitHub Actions');
  log('  3) Runtime macOS (.zip del motor Python) - solo Mac/GitHub Actions');
  log('  4) Todo lo posible en esta máquina');
  const answer = await ask(`Elige 1-4 (Enter = ${process.platform === 'darwin' ? '2' : '1'}): `);
  if (answer === '2') return 'mac';
  if (answer === '3') return 'mac-runtime';
  if (answer === '4') return 'all';
  return process.platform === 'darwin' ? 'mac' : 'win';
}
async function resolveVersion(args) {
  const current = readJson('package.json').version || '0.0.1';
  let version = args.version;
  if (!version && !args.noVersionPrompt) {
    log(''); log(`Version actual: ${current}`);
    version = await ask(`Version exacta para exportar (Enter = conservar ${current}): `);
  }
  version = version || current;
  validateVersion(version);
  updateVersionFiles(version);
  return version;
}
async function exportWindows(version) {
  if (process.platform !== 'win32') fail('El export Windows local debe correrse en Windows. En GitHub Actions usa el job Windows.');
  runReleaseChecklist('prebuild', 'win');
  await prepareWindowsPythonRuntime();
  runReleaseChecklist('post-runtime-win', 'win');
  const runtimeZip = packWindowsRuntimeAsset();
  log('[MODO] Compilando instalador Windows local. Publicacion en GitHub: manual.');
  run('npm', ['run', 'dist:win']);
  runReleaseChecklist('post-build-win', 'win');
  writeReleaseSummary(version, 'windows', [
    `Instalador: ${releaseFiles(/^ClipDock_Setup_.*\.exe$/i)[0]?.name || 'no encontrado'}`,
    `Runtime Windows: ${path.basename(runtimeZip)}`,
    'Sube el .exe al release de la versión nueva y el runtime al release fijo tag "runtime".'
  ]);
}
async function exportMacApp(version) {
  if (process.platform !== 'darwin') fail('El DMG de macOS debe compilarse en macOS. Usa GitHub Actions para no tener que tocar otra carpeta.');
  runReleaseChecklist('prebuild', 'mac');
  log('[MODO] Compilando DMG macOS sin firma/notarización para pruebas.');
  run('npm', ['run', 'dist:mac'], { env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
  runReleaseChecklist('post-build-mac', 'mac');
  writeReleaseSummary(version, 'macos', [
    `DMG: ${releaseFiles(/^ClipDock_Mac_.*\.dmg$/i).map(item => item.name).join(', ') || 'no encontrado'}`,
    'Recuerda subir también los runtime macOS arm64/x64 al release fijo tag "runtime".'
  ]);
}
async function exportMacRuntime(version) {
  runReleaseChecklist('prebuild', 'mac-runtime');
  const arch = process.env.CLIPDOCK_MAC_RUNTIME_ARCH || (process.env.CI ? (process.arch === 'arm64' ? 'arm64' : 'x64') : 'current');
  const paths = await prepareMacRuntime(arch);
  writeReleaseSummary(version, `mac-runtime-${arch}`, [
    `Runtime macOS: ${paths.map(item => path.basename(item)).join(', ')}`,
    'Sube estos .zip al release fijo tag "runtime" de ClipDock-Runtime.'
  ]);
}
async function main() {
  const args = parseArgs();
  line(); log('   EXPORTAR CLIPDOCK - Windows + macOS desde una sola versión'); line();
  log('Una sola carpeta fuente. Cambias una vez y exportas Windows/Mac desde el mismo proyecto.');
  log('Windows se compila en Windows; macOS en Mac o GitHub Actions.'); log('');
  ensureSource();
  installNodeDeps();
  const version = await resolveVersion(args);
  const target = await chooseTarget(args.target);
  log(''); log(`Version de exportacion: ${version}`); log(`Target: ${target}`); log('');
  if (target === 'win') await exportWindows(version);
  else if (target === 'mac') await exportMacApp(version);
  else if (target === 'mac-runtime') await exportMacRuntime(version);
  else if (target === 'all') {
    if (process.platform === 'win32') await exportWindows(version);
    else if (process.platform === 'darwin') { await exportMacApp(version); await exportMacRuntime(version); }
    else fail('En Linux no puedo compilar Windows/macOS localmente. Usa GitHub Actions.');
  } else fail(`Target no reconocido: ${target}`);
  log(''); line(); log('LISTO. Revisa release-dist/'); line();
}
main().catch(error => { log(''); line(); log('HUBO UN ERROR.'); log(error && error.message ? error.message : String(error)); line(); process.exit(1); });
