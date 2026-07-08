#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const readline = require('readline');

const root = path.resolve(__dirname, '..');
process.chdir(root);

function log(msg = '') { console.log(msg); }
function fail(msg) { throw new Error(msg); }
function needsWindowsShell(file) {
  if (process.platform !== 'win32') return false;
  const base = path.basename(String(file)).toLowerCase();
  // npm/npx son .cmd en Windows; spawnSync sin shell suele tirar ENOENT.
  return base === 'npm' || base === 'npm.cmd' || base === 'npx' || base === 'npx.cmd';
}
function run(file, args = [], options = {}) {
  log(`> ${file} ${args.join(' ')}`);
  const res = cp.spawnSync(file, args, {
    cwd: options.cwd || root,
    stdio: 'inherit',
    encoding: 'utf8',
    shell: needsWindowsShell(file),
    windowsHide: false,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', ...(options.env || {}) }
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`Fallo: ${file} codigo ${res.status}`);
}
function tryRun(file, args = []) {
  const res = cp.spawnSync(file, args, { cwd: root, stdio: ['ignore','pipe','pipe'], encoding: 'utf8', shell: false, windowsHide: true });
  if (res.error || res.status !== 0) return null;
  return res;
}
function commandExists(file) {
  const check = cp.spawnSync(process.platform === 'win32' ? 'where' : 'which', [file], { stdio: ['ignore','pipe','ignore'], encoding: 'utf8', shell: false, windowsHide: true });
  return check.status === 0;
}
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(String(answer || '').trim()); }));
}
function ensureSource() {
  for (const item of ['package.json','main.js','backend/app.py','engine/media_core','renderer/index.html']) {
    if (!fs.existsSync(path.join(root, item))) fail(`Esta carpeta no parece ser el proyecto fuente completo de ClipDock. Falta: ${item}`);
  }
  ensureRequirements();
}
function ensureRequirements() {
  const reqPath = path.join(root, 'engine', 'requirements.txt');
  if (fs.existsSync(reqPath)) return;
  fs.mkdirSync(path.dirname(reqPath), { recursive: true });
  fs.writeFileSync(reqPath, [
    'yt-dlp[default]','requests','py7zr','Pillow','pillow-avif-plugin','numpy','rawpy','onnxruntime','rembg','CairoSVG','pdf2image','img2pdf','pikepdf','PyPDF2','Flask','Flask-SocketIO','gevent','gevent-websocket',''
  ].join('\n'), 'utf8');
}
function pythonInfo(file, prefixArgs) {
  const code = 'import sys; print(sys.executable); print(".".join(map(str, sys.version_info[:3])))';
  const res = tryRun(file, [...prefixArgs, '-c', code]);
  if (!res) return null;
  const out = String(res.stdout || '').trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (out.length < 2) return null;
  if (/WindowsApps/i.test(out[0])) return null;
  const [major, minor] = out[1].split('.').map(Number);
  if (major !== 3 || ![11,12].includes(minor)) return null;
  return { file, prefixArgs, exe: out[0], version: out[1] };
}
function directPythonCandidates() {
  if (process.platform !== 'win32') return [];
  const dirs = [];
  if (process.env.LOCALAPPDATA) {
    dirs.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Python', 'Python311', 'python.exe'));
    dirs.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Python', 'Python312', 'python.exe'));
  }
  if (process.env.ProgramFiles) {
    dirs.push(path.join(process.env.ProgramFiles, 'Python311', 'python.exe'));
    dirs.push(path.join(process.env.ProgramFiles, 'Python312', 'python.exe'));
  }
  return dirs.filter(p => fs.existsSync(p));
}
function detectPython() {
  const candidates = [];
  if (process.platform === 'win32') candidates.push(['py',['-3.11']], ['py',['-3.12']]);
  for (const exe of directPythonCandidates()) candidates.push([exe, []]);
  candidates.push(['python', []], ['python3', []]);
  for (const [file,args] of candidates) {
    const info = pythonInfo(file,args);
    if (info) return info;
  }
  return null;
}
async function ensurePython() {
  let info = detectPython();
  if (info) { log(`Python de desarrollo: ${info.version} (${info.exe})`); return info; }
  log('No encontre Python 3.11/3.12 real para modo desarrollo.');
  if (process.platform === 'win32' && commandExists('winget')) {
    const answer = await ask('Instalar Python 3.11 automaticamente con winget? [S/N]: ');
    if (/^s/i.test(answer)) {
      run('winget', ['install','-e','--id','Python.Python.3.11','--accept-source-agreements','--accept-package-agreements']);
      info = detectPython();
      if (info) return info;
      fail('Python se instalo, pero esta ventana aun no lo detecta. Cierra y vuelve a ejecutar ARRANCAR.bat.');
    }
  }
  fail('Instala Python 3.11 manualmente y marca Add python.exe to PATH.');
}
function venvPythonPath() { return path.join(root, 'engine', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'); }
function ensureCleanVenvIfBroken() {
  const venv = path.join(root, 'engine', '.venv');
  const py = venvPythonPath();
  if (!fs.existsSync(venv)) return;
  const ok = fs.existsSync(py) && tryRun(py, ['-c','import sys']);
  if (!ok) fs.rmSync(venv, { recursive: true, force: true });
}
async function main() {
  console.log('==================================================');
  console.log('   ARRANCAR CLIPDOCK - modo desarrollo');
  console.log('==================================================');
  console.log('');
  ensureSource();
  if (!commandExists('node')) fail('No encontre Node.js. Instala Node.js LTS.');
  if (!commandExists('npm')) fail('No encontre npm. Reinstala Node.js LTS marcando npm.');
  const pyInfo = await ensurePython();
  if (!fs.existsSync(path.join(root, 'node_modules', 'electron'))) run('npm', ['install','--no-audit','--no-fund']);
  ensureCleanVenvIfBroken();
  const venv = path.join(root, 'engine', '.venv');
  const py = venvPythonPath();
  if (!fs.existsSync(py)) run(pyInfo.file, [...pyInfo.prefixArgs, '-m', 'venv', venv]);
  run(py, ['-m','pip','install','--upgrade','pip','wheel','setuptools']);
  run(py, ['-m','pip','install','--upgrade','-r', path.join('engine','requirements.txt')]);
  console.log('');
  console.log('Abriendo ClipDock...');
  run('npm', ['start']);
}
main().catch(err => {
  console.log('');
  console.log('HUBO UN ERROR al preparar ClipDock.');
  console.log(err && err.message ? err.message : String(err));
  process.exit(1);
});
