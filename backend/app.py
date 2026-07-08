from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys

# Evita errores tipo "charmap codec can't encode character" en Windows/PyInstaller.
os.environ.setdefault("PYTHONUTF8", "1")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
for _stream_name in ("stdout", "stderr"):
    _stream = getattr(sys, _stream_name, None)
    try:
        if _stream and hasattr(_stream, "reconfigure"):
            _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import threading
import time
import uuid
import zipfile
from pathlib import Path
from typing import Any

import requests
from flask import Flask, jsonify, request

# En desarrollo se ejecuta como Python normal desde el repo.
# En producción se ejecuta como EXE de PyInstaller lanzado por Electron.
# CLIPDOCK_APP_ROOT apunta a resources/ cuando la app ya está empaquetada.
_DEFAULT_APP_ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = Path(os.getenv("CLIPDOCK_APP_ROOT") or _DEFAULT_APP_ROOT).resolve()
_BUNDLE_ROOT = Path(getattr(sys, "_MEIPASS", APP_ROOT)).resolve()
ENGINE_ROOT = Path(os.getenv("CLIPDOCK_ENGINE_ROOT") or (_BUNDLE_ROOT / "engine" if (_BUNDLE_ROOT / "engine").exists() else APP_ROOT / "engine")).resolve()
sys.path.insert(0, str(ENGINE_ROOT))

from bridge.server import CEPBridgeServer  # noqa: E402
from media_core import DownloadRequest, JobQueue, MediaEngine, ProgressEvent  # noqa: E402
from media_core.paths import (  # noqa: E402
    CACHE_DIR,
    COMPONENT_DOWNLOADS_DIR,
    COMPONENT_EXTRACT_DIR,
    COMPONENTS_DIR,
    MODEL_DOWNLOADS_DIR,
    MODEL_EXTRACT_DIR,
    MODELS_DIR,
    USER_STORAGE_ROOT,
    resolve_tool_executable,
    resolve_ffmpeg_executable,
)
from yt_dlp.utils import download_range_func  # noqa: E402

app = Flask(__name__)
engine = MediaEngine()
progress_state: dict[str, dict[str, Any]] = {}
job_context: dict[str, dict[str, Any]] = {}
received_from_adobe: list[str] = []
pending_adobe_downloads: list[dict[str, Any]] = []
remote_jobs_by_request_id: dict[str, str] = {}
remote_jobs_lock = threading.RLock()
APP_DATA = Path(os.getenv("APPDATA") or (APP_ROOT / "data")) / "ClipDock"
ADOBE_INBOX_PATH = APP_DATA / "adobe_inbox.jsonl"
adobe_inbox_lock = threading.RLock()
SETTINGS_PATH = APP_DATA / "settings.json"
STORAGE_ROOT = Path(USER_STORAGE_ROOT)
MODELS_ROOT = Path(MODELS_DIR)
MODEL_TEMP_ROOT = Path(MODEL_DOWNLOADS_DIR)
MODEL_EXTRACT_ROOT = Path(MODEL_EXTRACT_DIR)
COMPONENTS_ROOT = Path(COMPONENTS_DIR)
COMPONENT_TEMP_ROOT = Path(COMPONENT_DOWNLOADS_DIR)
COMPONENT_EXTRACT_ROOT = Path(COMPONENT_EXTRACT_DIR)
CACHE_ROOT = Path(CACHE_DIR)
LOG_ROOT = Path(os.getenv("CLIPDOCK_LOG_DIR") or (STORAGE_ROOT / "Logs"))
SETUP_LOG_ROOT = LOG_ROOT / "Setup"
COOKIES_ROOT = STORAGE_ROOT / "Cookies"
DEFAULT_COOKIE_FILE = COOKIES_ROOT / "youtube.cookies.txt"
ASSET_ROOT = STORAGE_ROOT / "Biblioteca"
ASSET_FOLDERS = {"sfx": ASSET_ROOT / "SFX", "vfx": ASSET_ROOT / "VFX"}
VERSIONS_ROOT = STORAGE_ROOT / "_versions"
SEVEN_ZIP_TOOL_ROOT = COMPONENTS_ROOT / "_tools" / "7zip"
SEVEN_ZIP_EXE = SEVEN_ZIP_TOOL_ROOT / "7zr.exe"
SEVEN_ZIP_URLS = [
    "https://www.7-zip.org/a/7zr.exe",
    "https://sourceforge.net/projects/sevenzip/files/7-Zip/25.01/7zr.exe/download",
    "https://sourceforge.net/projects/sevenzip/files/7-Zip/23.01/7zr.exe/download",
]
LEGACY_MODELS_ROOT = ENGINE_ROOT / "bin" / "models"
LEGACY_COMPONENTS_ROOT = ENGINE_ROOT / "bin"
LEGACY_COMPONENT_FOLDERS = ("ffmpeg", "deno", "poppler", "inkscape", "ghostscript")


class ComponentsRequiredError(RuntimeError):
    def __init__(self, components: list[str], message: str, action: str = ""):
        super().__init__(message)
        self.components = components
        self.action = action


@app.after_request
def allow_local_renderer(response):
    """Allow Electron and local preview servers to talk to the bundled engine."""
    origin = request.headers.get("Origin", "")
    if origin == "null" or re.fullmatch(r"https?://(?:127\.0\.0\.1|localhost)(?::\d+)?", origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

DEFAULT_SETTINGS = {
    "outputDir": str(Path.home() / "Downloads"),
    "autoPaste": True,
    "autoAnalyze": True,
    "smartRoute": True,
    "autoAdobe": False,
    "saveThumbnail": True,
    "playlistAnalysis": True,
    "cookieMode": "file",
    "cookieFile": "",
    "browser": "",
    "browserProfile": "",
    "interfaceScale": "1",
    "fontScale": "1",
    "titleScale": "1",
    "accentColor": "acid",
}


def prepare_storage_folders() -> None:
    """Crea la estructura externa y migra modelos/componentes viejos sin borrarlos."""
    for folder in [
        STORAGE_ROOT,
        MODELS_ROOT,
        MODELS_ROOT / "rembg",
        MODELS_ROOT / "upscaling",
        MODEL_TEMP_ROOT,
        MODEL_EXTRACT_ROOT,
        COMPONENTS_ROOT,
        COMPONENT_TEMP_ROOT,
        COMPONENT_EXTRACT_ROOT,
        SEVEN_ZIP_TOOL_ROOT,
        CACHE_ROOT,
        LOG_ROOT,
        SETUP_LOG_ROOT,
        ASSET_ROOT,
        VERSIONS_ROOT,
        VERSIONS_ROOT / "components",
        VERSIONS_ROOT / "models",
        *ASSET_FOLDERS.values(),
    ]:
        folder.mkdir(parents=True, exist_ok=True)

    # Versiones anteriores usaban engine/bin/models. Copiamos lo que exista para
    # que una actualización no obligue a bajar todo otra vez. No se borra el
    # origen automáticamente por seguridad.
    try:
        if LEGACY_MODELS_ROOT.exists() and LEGACY_MODELS_ROOT.resolve() != MODELS_ROOT.resolve():
            shutil.copytree(LEGACY_MODELS_ROOT, MODELS_ROOT, dirs_exist_ok=True)
    except OSError as exc:
        print(f"ADVERTENCIA: No se pudieron migrar modelos anteriores: {exc}")

    # También migramos componentes multimedia instalados antes en engine/bin.
    try:
        if LEGACY_COMPONENTS_ROOT.exists() and LEGACY_COMPONENTS_ROOT.resolve() != COMPONENTS_ROOT.resolve():
            for folder_name in LEGACY_COMPONENT_FOLDERS:
                source = LEGACY_COMPONENTS_ROOT / folder_name
                destination = COMPONENTS_ROOT / folder_name
                if source.exists():
                    shutil.copytree(source, destination, dirs_exist_ok=True)
    except OSError as exc:
        print(f"ADVERTENCIA: No se pudieron migrar componentes anteriores: {exc}")

    readme = MODELS_ROOT / "LEEME.txt"
    if not readme.exists():
        readme.write_text(
            "ClipDock guarda aquí los modelos de IA.\n\n"
            "Estructura:\n"
            "- rembg: modelos ONNX para quitar fondo.\n"
            "- upscaling: motores/modelos para escalar imagen o video.\n"
            "- _downloads y _extracting: temporales de instalación; se pueden borrar si la app está cerrada.\n\n"
            "Puedes borrar un modelo desde Ajustes > Modelos de IA o eliminar su carpeta/archivo con la app cerrada.\n",
            encoding="utf-8",
        )

    components_readme = COMPONENTS_ROOT / "LEEME.txt"
    if not components_readme.exists():
        components_readme.write_text(
            "ClipDock guarda aquí los componentes multimedia externos.\n\n"
            "Estructura:\n"
            "- ffmpeg: procesamiento de audio y video.\n"
            "- deno: descargas avanzadas.\n"
            "- poppler: lectura/conversión de PDF.\n"
            "- inkscape: compatibilidad SVG, AI y EPS.\n"
            "- _downloads y _extracting: temporales de instalación; se pueden borrar si la app está cerrada.\n"
            "- _tools/7zip: extractor interno para paquetes .7z como Inkscape. Se puede borrar con la app cerrada y se volverá a descargar si hace falta.\n\n"
            "Puedes eliminar un componente desde Ajustes > Componentes o borrar su carpeta con la app cerrada.\n",
            encoding="utf-8",
        )


prepare_storage_folders()

MODEL_CATALOG = {
    "u2netp": {"name": "U2-Net ligero", "description": "Rápido y ligero para recortes cotidianos.", "kind": "file", "group": "Fondo", "file": "u2netp.onnx", "url": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx"},
    "isnet": {"name": "IS-Net general", "description": "Equilibrio recomendado entre detalle y velocidad.", "kind": "file", "group": "Fondo", "file": "isnet-general-use.onnx", "url": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx"},
    "u2net": {"name": "U2-Net preciso", "description": "Modelo grande para bordes y sujetos complejos.", "kind": "file", "group": "Fondo", "file": "u2net.onnx", "url": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx"},
    "realesrgan": {"name": "Real-ESRGAN", "description": "Fotos, ilustraciones y video; opción recomendada.", "kind": "zip", "group": "Escalado", "folder": "realesrgan", "exe": "realesrgan-ncnn-vulkan.exe", "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip"},
    "waifu2x": {"name": "Waifu2x", "description": "Ilustración, anime y reducción de ruido.", "kind": "zip", "group": "Escalado", "folder": "waifu2x", "exe": "waifu2x-ncnn-vulkan.exe", "url": "https://github.com/nihui/waifu2x-ncnn-vulkan/releases/download/20250915/waifu2x-ncnn-vulkan-20250915-windows.zip"},
    "realsr": {"name": "RealSR", "description": "Escalado fotográfico natural a 4x.", "kind": "zip", "group": "Escalado", "folder": "realsr", "exe": "realsr-ncnn-vulkan.exe", "url": "https://github.com/nihui/realsr-ncnn-vulkan/releases/download/20220728/realsr-ncnn-vulkan-20220728-windows.zip"},
    "srmd": {"name": "SRMD", "description": "Escalado general con varias escalas.", "kind": "zip", "group": "Escalado", "folder": "srmd", "exe": "srmd-ncnn-vulkan.exe", "url": "https://github.com/nihui/srmd-ncnn-vulkan/releases/download/20220728/srmd-ncnn-vulkan-20220728-windows.zip"},
}

COMPONENT_CATALOG = {
    "ffmpeg": {
        "name": "FFmpeg", "description": "Procesamiento de audio y video", "folder": "ffmpeg", "exe": "ffmpeg.exe",
        "api": "https://api.github.com/repos/GyanD/codexffmpeg/releases/latest", "asset_contains": "full_build.zip", "asset_excludes": "shared", "archive": "zip",
    },
    "deno": {
        "name": "Deno", "description": "Compatibilidad avanzada de descargas", "folder": "deno", "exe": "deno.exe",
        "api": "https://api.github.com/repos/denoland/deno/releases/latest", "asset_equals": "deno-x86_64-pc-windows-msvc.zip", "archive": "zip",
    },
    "poppler": {
        "name": "Poppler", "description": "Lectura y conversión de PDF", "folder": "poppler", "exe": "pdfinfo.exe",
        "api": "https://api.github.com/repos/oschwartz10612/poppler-windows/releases/latest", "asset_contains": "Release", "asset_suffix": ".zip", "archive": "zip",
    },
    "inkscape": {
        "name": "Inkscape", "description": "Archivos SVG, AI y EPS", "folder": "inkscape", "exe": "inkscape.exe",
        "direct_urls": [
            # URL directa al archivo (las páginas /dl/ devuelven HTML, no el paquete).
            "https://media.inkscape.org/dl/resources/file/inkscape-1.4.2_2025-05-13_f4327f4-x64.7z",
            "https://inkscape.org/release/inkscape-1.4.2/windows/64-bit/compressed-7z/dl/",
            "https://sourceforge.net/projects/inkscape/files/inkscape-1.4.2_2025-05-13_f4327f4-x64.7z/download",
        ],
        "version": "1.4.2", "archive": "7z", "preserve_root": True,
    },
    "ghostscript": {
        "name": "Ghostscript", "description": "Soporte EPS/PS y respaldo PostScript", "folder": "ghostscript", "exe": "gswin64c.exe",
        "api": "https://api.github.com/repos/ArtifexSoftware/ghostpdl-downloads/releases/latest", "asset_contains": "w64.exe", "asset_suffix": ".exe", "archive": "exe",
        "extract_with_7zip": True,
    },
}

component_jobs: dict[str, str] = {}
model_jobs: dict[str, str] = {}

runtime_setup_jobs: dict[str, str] = {}

RUNTIME_PROFILE_MANIFEST = {
    "version": 1,
    "profiles": {
        "light": {
            "label": "Ligero",
            "description": "Prepara lo mínimo para descargas, recortes y conversiones básicas.",
            "components": ["ffmpeg"],
            "models": [],
        },
        "recommended": {
            "label": "Recomendado",
            "description": "Prepara los componentes comunes para video, audio, imágenes y documentos.",
            "components": ["ffmpeg", "deno", "poppler", "inkscape"],
            "models": [],
        },
        "full-ai": {
            "label": "Completo con IA",
            "description": "Prepara todo lo recomendado más modelos y motores de IA local.",
            "components": ["ffmpeg", "deno", "poppler", "inkscape", "ghostscript"],
            "models": ["u2netp", "isnet", "u2net", "realesrgan", "waifu2x", "realsr", "srmd"],
        },
    },
}

RECODE_PRESETS = {
    "h265_light": {"name": "H.265 Liviano", "group": "Archivo", "description": "Archivo pequeño con buena calidad visual.", "extension": ".mp4", "params": ["-c:v", "libx265", "-preset", "veryfast", "-crf", "29", "-tag:v", "hvc1", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"]},
    "h265_fast": {"name": "H.265 Rápido", "group": "Archivo", "description": "Conversión rápida y tamaño moderado.", "extension": ".mp4", "params": ["-c:v", "libx265", "-preset", "fast", "-crf", "26", "-tag:v", "hvc1", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"]},
    "h265_standard": {"name": "H.265 Normal", "group": "Archivo", "description": "Buen equilibrio entre tamaño y calidad.", "extension": ".mp4", "params": ["-c:v", "libx265", "-preset", "medium", "-crf", "24", "-tag:v", "hvc1", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]},
    "h265_max": {"name": "H.265 Máxima", "group": "Archivo", "description": "Más detalle, archivo más grande y proceso lento.", "extension": ".mp4", "params": ["-c:v", "libx265", "-preset", "slow", "-crf", "20", "-tag:v", "hvc1", "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart"]},
    "h264_light": {"name": "H.264 Liviano", "group": "Web y móvil", "description": "Carga rápida y máxima compatibilidad.", "extension": ".mp4", "params": ["-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"]},
    "h264_fast": {"name": "H.264 Rápido", "group": "Web y móvil", "description": "Conversión ágil con buena compatibilidad.", "extension": ".mp4", "params": ["-c:v", "libx264", "-preset", "fast", "-crf", "25", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]},
    "h264_standard": {"name": "H.264 Normal", "group": "Web y móvil", "description": "Preset recomendado para publicar y compartir.", "extension": ".mp4", "params": ["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart"]},
    "h264_max": {"name": "H.264 Máxima", "group": "Web y móvil", "description": "Alta calidad con compatibilidad universal.", "extension": ".mp4", "params": ["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart"]},
    "prores_proxy": {"name": "ProRes 422 Proxy", "group": "Edición", "description": "Archivo ligero para edición fluida.", "extension": ".mov", "params": ["-c:v", "prores_ks", "-profile:v", "0", "-vendor", "apl0", "-c:a", "pcm_s16le"]},
    "prores_lt": {"name": "ProRes 422 LT", "group": "Edición", "description": "Calidad intermedia para montaje.", "extension": ".mov", "params": ["-c:v", "prores_ks", "-profile:v", "1", "-vendor", "apl0", "-c:a", "pcm_s16le"]},
    "prores_422": {"name": "ProRes 422", "group": "Edición", "description": "Máster de edición de alta calidad.", "extension": ".mov", "params": ["-c:v", "prores_ks", "-profile:v", "2", "-vendor", "apl0", "-c:a", "pcm_s16le"]},
    "gif_low": {"name": "GIF rápido", "group": "GIF", "description": "480 px y 12 fps para compartir.", "extension": ".gif", "params": ["-vf", "fps=12,scale=-2:480:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer", "-loop", "0", "-an"]},
    "gif_medium": {"name": "GIF medio", "group": "GIF", "description": "540 px y 18 fps.", "extension": ".gif", "params": ["-vf", "fps=18,scale=-2:540:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse", "-loop", "0", "-an"]},
    "gif_high": {"name": "GIF alta calidad", "group": "GIF", "description": "720 px y 24 fps.", "extension": ".gif", "params": ["-vf", "fps=24,scale=-2:720:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse", "-loop", "0", "-an"]},
    "gif_1080": {"name": "GIF 1080p", "group": "GIF", "description": "1080 px y 24 fps.", "extension": ".gif", "params": ["-vf", "fps=24,scale=-2:1080:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse", "-loop", "0", "-an"]},
    "mp3_192": {"name": "MP3 192 kbps", "group": "Audio", "description": "Audio ligero y compatible.", "extension": ".mp3", "params": ["-vn", "-c:a", "libmp3lame", "-b:a", "192k"]},
    "mp3_320": {"name": "MP3 320 kbps", "group": "Audio", "description": "MP3 a máxima calidad.", "extension": ".mp3", "params": ["-vn", "-c:a", "libmp3lame", "-b:a", "320k"]},
    "wav": {"name": "WAV 16-bit", "group": "Audio", "description": "Audio sin compresión para edición.", "extension": ".wav", "params": ["-vn", "-c:a", "pcm_s16le"]},
}


def load_settings() -> dict[str, Any]:
    try:
        saved = json.loads(SETTINGS_PATH.read_text(encoding="utf-8")) if SETTINGS_PATH.exists() else {}
    except (OSError, json.JSONDecodeError):
        saved = {}
    return {**DEFAULT_SETTINGS, **saved}


def save_settings(values: dict[str, Any]) -> dict[str, Any]:
    allowed = set(DEFAULT_SETTINGS)
    merged = load_settings()
    merged.update({key: value for key, value in values.items() if key in allowed})
    APP_DATA.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    return merged


def _cookie_file_sample(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8-sig", errors="ignore")[:262144]
    except Exception:
        return ""


def _looks_like_cookie_file(path: Path) -> bool:
    if not path.exists() or path.suffix.lower() != ".txt":
        return False
    sample = _cookie_file_sample(path)
    if not sample or sample.lstrip().startswith(("{", "[")):
        return False
    for raw_line in sample.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("# Netscape"):
            continue
        # yt-dlp acepta #HttpOnly_.youtube.com como línea válida; no la descartamos.
        if "	" in line and len(line.split("	")) >= 7:
            return True
        # Algunas extensiones exportan columnas separadas por espacios; las aceptamos
        # como válidas para no rechazar archivos que yt-dlp sí puede normalizar/leer.
        if len(line.split()) >= 7 and not line.startswith("#"):
            return True
    return False



def cookie_file_summary(path: Path) -> dict[str, Any]:
    """Cuenta cookies Netscape sin depender del renderer.

    Acepta líneas #HttpOnly_.youtube.com como cookies reales, igual que yt-dlp.
    """
    sample = _cookie_file_sample(path)
    cookies: list[dict[str, str]] = []
    domains: set[str] = set()
    important = {"SAPISID", "APISID", "SSID", "SID", "HSID", "LOGIN_INFO", "VISITOR_INFO1_LIVE", "__Secure-1PSID", "__Secure-3PSID"}
    present: set[str] = set()
    for raw_line in sample.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("# Netscape"):
            continue
        if line.startswith("#") and not line.startswith("#HttpOnly_"):
            continue
        columns = line.split("\t") if "\t" in line else line.split()
        if len(columns) < 7:
            continue
        domain = columns[0].replace("#HttpOnly_", "", 1)
        name = columns[5]
        domains.add(domain)
        present.add(name)
        cookies.append({"domain": domain, "name": name})
    youtube_domains = sorted([d for d in domains if re.search(r"youtube|google", d, re.I)])
    return {
        "count": len(cookies),
        "domains": sorted(domains)[:20],
        "youtubeDomains": youtube_domains[:20],
        "importantPresent": sorted(present.intersection(important)),
        "hasYoutubeDomain": bool(youtube_domains),
    }


def cookie_status(settings: dict[str, Any] | None = None) -> dict[str, Any]:
    settings = settings or load_settings()
    saved = str(settings.get("cookieFile") or "").strip().strip('"')
    candidates: list[tuple[str, Path]] = []
    if saved:
        candidates.append(("Ajustes", Path(saved).expanduser()))
    candidates.append(("Ruta estándar", DEFAULT_COOKIE_FILE))

    seen: set[str] = set()
    checked: list[dict[str, Any]] = []
    for source, path in candidates:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        exists = path.exists()
        sample = _cookie_file_sample(path) if exists else ""
        is_json = sample.lstrip().startswith(("{", "[")) if sample else False
        looks_valid = exists and path.suffix.lower() == ".txt" and _looks_like_cookie_file(path)
        has_youtube = bool(re.search(r"(^|[\t\s.])(youtube\.com|google\.com|googlevideo\.com|youtube-nocookie\.com)", sample, re.I))
        checked.append({
            "source": source,
            "path": str(path),
            "exists": exists,
            "looksValid": bool(looks_valid),
            "hasYouTube": bool(has_youtube),
            "isJson": bool(is_json),
        })
        if looks_valid:
            summary = cookie_file_summary(path)
            message = f"cookies.txt válido para el motor de descarga. Cookies leídas: {summary.get('count', 0)}."
            if not has_youtube:
                message = "El archivo tiene formato válido, pero no detecté cookies de YouTube/Google en la muestra."
            return {
                "exists": True,
                "looksValid": True,
                "hasYouTube": has_youtube,
                "path": str(path),
                "source": source,
                "checked": checked,
                "summary": summary,
                "message": message,
            }

    return {
        "exists": False,
        "looksValid": False,
        "hasYouTube": False,
        "path": str(DEFAULT_COOKIE_FILE),
        "source": "Sin archivo usable",
        "checked": checked,
        "message": "El motor de descarga no encontró un cookies.txt usable. Impórtalo de nuevo desde Ajustes > Cookies.",
    }


def cookie_options(settings: dict[str, Any]) -> dict[str, Any]:
    """Devuelve las cookies que usará yt-dlp. La validación sale del backend,
    no del renderer, para que Ajustes y Descargas hablen el mismo idioma."""
    status = cookie_status(settings)
    if status.get("exists") and status.get("looksValid") and status.get("path"):
        return {"cookiefile": str(status["path"])}
    return {}


def youtube_runtime_hint() -> str:
    try:
        import yt_dlp
        version = getattr(yt_dlp.version, "__version__", "desconocida")
    except Exception:
        version = "desconocida"
    deno_exe = "deno.exe" if os.name == "nt" else "deno"
    deno_path = resolve_tool_executable("deno", deno_exe)
    deno_ready = Path(deno_path).exists()
    parts = [f"yt-dlp: {version}"]
    parts.append(f"Deno: {'instalado' if deno_ready else 'no instalado'}")
    if not deno_ready:
        parts.append("Deno es opcional; ClipDock primero intentará el método directo tipo DowP.")
    return " · ".join(parts)


def model_path(info: dict[str, Any]) -> Path:
    if info["kind"] == "file":
        return MODELS_ROOT / "rembg" / info["file"]
    return MODELS_ROOT / "upscaling" / info["folder"] / info["exe"]


def file_size(path: Path) -> int:
    if path.is_file():
        return path.stat().st_size
    if path.is_dir():
        return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())
    return 0


def install_meta_path(kind: str, item_id: str) -> Path:
    safe_kind = re.sub(r"[^a-z0-9_-]+", "_", kind.lower())
    safe_id = re.sub(r"[^a-z0-9_-]+", "_", item_id.lower())
    return VERSIONS_ROOT / safe_kind / f"{safe_id}.json"


def read_install_meta(kind: str, item_id: str) -> dict[str, Any]:
    path = install_meta_path(kind, item_id)
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def write_install_meta(kind: str, item_id: str, version: str, source: str = "") -> None:
    path = install_meta_path(kind, item_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "kind": kind,
        "id": item_id,
        "version": str(version or "latest"),
        "source": str(source or ""),
        "installedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def remove_install_meta(kind: str, item_id: str) -> None:
    install_meta_path(kind, item_id).unlink(missing_ok=True)


def model_catalog_version(info: dict[str, Any]) -> str:
    if info.get("version"):
        return str(info["version"])
    url = str(info.get("url") or "")
    match = re.search(r"/download/([^/]+)/", url)
    if match:
        return match.group(1)
    return Path(url.split("?", 1)[0]).name or "latest"


def component_root(info: dict[str, Any]) -> Path:
    return COMPONENTS_ROOT / info["folder"]


def component_path(info: dict[str, Any]) -> Path:
    root = component_root(info)
    if info.get("folder") == "ffmpeg":
        return Path(resolve_ffmpeg_executable("ffmpeg"))
    if info.get("folder") == "ghostscript":
        if root.exists():
            for exe_name in (info.get("exe") or "gswin64c.exe", "gswin32c.exe", "gs.exe", "gs"):
                for candidate in (root / exe_name, root / "bin" / exe_name):
                    if candidate.exists():
                        return candidate
                found = next(root.rglob(exe_name), None)
                if found:
                    return found
        return root / "bin" / str(info.get("exe") or "gswin64c.exe")
    if info.get("preserve_root"):
        exact = root / "bin" / info["exe"]
    else:
        exact = root / info["exe"]
    if exact.exists():
        return exact
    resolved = Path(resolve_tool_executable(info["folder"], info["exe"]))
    return resolved


def component_ready(component_id: str) -> bool:
    info = COMPONENT_CATALOG.get(component_id)
    return bool(info and component_path(info).exists())


def model_ready(model_id: str) -> bool:
    info = MODEL_CATALOG.get(model_id)
    return bool(info and model_path(info).exists())


def runtime_setup_log_path(profile_id: str) -> Path:
    safe_profile = re.sub(r"[^a-z0-9_-]+", "_", str(profile_id or "profile").lower())
    SETUP_LOG_ROOT.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y-%m-%dT%H-%M-%S")
    return SETUP_LOG_ROOT / f"setup-{safe_profile}-{stamp}.log"


def append_runtime_setup_log(path: Path, message: str) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("", encoding="utf-8") if not path.exists() else None
        with path.open("a", encoding="utf-8") as handle:
            handle.write(f"[{time.strftime('%Y-%m-%dT%H:%M:%S')}] {message}\n")
    except Exception as exc:
        print(f"ADVERTENCIA: No se pudo escribir log de preparación: {exc}")


def runtime_setup_state(profile: dict[str, Any]) -> dict[str, Any]:
    tasks = [("component", item) for item in profile.get("components", [])] + [("model", item) for item in profile.get("models", [])]
    ready: list[dict[str, str]] = []
    missing: list[dict[str, str]] = []
    for kind, item_id in tasks:
        catalog = COMPONENT_CATALOG if kind == "component" else MODEL_CATALOG
        name = catalog[item_id]["name"]
        is_ready = component_ready(item_id) if kind == "component" else model_ready(item_id)
        entry = {"kind": kind, "id": item_id, "name": name}
        (ready if is_ready else missing).append(entry)
    return {"total": len(tasks), "ready": ready, "missing": missing}


def write_runtime_setup_summary(log_path: Path, *, profile: dict[str, Any], state: dict[str, Any], installed_count: int = 0, skipped_count: int | None = None, status: str = "completado") -> None:
    skipped = len(state.get("ready", [])) if skipped_count is None else skipped_count
    append_runtime_setup_log(log_path, "--- Resumen ---")
    append_runtime_setup_log(log_path, f"Perfil elegido: {profile.get('label')} ({profile.get('id')})")
    append_runtime_setup_log(log_path, f"Componentes/modelos requeridos: {state.get('total', 0)}")
    append_runtime_setup_log(log_path, f"Ya instalados: {skipped}")
    append_runtime_setup_log(log_path, f"Instalados ahora: {installed_count}")
    append_runtime_setup_log(log_path, f"Pendientes/fallidos: {len(state.get('missing', [])) if status != 'completado' else 0}")
    append_runtime_setup_log(log_path, f"Estado final: {status}")


def latest_runtime_setup_log() -> Path | None:
    try:
        if not SETUP_LOG_ROOT.exists():
            return None
        logs = [item for item in SETUP_LOG_ROOT.glob("setup-*.log") if item.is_file()]
        if not logs:
            return None
        return max(logs, key=lambda item: item.stat().st_mtime)
    except Exception:
        return None


def read_runtime_setup_log_preview(path: Path | None, limit: int = 5000) -> str:
    if not path or not path.exists():
        return ""
    try:
        content = path.read_text(encoding="utf-8", errors="replace")
        return content[-limit:]
    except Exception:
        return ""


def ffmpeg_ready() -> bool:
    return Path(resolve_ffmpeg_executable("ffmpeg")).exists()


def deno_ready() -> bool:
    executable = "deno.exe" if os.name == "nt" else "deno"
    return Path(resolve_tool_executable("deno", executable)).exists()


def is_youtube_auth_error(error: Any) -> bool:
    return bool(re.search(r"not a bot|sign in to confirm|authentication|login required|cookies|confirmar", str(error), re.I))


def is_javascript_runtime_error(error: Any) -> bool:
    return bool(re.search(r"javascript runtime|deno|ejs|nsig|n challenge|player challenge|signature solving|requested format is not available", str(error), re.I))


def resolve_release_asset(info: dict[str, Any]) -> tuple[str, list[str]]:
    urls = info.get("direct_urls")
    if urls:
        return str(info.get("version") or "stable"), [str(url) for url in urls]
    if info.get("direct_url"):
        return str(info.get("version") or "stable"), [str(info["direct_url"])]
    response = requests.get(info["api"], timeout=30, headers={"Accept": "application/vnd.github+json"})
    response.raise_for_status()
    release = response.json()
    for asset in release.get("assets", []):
        name = str(asset.get("name") or "")
        lower = name.lower()
        if info.get("asset_equals") and lower != str(info["asset_equals"]).lower():
            continue
        if info.get("asset_contains") and str(info["asset_contains"]).lower() not in lower:
            continue
        if info.get("asset_excludes") and str(info["asset_excludes"]).lower() in lower:
            continue
        if info.get("asset_suffix") and not lower.endswith(str(info["asset_suffix"]).lower()):
            continue
        return str(release.get("tag_name") or "latest"), [str(asset["browser_download_url"])]
    raise RuntimeError(f"No se encontró un paquete compatible de {info['name']}")


ARCHIVE_SIGNATURES = {
    "zip": (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"),
    "7z": (b"7z\xbc\xaf\x27\x1c",),
    "exe": (b"MZ",),
}


def archive_signature_ok(archive_path: Path, archive_kind: str) -> bool:
    """Verifica los bytes mágicos: si una fuente devuelve una página HTML en lugar
    del paquete (típico en mirrors con redirección), aquí se detecta y se pasa a
    la siguiente fuente en vez de fallar al extraer."""
    signatures = ARCHIVE_SIGNATURES.get(str(archive_kind or "").lower())
    if not signatures:
        return True
    try:
        with archive_path.open("rb") as handle:
            head = handle.read(8)
        return any(head.startswith(sig) for sig in signatures)
    except OSError:
        return False


def download_archive_with_fallback(urls: list[str], archive_path: Path, timeout: int, cancel_event: threading.Event, report, info: dict[str, Any], component_id: str) -> None:
    errors: list[str] = []
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ClipDock/1.0"}
    for index, url in enumerate(urls, start=1):
        archive_path.unlink(missing_ok=True)
        source_label = f"fuente {index}/{len(urls)}" if len(urls) > 1 else "fuente principal"
        try:
            report(ProgressEvent(4, f"Conectando {info['name']} · {source_label}", "component", {"componentId": component_id}))
            response = requests.get(url, stream=True, timeout=timeout, headers=headers, allow_redirects=True)
            response.raise_for_status()
            total = int(response.headers.get("content-length") or 0)
            downloaded = 0
            with archive_path.open("wb") as handle:
                for chunk in response.iter_content(1024 * 512):
                    if cancel_event.is_set():
                        archive_path.unlink(missing_ok=True)
                        return
                    if chunk:
                        handle.write(chunk)
                        downloaded += len(chunk)
                        percent = 5 + ((downloaded / total) * 75 if total else min(75, downloaded / (1024 * 1024)))
                        report(ProgressEvent(percent, f"Descargando {info['name']} · {downloaded / 1048576:.1f} MB", "component", {"componentId": component_id}))
            if not archive_path.exists() or archive_path.stat().st_size == 0:
                errors.append(f"{source_label}: descarga vacía")
                continue
            if not archive_signature_ok(archive_path, info.get("archive", "")):
                errors.append(f"{source_label}: devolvió una página web, no el paquete")
                continue
            return
        except requests.RequestException as exc:
            errors.append(f"{source_label}: {exc}")
            continue
    raise RuntimeError(f"No se pudo descargar {info['name']}. " + " | ".join(errors))


def safe_extract_zip(archive_path: Path, destination: Path) -> None:
    with zipfile.ZipFile(archive_path) as archive:
        root = destination.resolve()
        for member in archive.infolist():
            resolved = (destination / member.filename).resolve()
            if root not in resolved.parents and resolved != root:
                raise ValueError("El paquete contiene una ruta no segura")
        archive.extractall(destination)


def _windows_no_window_flag() -> int:
    if os.name == "nt" and hasattr(subprocess, "CREATE_NO_WINDOW"):
        return int(subprocess.CREATE_NO_WINDOW)
    return 0


def _find_7zip_cli() -> Path | None:
    """Busca un extractor 7-Zip instalado o el interno de ClipDock."""
    candidates: list[str | Path] = []
    for name in ("7z.exe", "7za.exe", "7zr.exe", "7z", "7za", "7zr"):
        found = shutil.which(name)
        if found:
            candidates.append(found)
    if SEVEN_ZIP_EXE.exists():
        candidates.append(SEVEN_ZIP_EXE)
    if os.name == "nt":
        for base in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)")):
            if base:
                candidates.append(Path(base) / "7-Zip" / "7z.exe")
    for candidate in candidates:
        path = Path(candidate)
        if path.exists() and path.is_file():
            return path
    return None


def ensure_7zip_cli(cancel_event: threading.Event, report, component_id: str) -> Path:
    """Garantiza un extractor para .7z. py7zr no soporta BCJ2, por eso Inkscape necesita 7-Zip real."""
    existing = _find_7zip_cli()
    if existing:
        return existing

    SEVEN_ZIP_TOOL_ROOT.mkdir(parents=True, exist_ok=True)
    COMPONENT_TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    tmp_path = COMPONENT_TEMP_ROOT / f"7zr_{uuid.uuid4().hex}.exe"
    errors: list[str] = []
    headers = {"User-Agent": "ClipDock/1.0 (+https://local.app)"}

    for index, url in enumerate(SEVEN_ZIP_URLS, start=1):
        source_label = f"fuente {index}/{len(SEVEN_ZIP_URLS)}"
        tmp_path.unlink(missing_ok=True)
        try:
            report(ProgressEvent(84, f"Preparando extractor 7-Zip · {source_label}", "component", {"componentId": component_id}))
            response = requests.get(url, stream=True, timeout=60, headers=headers, allow_redirects=True)
            response.raise_for_status()
            with tmp_path.open("wb") as handle:
                for chunk in response.iter_content(1024 * 256):
                    if cancel_event.is_set():
                        tmp_path.unlink(missing_ok=True)
                        raise RuntimeError("Instalación cancelada")
                    if chunk:
                        handle.write(chunk)
            if not tmp_path.exists() or tmp_path.stat().st_size < 100_000:
                errors.append(f"{source_label}: descarga incompleta")
                continue
            with tmp_path.open("rb") as handle:
                if handle.read(2) != b"MZ":
                    errors.append(f"{source_label}: el extractor no parece un .exe válido")
                    continue
            tmp_path.replace(SEVEN_ZIP_EXE)
            return SEVEN_ZIP_EXE
        except requests.RequestException as exc:
            errors.append(f"{source_label}: {exc}")
        finally:
            tmp_path.unlink(missing_ok=True)

    raise RuntimeError("No se pudo preparar el extractor 7-Zip para paquetes .7z. " + " | ".join(errors))


def extract_7z_with_7zip(archive_path: Path, destination: Path, cancel_event: threading.Event, report, info: dict[str, Any], component_id: str) -> None:
    """Extrae .7z usando 7-Zip real para soportar filtros como BCJ2."""
    seven_zip = ensure_7zip_cli(cancel_event, report, component_id)
    report(ProgressEvent(88, f"Extrayendo {info['name']} con 7-Zip", "component", {"componentId": component_id}))
    command = [str(seven_zip), "x", str(archive_path), f"-o{destination}", "-y", "-bd"]
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=_windows_no_window_flag(),
    )
    output_lines: list[str] = []
    try:
        assert process.stdout is not None
        while True:
            line = process.stdout.readline()
            if line:
                output_lines.append(line.strip())
                if len(output_lines) > 20:
                    output_lines = output_lines[-20:]
            if process.poll() is not None:
                remaining = process.stdout.read()
                if remaining:
                    output_lines.extend(part.strip() for part in remaining.splitlines() if part.strip())
                    output_lines = output_lines[-20:]
                break
            if cancel_event.is_set():
                process.kill()
                raise RuntimeError("Instalación cancelada")
        if process.returncode != 0:
            detail = " | ".join(line for line in output_lines if line)[-500:]
            raise RuntimeError(f"No se pudo extraer {info['name']} con 7-Zip. {detail}".strip())
        report(ProgressEvent(94, f"Organizando {info['name']}", "component", {"componentId": component_id}))
    finally:
        if process.poll() is None:
            process.kill()

def install_nsis_component(component_id: str, installer_path: Path, version: str, source: str, cancel_event: threading.Event, report, info: dict[str, Any]) -> Path:
    if os.name != "nt":
        raise RuntimeError(f"{info['name']} usa instalador Windows y solo puede instalarse en Windows")
    destination = component_root(info)
    destination.mkdir(parents=True, exist_ok=True)
    report(ProgressEvent(86, f"Instalando {info['name']} en Componentes", "component", {"componentId": component_id}))
    command = [str(installer_path), "/S", "/NCRC", f"/D={destination}"]
    process = subprocess.Popen(
        command,
        cwd=str(COMPONENTS_ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=_windows_no_window_flag(),
    )
    output_lines: list[str] = []
    try:
        assert process.stdout is not None
        while True:
            line = process.stdout.readline()
            if line:
                output_lines.append(line.strip())
                output_lines = output_lines[-20:]
            if process.poll() is not None:
                remaining = process.stdout.read()
                if remaining:
                    output_lines.extend(part.strip() for part in remaining.splitlines() if part.strip())
                    output_lines = output_lines[-20:]
                break
            if cancel_event.is_set():
                process.kill()
                raise RuntimeError("Instalación cancelada")
        if process.returncode != 0:
            detail = " | ".join(line for line in output_lines if line)[-500:]
            raise RuntimeError(f"El instalador de {info['name']} falló (código {process.returncode}). {detail}".strip())
    finally:
        if process.poll() is None:
            process.kill()
    installed = component_path(info)
    if not installed.exists():
        found = next(destination.rglob(str(info.get("exe") or "gswin64c.exe")), None) if destination.exists() else None
        if found:
            installed = found
    if not installed.exists():
        raise RuntimeError(f"{info['name']} terminó, pero no encontré {info.get('exe')} en {destination}")
    write_install_meta("components", component_id, version, source)
    report(ProgressEvent(100, f"{info['name']} {version} instalado", "complete", {"componentId": component_id}))
    return installed


def install_component_inline(component_id: str, cancel_event: threading.Event, report) -> Path:
    """Instala un componente dentro del mismo trabajo que lo necesita.

    Esto permite que la extensión CEP use ClipDock como control remoto real:
    si falta FFmpeg/Deno, la app instala el componente en Documentos\\ClipDock
    y luego continúa la descarga sin pedirle al usuario abrir otro panel.
    """
    if component_id not in COMPONENT_CATALOG:
        raise ValueError(f"Componente desconocido: {component_id}")
    info = COMPONENT_CATALOG[component_id]
    existing = component_path(info)
    if existing.exists():
        report(ProgressEvent(100, f"{info['name']} listo", "component", {"componentId": component_id}))
        return existing

    report(ProgressEvent(1, f"Instalando componente requerido: {info['name']}", "component", {"componentId": component_id}))
    version, urls = resolve_release_asset(info)
    archive_type = str(info.get("archive") or "zip")
    suffix = {"7z": ".7z", "zip": ".zip", "nsis": ".exe", "exe": ".exe"}.get(archive_type, ".zip")
    COMPONENT_TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    archive_path = COMPONENT_TEMP_ROOT / f"{component_id}_{uuid.uuid4().hex}{suffix}"
    download_archive_with_fallback(urls, archive_path, 120, cancel_event, report, info, component_id)
    if archive_type == "nsis":
        try:
            return install_nsis_component(component_id, archive_path, version, urls[0] if urls else "", cancel_event, report, info)
        finally:
            archive_path.unlink(missing_ok=True)
    report(ProgressEvent(84, f"Extrayendo {info['name']}", "component", {"componentId": component_id}))
    COMPONENT_EXTRACT_ROOT.mkdir(parents=True, exist_ok=True)
    extract_root = COMPONENT_EXTRACT_ROOT / f"extract_{component_id}_{uuid.uuid4().hex}"
    extract_root.mkdir(parents=True, exist_ok=True)
    try:
        if archive_type == "zip":
            safe_extract_zip(archive_path, extract_root)
        else:
            extract_7z_with_7zip(archive_path, extract_root, cancel_event, report, info, component_id)
        found = next(extract_root.rglob(info["exe"]), None)
        if not found:
            raise RuntimeError(f"No se encontró {info['exe']} dentro del paquete")
        destination = component_root(info)
        destination.mkdir(parents=True, exist_ok=True)
        if component_id == "ghostscript":
            # Los instaladores oficiales de Ghostscript piden elevación si se ejecutan.
            # Para mantener ClipDock portable en Documentos/ClipDock, los extraemos con 7-Zip
            # y copiamos la raíz que contiene bin/ + lib/ en vez de lanzar el instalador.
            source = found.parent.parent if found.parent.name.lower() == "bin" else found.parent
        elif info.get("preserve_root"):
            entries = list(extract_root.iterdir())
            source = entries[0] if len(entries) == 1 and entries[0].is_dir() else extract_root
        else:
            source = found.parent
        shutil.copytree(source, destination, dirs_exist_ok=True)
        write_install_meta("components", component_id, version, urls[0] if urls else "")
        installed = component_path(info)
        report(ProgressEvent(100, f"{info['name']} {version} instalado", "complete", {"componentId": component_id}))
        return installed
    finally:
        shutil.rmtree(extract_root, ignore_errors=True)
        archive_path.unlink(missing_ok=True)


def ensure_components_inline(component_ids: list[str], cancel_event: threading.Event, report) -> None:
    ids = [component_id for component_id in dict.fromkeys(component_ids) if component_id in COMPONENT_CATALOG]
    if not ids:
        return
    names = ", ".join(COMPONENT_CATALOG[component_id]["name"] for component_id in ids)
    report(ProgressEvent(0, f"Preparando dependencias: {names}", "component", {"components": ids}))
    for component_id in ids:
        if cancel_event.is_set():
            raise RuntimeError("Instalación cancelada")
        install_component_inline(component_id, cancel_event, report)


def install_model_inline(model_id: str, cancel_event: threading.Event, report) -> Path:
    if model_id not in MODEL_CATALOG:
        raise ValueError(f"Modelo desconocido: {model_id}")
    info = MODEL_CATALOG[model_id]
    target = model_path(info)
    if target.exists():
        report(ProgressEvent(100, f"{info['name']} listo", "model", {"modelId": model_id}))
        return target

    APP_DATA.mkdir(parents=True, exist_ok=True)
    MODEL_TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    temp_file = MODEL_TEMP_ROOT / f"{model_id}_{uuid.uuid4().hex}.part"
    report(ProgressEvent(1, f"Descargando {info['name']}", "model", {"modelId": model_id}))
    response = requests.get(info["url"], stream=True, timeout=60)
    response.raise_for_status()
    total = int(response.headers.get("content-length") or 0)
    downloaded = 0
    try:
        with temp_file.open("wb") as handle:
            for chunk in response.iter_content(1024 * 512):
                if cancel_event.is_set():
                    temp_file.unlink(missing_ok=True)
                    raise RuntimeError("Instalación cancelada")
                if chunk:
                    handle.write(chunk)
                    downloaded += len(chunk)
                    percent = 1 + ((downloaded / total) * 84 if total else 24)
                    report(ProgressEvent(percent, f"Descargando {info['name']}", "model", {"modelId": model_id}))
        if info["kind"] == "file":
            target.parent.mkdir(parents=True, exist_ok=True)
            temp_file.replace(target)
        else:
            MODEL_EXTRACT_ROOT.mkdir(parents=True, exist_ok=True)
            extract_root = MODEL_EXTRACT_ROOT / f"{model_id}_{uuid.uuid4().hex}"
            extract_root.mkdir(parents=True, exist_ok=True)
            try:
                report(ProgressEvent(88, f"Extrayendo {info['name']}", "model", {"modelId": model_id}))
                with zipfile.ZipFile(temp_file) as archive:
                    for member in archive.infolist():
                        resolved = (extract_root / member.filename).resolve()
                        if extract_root.resolve() not in resolved.parents and resolved != extract_root.resolve():
                            raise ValueError("El paquete del modelo contiene una ruta no segura")
                    archive.extractall(extract_root)
                found = next(extract_root.rglob(info["exe"]), None)
                if not found:
                    raise RuntimeError("El ejecutable esperado no está dentro del paquete")
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(found.parent, target.parent, dirs_exist_ok=True)
            finally:
                shutil.rmtree(extract_root, ignore_errors=True)
                temp_file.unlink(missing_ok=True)
        write_install_meta("models", model_id, model_catalog_version(info), info.get("url") or "")
        report(ProgressEvent(100, f"{info['name']} instalado", "complete", {"modelId": model_id}))
        return target
    except Exception:
        temp_file.unlink(missing_ok=True)
        raise


def runtime_profile_payload(profile_id: str) -> dict[str, Any]:
    profiles = RUNTIME_PROFILE_MANIFEST["profiles"]
    if profile_id not in profiles:
        raise ValueError("Perfil de instalación desconocido")
    profile = profiles[profile_id]
    components = [item for item in profile.get("components", []) if item in COMPONENT_CATALOG]
    models = [item for item in profile.get("models", []) if item in MODEL_CATALOG]
    return {
        "id": profile_id,
        "label": profile.get("label") or profile_id,
        "description": profile.get("description") or "",
        "components": components,
        "models": models,
        "componentNames": [COMPONENT_CATALOG[item]["name"] for item in components],
        "modelNames": [MODEL_CATALOG[item]["name"] for item in models],
    }


def runtime_setup_operation(profile_id: str, cancel_event: threading.Event, report) -> dict[str, Any]:
    profile = runtime_profile_payload(profile_id)
    requested_tasks = [("component", item) for item in profile["components"]] + [("model", item) for item in profile["models"]]
    log_path = runtime_setup_log_path(profile_id)
    append_runtime_setup_log(log_path, f"=== Preparación inicial ClipDock · {profile['label']} ===")
    append_runtime_setup_log(log_path, f"Perfil: {profile_id}")
    append_runtime_setup_log(log_path, f"Storage: {STORAGE_ROOT}")
    initial_state = runtime_setup_state(profile)

    if not requested_tasks:
        append_runtime_setup_log(log_path, "Perfil sin tareas. ClipDock listo.")
        write_runtime_setup_summary(log_path, profile=profile, state=initial_state, installed_count=0, skipped_count=0, status="completado")
        report(ProgressEvent(100, "ClipDock listo", "complete", {"profile": profile_id, "logPath": str(log_path)}))
        return {"profile": profile, "installed": [], "skipped": [], "logPath": str(log_path)}

    missing_tasks: list[tuple[str, str]] = []
    skipped: list[dict[str, str]] = []
    for kind, item_id in requested_tasks:
        name = COMPONENT_CATALOG[item_id]["name"] if kind == "component" else MODEL_CATALOG[item_id]["name"]
        ready = component_ready(item_id) if kind == "component" else model_ready(item_id)
        if ready:
            skipped.append({"kind": kind, "id": item_id, "name": name})
            append_runtime_setup_log(log_path, f"SKIP · {name} ya estaba instalado")
        else:
            missing_tasks.append((kind, item_id))
            append_runtime_setup_log(log_path, f"PENDIENTE · {name}")

    total_requested = len(requested_tasks)
    total_missing = len(missing_tasks)
    total_skipped = len(skipped)
    if total_missing == 0:
        message = f"Todo listo · {total_requested} componente(s) ya estaban instalados"
        append_runtime_setup_log(log_path, message)
        write_runtime_setup_summary(log_path, profile=profile, state=initial_state, installed_count=0, skipped_count=total_skipped, status="completado")
        report(ProgressEvent(100, message, "complete", {
            "profile": profile_id,
            "total": total_requested,
            "step": total_requested,
            "skipped": total_skipped,
            "installed": 0,
            "logPath": str(log_path),
        }))
        return {"profile": profile, "installed": [], "skipped": skipped, "logPath": str(log_path)}

    installed: list[dict[str, str]] = []
    first_message = f"Instalando {total_missing} de {total_requested} componente(s) · {total_skipped} ya listo(s)"
    report(ProgressEvent(0, first_message, "runtime-setup", {
        "profile": profile_id,
        "total": total_missing,
        "requestedTotal": total_requested,
        "skipped": total_skipped,
        "installed": 0,
        "logPath": str(log_path),
    }))
    append_runtime_setup_log(log_path, first_message)

    for index, (kind, item_id) in enumerate(missing_tasks):
        if cancel_event.is_set():
            append_runtime_setup_log(log_path, "CANCELADO · Instalación cancelada por el usuario")
            raise RuntimeError("Instalación cancelada")
        name = COMPONENT_CATALOG[item_id]["name"] if kind == "component" else MODEL_CATALOG[item_id]["name"]
        step = index + 1
        start = (index / total_missing) * 100
        span = 100 / total_missing
        append_runtime_setup_log(log_path, f"START · {step}/{total_missing} · {name}")

        def step_report(event: ProgressEvent, *, start=start, span=span, kind=kind, item_id=item_id, name=name, step=step):
            mapped = start + (max(0, min(100, float(event.percent))) / 100) * span
            base_message = event.message or f"Instalando {name}"
            message = f"{step} de {total_missing} · {base_message}"
            report(ProgressEvent(mapped, message, "runtime-setup", {
                "profile": profile_id,
                "kind": kind,
                "id": item_id,
                "name": name,
                "step": step,
                "total": total_missing,
                "requestedTotal": total_requested,
                "skipped": total_skipped,
                "installed": len(installed),
                "logPath": str(log_path),
            }))

        try:
            if kind == "component":
                install_component_inline(item_id, cancel_event, step_report)
            else:
                install_model_inline(item_id, cancel_event, step_report)
        except Exception as exc:
            append_runtime_setup_log(log_path, f"ERROR · {name} · {exc}")
            current_state = runtime_setup_state(profile)
            write_runtime_setup_summary(log_path, profile=profile, state=current_state, installed_count=len(installed), skipped_count=total_skipped, status="falló")
            raise
        installed.append({"kind": kind, "id": item_id, "name": name})
        append_runtime_setup_log(log_path, f"DONE · {name}")

    final_message = f"ClipDock {profile['label']} listo · {len(installed)} instalado(s), {total_skipped} ya listo(s)"
    append_runtime_setup_log(log_path, final_message)
    final_state = runtime_setup_state(profile)
    write_runtime_setup_summary(log_path, profile=profile, state=final_state, installed_count=len(installed), skipped_count=total_skipped, status="completado")
    report(ProgressEvent(100, final_message, "complete", {
        "profile": profile_id,
        "installed": len(installed),
        "skipped": total_skipped,
        "total": total_missing,
        "requestedTotal": total_requested,
        "logPath": str(log_path),
    }))
    return {"profile": profile, "installed": installed, "skipped": skipped, "logPath": str(log_path)}

def build_manual_recode(config: dict[str, Any]) -> tuple[str, list[str], list[str]]:
    containers = {"mp4": ".mp4", "mov": ".mov", "mkv": ".mkv", "webm": ".webm", "gif": ".gif", "mp3": ".mp3", "wav": ".wav"}
    video_codecs = {"h264": "libx264", "h265": "libx265", "vp9": "libvpx-vp9", "av1": "libaom-av1", "prores": "prores_ks", "copy": "copy", "none": None}
    audio_codecs = {"aac": "aac", "mp3": "libmp3lame", "opus": "libopus", "pcm": "pcm_s16le", "copy": "copy", "none": None}
    container = str(config.get("container") or "mp4")
    if container not in containers:
        raise ValueError("Contenedor manual no permitido")
    extension = containers[container]
    pre_params: list[str] = []
    params: list[str] = []
    start = str(config.get("trimStart") or "").strip()
    end = str(config.get("trimEnd") or "").strip()
    if start:
        if not re.fullmatch(r"\d{1,2}:\d{2}:\d{2}(?:\.\d+)?", start):
            raise ValueError("El inicio debe usar HH:MM:SS")
        pre_params += ["-ss", start]
    if end:
        if not re.fullmatch(r"\d{1,2}:\d{2}:\d{2}(?:\.\d+)?", end):
            raise ValueError("El final debe usar HH:MM:SS")
        if start:
            def seconds(value: str) -> float:
                hours, minutes, secs = value.split(":")
                return int(hours) * 3600 + int(minutes) * 60 + float(secs)
            duration = seconds(end) - seconds(start)
            if duration <= 0:
                raise ValueError("El final del recorte debe ser posterior al inicio")
            params += ["-t", str(duration)]
        else:
            params += ["-to", end]
    if container == "gif":
        width = int(config.get("width") or 0)
        height = int(config.get("height") or 720)
        fps = min(60, max(1, int(config.get("fps") or 24)))
        if height > 0:
            scale_filter = f"-2:{height}"
        elif width > 0:
            scale_filter = f"{width}:-2"
        else:
            scale_filter = "-2:720"
        params += ["-vf", f"fps={fps},scale={scale_filter}:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse", "-loop", "0", "-an"]
        return extension, pre_params, params
    video_key = str(config.get("videoCodec") or "h264")
    audio_key = str(config.get("audioCodec") or "aac")
    if video_key not in video_codecs or audio_key not in audio_codecs:
        raise ValueError("Códec manual no permitido")
    if container == "mp3":
        audio_key = "mp3"
    elif container == "wav":
        audio_key = "pcm"
    if container == "webm" and video_key not in {"vp9", "av1", "copy", "none"}:
        raise ValueError("WebM requiere VP9 o AV1")
    if container == "webm" and audio_key not in {"opus", "copy", "none"}:
        raise ValueError("WebM requiere audio Opus")
    if video_key == "prores" and container != "mov":
        raise ValueError("ProRes debe guardarse en MOV")
    if container in {"mp3", "wav"}:
        params.append("-vn")
    elif video_codecs[video_key]:
        params += ["-c:v", video_codecs[video_key]]
        if video_key in {"h264", "h265", "vp9", "av1"}:
            crf = min(40, max(0, int(config.get("quality") or 23)))
            params += ["-crf", str(crf)]
        if video_key == "h264":
            params += ["-preset", str(config.get("speed") or "medium"), "-pix_fmt", "yuv420p"]
        elif video_key == "h265":
            params += ["-preset", str(config.get("speed") or "medium"), "-tag:v", "hvc1"]
        elif video_key == "prores":
            params += ["-profile:v", str(min(3, max(0, int(config.get("proresProfile") or 2))))]
    width = str(config.get("width") or "").strip()
    height = str(config.get("height") or "").strip()
    if width or height:
        safe_width = int(width) if width else -2
        safe_height = int(height) if height else -2
        if safe_width != -2 and not 16 <= safe_width <= 16384:
            raise ValueError("Ancho fuera de rango")
        if safe_height != -2 and not 16 <= safe_height <= 16384:
            raise ValueError("Alto fuera de rango")
        params += ["-vf", f"scale={safe_width}:{safe_height}:flags=lanczos"]
    fps_value = str(config.get("fps") or "").strip()
    if fps_value and container not in {"mp3", "wav"}:
        fps = min(240, max(1, float(fps_value)))
        params += ["-r", str(fps)]
    if audio_codecs[audio_key]:
        params += ["-c:a", audio_codecs[audio_key]]
        bitrate = str(config.get("audioBitrate") or "192k")
        if audio_key in {"aac", "mp3", "opus"} and re.fullmatch(r"\d{2,3}k", bitrate):
            params += ["-b:a", bitrate]
    if container == "mp4":
        params += ["-movflags", "+faststart"]
    return extension, pre_params, params


def recode_config(config: dict[str, Any]) -> tuple[str, list[str], list[str], str]:
    mode = str(config.get("mode") or "off")
    if mode == "quick":
        preset_id = str(config.get("preset") or "h264_standard")
        if preset_id not in RECODE_PRESETS:
            raise ValueError("Preset de recodificación desconocido")
        preset = RECODE_PRESETS[preset_id]
        return preset["extension"], [], list(preset["params"]), preset["name"]
    if mode == "manual":
        extension, pre_params, params = build_manual_recode(config)
        return extension, pre_params, params, "Manual"
    raise ValueError("La recodificación no está activada")


def recode_file(input_path: str, config: dict[str, Any], cancel_event: threading.Event, report) -> str:
    source = safe_path(input_path, must_exist=True)
    extension, pre_params, params, label = recode_config(config)
    suffix = re.sub(r"[^a-zA-Z0-9]+", "_", label).strip("_")[:35]
    output_dir = safe_path(config.get("outputDir")) if config.get("outputDir") else source.parent
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / f"{source.stem}_ClipDock_{suffix}{extension}"
    counter = 2
    while output.exists():
        output = output_dir / f"{source.stem}_ClipDock_{suffix}_{counter}{extension}"
        counter += 1
    def on_progress(percent=0, message="Recodificando", *_args):
        report(ProgressEvent(float(percent or 0), str(message), "recode", {"input": str(source)}))
    result = engine.ffmpeg.execute_recode({
        "input_file": str(source), "output_file": str(output), "pre_params": pre_params,
        "ffmpeg_params": params, "mode": "Video+Audio",
    }, on_progress, cancel_event)
    report(ProgressEvent(100, "Recodificación lista", "complete", {"input": str(source)}))
    return str(result)


def on_progress(job_id: str, event: ProgressEvent) -> None:
    progress_state[job_id] = {
        "percent": max(0, min(100, float(event.percent))),
        "message": event.message,
        "phase": event.phase,
        "details": event.details,
    }


queue = JobQueue(on_progress=on_progress)

def remember_adobe_files(files: list[str], source: str = "adobe-extension") -> None:
    clean: list[str] = []
    seen: set[str] = set()
    for item in files or []:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        clean.append(text)
    if not clean:
        return
    with adobe_inbox_lock:
        received_from_adobe.extend(clean)
        try:
            APP_DATA.mkdir(parents=True, exist_ok=True)
            with ADOBE_INBOX_PATH.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps({"id": uuid.uuid4().hex, "source": source, "files": clean, "createdAt": time.time()}, ensure_ascii=False) + "\n")
        except Exception:
            # La memoria sigue activa aunque no se pueda escribir el respaldo.
            pass


def pop_adobe_inbox() -> list[str]:
    with adobe_inbox_lock:
        files: list[str] = []
        if ADOBE_INBOX_PATH.exists():
            try:
                for line in ADOBE_INBOX_PATH.read_text(encoding="utf-8", errors="ignore").splitlines():
                    try:
                        payload = json.loads(line)
                    except Exception:
                        continue
                    files.extend(str(item or "").strip() for item in payload.get("files", []) if str(item or "").strip())
                ADOBE_INBOX_PATH.unlink(missing_ok=True)
            except Exception:
                pass
        files.extend(received_from_adobe)
        received_from_adobe.clear()
        deduped: list[str] = []
        seen: set[str] = set()
        for item in files:
            key = item.lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
        return deduped


def receive_adobe_download_request(data: dict[str, Any]) -> None:
    url = normalize_url(data.get("url"))
    if not url.startswith(("http://", "https://")):
        return
    request_id = str(data.get("requestId") or data.get("id") or uuid.uuid4().hex)
    pending_adobe_downloads.append({
        "id": request_id,
        "requestId": request_id,
        "url": url,
        "thumbnail": bool(data.get("thumbnail")),
        "subtitles": data.get("subtitles") if isinstance(data.get("subtitles"), list) else bool(data.get("subtitles")),
        "subtitleFormat": str(data.get("subtitleFormat") or "srt"),
        "subtitleLang": str(data.get("subtitleLang") or "auto"),
        "addToTimeline": bool(data.get("addToTimeline")),
        "title": str(data.get("title") or ""),
        "sourceThumbnail": str(data.get("sourceThumbnail") or ""),
        "formatSelector": str(data.get("formatSelector") or "bv*+ba/b"),
        "recode": data.get("recode") if isinstance(data.get("recode"), dict) else {"mode": "quick", "preset": "h264_standard", "keepOriginal": False},
        "outputDir": str(data.get("outputDir") or ""),
        "source": str(data.get("source") or "adobe-extension"),
        "autoStart": bool(data.get("autoStart", True)),
        "createdAt": time.time(),
    })

bridge = CEPBridgeServer(
    port=int(os.getenv("CLIPDOCK_BRIDGE_PORT") or 7788),
    on_editor_files=lambda files: remember_adobe_files(files, "socket"),
    on_download_request=receive_adobe_download_request,
)


def payload() -> dict[str, Any]:
    return request.get_json(silent=True) or {}


def normalize_url(value: Any) -> str:
    text = str(value or "").strip()
    starts = [match.start() for match in re.finditer(r"https?://", text, re.IGNORECASE)]
    if starts:
        text = text[starts[-1]:].split()[0]
    return text


def safe_path(value: Any, *, must_exist: bool = False) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Falta una ruta valida")
    path = Path(value).expanduser().resolve()
    if must_exist and not path.exists():
        raise ValueError(f"No existe: {path}")
    return path


def serialize_job(job) -> dict[str, Any]:
    result = job.result
    if isinstance(result, Path):
        result = str(result)
    return {
        "id": job.id,
        "state": job.state.value,
        "result": result,
        "error": job.error,
        "progress": progress_state.get(job.id, {"percent": 0, "message": "En cola", "phase": "queued"}),
        "context": job_context.get(job.id, {}),
    }


@app.after_request
def cors(response):
    response.headers["Access-Control-Allow-Origin"] = "null"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response


@app.errorhandler(Exception)
def handle_error(error):
    if isinstance(error, ComponentsRequiredError):
        return jsonify({
            "error": str(error), "code": "components_required",
            "components": error.components, "action": error.action,
        }), 424
    return jsonify({"error": str(error)}), 400


@app.get("/health")
def health():
    return jsonify({
        "ok": True,
        "adobeTarget": bridge.clients.get(bridge.active_sid) if bridge.active_sid else None,
        "appName": "ClipDock",
        "apiPort": bridge.api_port,
        "bridgePort": bridge.port,
        "enginePath": str(ENGINE_ROOT),
        "components": {"deno": deno_ready(), "ffmpeg": ffmpeg_ready()},
    })


@app.get("/api/settings")
def get_settings():
    return jsonify(load_settings())


@app.post("/api/settings")
def update_settings():
    return jsonify(save_settings(payload()))


@app.get("/api/cookies/status")
def get_cookie_status():
    return jsonify(cookie_status(load_settings()))


@app.post("/api/cookies/test")
def test_cookies():
    settings = load_settings()
    status = cookie_status(settings)
    if not (status.get("exists") and status.get("looksValid")):
        return jsonify({"ok": False, "status": status, "message": status.get("message") or "No hay cookies.txt usable."}), 400
    cookies = cookie_options(settings)
    test_url = normalize_url((payload() or {}).get("url") or "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    try:
        info = engine.analyze_url(test_url, cookies)
        title = (info or {}).get("title") or "YouTube respondió correctamente"
        strategy = (info or {}).get("_clipdock_cookie_strategy") or "automática"
        summary = status.get("summary") or {}
        return jsonify({
            "ok": True,
            "status": status,
            "title": title,
            "strategy": strategy,
            "message": f"yt-dlp leyó {summary.get('count', 0)} cookies y YouTube respondió sin bloqueo. Estrategia: {strategy}.",
            "runtime": youtube_runtime_hint(),
        })
    except Exception as error:
        return jsonify({
            "ok": False,
            "status": status,
            "message": f"El archivo sí se leyó, pero YouTube no aceptó esa sesión todavía: {error}",
            "runtime": youtube_runtime_hint(),
        }), 400


@app.post("/api/analyze")
def analyze():
    data = payload()
    url = normalize_url(data.get("url"))
    if not url.startswith(("http://", "https://")):
        raise ValueError("Escribe un enlace http o https valido")
    settings = load_settings()
    cookies = data.get("cookies") or cookie_options(settings)
    try:
        info = engine.analyze_url(url, cookies)
    except Exception as error:
        is_youtube = bool(re.search(r"(?:youtube\.com|youtu\.be)", url, re.I))
        if is_youtube and not deno_ready() and is_javascript_runtime_error(error):
            raise ComponentsRequiredError(
                ["deno"],
                "YouTube necesita el motor JavaScript Deno para resolver este enlace. Puedes instalarlo con un clic y volver a analizar.",
                "analyze",
            ) from error
        if is_youtube and is_youtube_auth_error(error):
            cookie_file = cookies.get("cookiefile", "sin cookies.txt") if cookies else "sin cookies.txt"
            raise RuntimeError(
                "YouTube pidió confirmar la sesión. ClipDock ya intentó el acceso público y los métodos disponibles. "
                f"Archivo usado: {cookie_file}. {youtube_runtime_hint()}. "
                "Importa cookies.txt solo para videos privados, restringidos o cuando YouTube lo solicite. "
                f"Detalle real: {error}"
            ) from error
        raise RuntimeError(f"No se pudo analizar el enlace. {youtube_runtime_hint()}. Detalle: {error}") from error
    if not info:
        raise ValueError("No se pudo analizar el enlace")
    return jsonify(info)


def create_download_job(data: dict[str, Any]):
    """Crea un trabajo de descarga reutilizable por la app y por el control remoto CEP."""
    url = normalize_url(data.get("url"))
    if not url.startswith(("http://", "https://")):
        raise ValueError("El enlace de descarga no es valido")
    output_dir = safe_path(data.get("outputDir") or load_settings().get("outputDir") or str(Path.home() / "Downloads"))
    output_dir.mkdir(parents=True, exist_ok=True)
    requested_recode = data.get("recode") if isinstance(data.get("recode"), dict) else {}
    selector = str(data.get("formatSelector") or "bv*+ba/b")
    template = str(output_dir / "%(title)s [%(id)s].%(ext)s")
    subtitle_format = str(data.get("subtitleFormat") or "srt").lower()
    allowed_subtitle_formats = {"srt", "json3", "srv1", "srv2", "srv3", "ttml", "vtt", "ass"}
    if subtitle_format not in allowed_subtitle_formats:
        subtitle_format = "srt"
    extra_options: dict[str, Any] = {
        "writethumbnail": bool(data.get("thumbnail")),
        "noplaylist": not bool(data.get("playlist")),
    }
    if data.get("subtitles"):
        extra_options["writesubtitles"] = True
        extra_options["writeautomaticsub"] = True
        extra_options["subtitlesformat"] = subtitle_format
        if subtitle_format in {"srt", "vtt", "ass"}:
            extra_options["postprocessors"] = [{"key": "FFmpegSubtitlesConvertor", "format": subtitle_format}]
    fragment = data.get("fragment") if isinstance(data.get("fragment"), dict) else {}
    ffmpeg_reasons = []
    if requested_recode.get("mode") in {"quick", "manual"}:
        ffmpeg_reasons.append("recodificar")
    if "+" in selector:
        ffmpeg_reasons.append("unir video y audio")
    if fragment.get("enabled"):
        ffmpeg_reasons.append("recortar el fragmento")
    if data.get("subtitles") and subtitle_format in {"srt", "vtt", "ass"}:
        ffmpeg_reasons.append("convertir subtítulos")
    auto_install_components = data.get("autoInstallComponents") is not False
    missing_components: list[str] = []
    if ffmpeg_reasons and not ffmpeg_ready():
        missing_components.append("ffmpeg")
    if missing_components and not auto_install_components:
        purpose = ", ".join(dict.fromkeys(ffmpeg_reasons))
        raise ComponentsRequiredError(
            missing_components,
            f"Esta descarga necesita FFmpeg para {purpose}. Instálalo con un clic y vuelve a descargar.",
            "download",
        )
    if fragment.get("enabled"):
        start = max(0.0, float(fragment.get("start") or 0))
        end = float(fragment.get("end") or 0)
        if end <= start:
            raise ValueError("El final del fragmento debe ser posterior al inicio")
        extra_options["download_ranges"] = download_range_func([], [(start, end)])
        extra_options["force_keyframes_at_cuts"] = True
    subtitle_items = data.get("subtitles", [])
    if subtitle_items is True:
        subtitle_items = []
    elif not isinstance(subtitle_items, (list, tuple, set)):
        subtitle_items = []
    req = DownloadRequest(
        url=url,
        output_template=template,
        format_selector=selector,
        subtitles=[str(x) for x in subtitle_items],
        extra_options=extra_options,
    )
    settings = load_settings()
    cookies = {} if data.get("ignoreCookies") else cookie_options(settings)
    if cookies.get("cookiefile"):
        req.cookie_file = cookies["cookiefile"]
    if cookies.get("cookiesfrombrowser"):
        req.browser_cookies = cookies["cookiesfrombrowser"]

    def operation(cancel_event: threading.Event, report):
        def hook(percent=0, message="Descargando", *_args, **_kwargs):
            try:
                pct = float(percent)
            except (TypeError, ValueError):
                pct = 0
            report(ProgressEvent(pct, str(message), "download"))

        if missing_components:
            ensure_components_inline(missing_components, cancel_event, report)
            report(ProgressEvent(0, "Dependencias listas. Continuando descarga...", "download"))

        try:
            downloaded = engine.download(req, hook, cancel_event)
        except Exception as exc:
            if re.search(r"(?:youtube\.com|youtu\.be)", url, re.I) and not deno_ready() and is_javascript_runtime_error(exc):
                report(ProgressEvent(0, "YouTube necesita Deno. Instalando dependencia y reintentando...", "component", {"componentId": "deno"}))
                ensure_components_inline(["deno"], cancel_event, report)
                report(ProgressEvent(0, "Deno listo. Reintentando descarga...", "download"))
                downloaded = engine.download(req, hook, cancel_event)
            else:
                raise

        recode = data.get("recode") if isinstance(data.get("recode"), dict) else {}
        if recode.get("mode") in {"quick", "manual"} and not cancel_event.is_set():
            recode["outputDir"] = str(output_dir)
            result = recode_file(str(downloaded), recode, cancel_event, report)
            if recode.get("keepOriginal") is False and Path(downloaded).resolve() != Path(result).resolve():
                Path(downloaded).unlink(missing_ok=True)
            return result
        return downloaded

    job = queue.submit(operation)
    job_context[job.id] = {
        "kind": "download",
        "title": str(data.get("title") or "Descarga multimedia"),
        "thumbnail": str(data.get("sourceThumbnail") or ""),
        "source": url,
        "remote": str(data.get("source") or "") == "adobe-extension",
        "requestId": str(data.get("requestId") or ""),
        "addToTimeline": bool(data.get("addToTimeline")),
    }
    return job


@app.post("/api/jobs/download")
def download():
    job = create_download_job(payload())
    return jsonify(serialize_job(job)), 202


@app.post("/api/adobe/remote-download")
def adobe_remote_download():
    data = payload()
    request_id = str(data.get("requestId") or data.get("id") or uuid.uuid4().hex)
    data["requestId"] = request_id
    data.setdefault("source", "adobe-extension")
    data.setdefault("formatSelector", "bv*+ba/b")
    data.setdefault("playlist", False)
    # El control remoto puede elegir el formato. Conservamos H.264 Normal como
    # valor seguro para paneles antiguos que no mandan una configuración.
    requested_recode = data.get("recode") if isinstance(data.get("recode"), dict) else None
    if not requested_recode or requested_recode.get("mode") not in {"off", "quick", "manual"}:
        data["recode"] = {"mode": "quick", "preset": "h264_standard", "keepOriginal": False}
    # Un reintento de red no debe iniciar dos descargas del mismo clic.
    with remote_jobs_lock:
        existing_id = remote_jobs_by_request_id.get(request_id)
        existing_job = queue.get(existing_id) if existing_id else None
        if existing_job:
            return jsonify({
                "accepted": True,
                "duplicate": True,
                "job": serialize_job(existing_job),
                "jobId": existing_job.id,
                "requestId": request_id,
            }), 200
        job = create_download_job(data)
        remote_jobs_by_request_id[request_id] = job.id
        if len(remote_jobs_by_request_id) > 500:
            for old_request_id in list(remote_jobs_by_request_id)[:100]:
                if old_request_id != request_id:
                    remote_jobs_by_request_id.pop(old_request_id, None)
    return jsonify({"accepted": True, "job": serialize_job(job), "jobId": job.id, "requestId": request_id}), 202


@app.get("/api/recode-presets")
def recode_presets():
    return jsonify([{"id": key, "name": value["name"], "group": value["group"], "description": value["description"], "extension": value["extension"]} for key, value in RECODE_PRESETS.items()])


@app.post("/api/jobs/recode")
def recode_local():
    data = payload()
    source = safe_path(data.get("input"), must_exist=True)
    config = data.get("recode") if isinstance(data.get("recode"), dict) else {}
    def operation(cancel_event: threading.Event, report):
        return recode_file(str(source), config, cancel_event, report)
    job = queue.submit(operation)
    job_context[job.id] = {"kind": "recode", "title": source.name, "source": str(source)}
    return jsonify(serialize_job(job)), 202


@app.post("/api/jobs/image")
def process_image():
    data = payload()
    source = safe_path(data.get("input"), must_exist=True)
    output = safe_path(data.get("output"))
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".tiff", ".tif", ".bmp", ".ico", ".pdf"}
    if output.suffix.lower() not in allowed:
        raise ValueError("Formato de salida no permitido")
    options = data.get("options") if isinstance(data.get("options"), dict) else {}
    output.parent.mkdir(parents=True, exist_ok=True)

    def operation(cancel_event: threading.Event, report):
        def notify(percent=0, message="Procesando imagen", *_args):
            report(ProgressEvent(float(percent or 0), str(message), "image"))
        ok = engine.convert_image(str(source), str(output), options, progress_callback=notify, cancellation_event=cancel_event)
        if not ok:
            raise RuntimeError("El motor no pudo procesar la imagen")
        report(ProgressEvent(100, "Imagen lista", "complete"))
        return str(output)

    job = queue.submit(operation)
    job_context[job.id] = {"kind": "image", "title": source.name, "source": str(source)}
    return jsonify(serialize_job(job)), 202


@app.post("/api/jobs/video-upscale")
def upscale_video():
    data = payload()
    source = safe_path(data.get("input"), must_exist=True)
    output = safe_path(data.get("output"))
    if output.suffix.lower() not in {".mp4", ".mov", ".mkv", ".avi"}:
        raise ValueError("Contenedor de video no permitido")
    output.parent.mkdir(parents=True, exist_ok=True)
    options = data.get("options") if isinstance(data.get("options"), dict) else {}

    def operation(cancel_event: threading.Event, report):
        def notify(percent=0, message="Mejorando video", *_args):
            report(ProgressEvent(float(percent or 0), str(message), "video_upscale", {"input": str(source)}))
        upscaler = engine.video_upscaler(cancellation_event=cancel_event, progress_callback=notify)
        result = upscaler.upscale_video(str(source), str(output), options)
        report(ProgressEvent(100, "Video mejorado", "complete", {"input": str(source)}))
        return str(result)

    job = queue.submit(operation)
    job_context[job.id] = {"kind": "video-upscale", "title": source.name, "source": str(source)}
    return jsonify(serialize_job(job)), 202


@app.post("/api/import-remote-image")
def import_remote_image():
    data = payload()
    url = str(data.get("url") or "").strip()
    if not url.startswith(("http://", "https://")):
        raise ValueError("La imagen remota no tiene una URL válida")
    response = requests.get(url, timeout=45, stream=True)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "")
    if not content_type.startswith("image/"):
        raise ValueError("El enlace no devolvió una imagen")
    suffix = {"image/jpeg": ".jpg", "image/webp": ".webp", "image/png": ".png"}.get(content_type.split(";")[0], ".jpg")
    name = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(data.get("name") or "portada"))[:60]
    destination = APP_DATA / "imports" / f"{name}_{uuid.uuid4().hex[:7]}{suffix}"
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as handle:
        for chunk in response.iter_content(1024 * 256):
            if chunk:
                handle.write(chunk)
    return jsonify({"path": str(destination)})


@app.get("/api/runtime/profiles")
def runtime_profiles():
    return jsonify({"version": RUNTIME_PROFILE_MANIFEST["version"], "profiles": [runtime_profile_payload(key) for key in RUNTIME_PROFILE_MANIFEST["profiles"]]})


@app.get("/api/runtime/setup-status")
def runtime_setup_status():
    profile_id = str(request.args.get("profile") or "recommended")
    profile = runtime_profile_payload(profile_id)
    state = runtime_setup_state(profile)
    latest_log = latest_runtime_setup_log()
    return jsonify({
        "profile": profile,
        "state": state,
        "logsRoot": str(SETUP_LOG_ROOT),
        "lastLogPath": str(latest_log) if latest_log else "",
        "lastLogPreview": read_runtime_setup_log_preview(latest_log),
    })


@app.post("/api/runtime/setup-logs-folder")
def runtime_setup_logs_folder():
    SETUP_LOG_ROOT.mkdir(parents=True, exist_ok=True)
    return jsonify({"path": str(SETUP_LOG_ROOT)})


@app.post("/api/runtime/setup-last-log")
def runtime_setup_last_log():
    latest_log = latest_runtime_setup_log()
    if not latest_log:
        SETUP_LOG_ROOT.mkdir(parents=True, exist_ok=True)
        return jsonify({"path": str(SETUP_LOG_ROOT), "exists": False, "preview": ""})
    return jsonify({"path": str(latest_log), "exists": True, "preview": read_runtime_setup_log_preview(latest_log)})


@app.post("/api/runtime/setup-audit")
def runtime_setup_audit():
    data = payload()
    profile_id = str(data.get("profile") or "recommended")
    reason = str(data.get("reason") or "setup-saltado")
    selected_at = str(data.get("selectedAt") or "")
    profile = runtime_profile_payload(profile_id)
    state = runtime_setup_state(profile)
    log_path = runtime_setup_log_path(f"{profile_id}-audit")
    append_runtime_setup_log(log_path, f"=== Preparación inicial ClipDock · {profile['label']} ===")
    append_runtime_setup_log(log_path, f"Registro: {reason}")
    append_runtime_setup_log(log_path, f"Perfil: {profile_id}")
    if selected_at:
        append_runtime_setup_log(log_path, f"Fecha guardada en app: {selected_at}")
    append_runtime_setup_log(log_path, f"Storage: {STORAGE_ROOT}")
    for item in state["ready"]:
        append_runtime_setup_log(log_path, f"OK · {item['name']} ya instalado")
    for item in state["missing"]:
        append_runtime_setup_log(log_path, f"PENDIENTE · {item['name']}")
    status = "saltado" if reason.startswith("setup-saltado") else "registrado"
    write_runtime_setup_summary(log_path, profile=profile, state=state, installed_count=0, skipped_count=len(state["ready"]), status=status)
    return jsonify({"profile": profile, "state": state, "logPath": str(log_path)})


@app.post("/api/runtime/setup")
def runtime_setup():
    data = payload()
    profile_id = str(data.get("profile") or "recommended")
    profile = runtime_profile_payload(profile_id)
    previous = queue.get(runtime_setup_jobs.get(profile_id, ""))
    if previous and previous.state.value in {"queued", "running"}:
        return jsonify({"profile": profile, "job": serialize_job(previous), "jobId": previous.id}), 202

    def operation(cancel_event: threading.Event, report):
        return runtime_setup_operation(profile_id, cancel_event, report)

    job = queue.submit(operation)
    runtime_setup_jobs[profile_id] = job.id
    return jsonify({"profile": profile, "job": serialize_job(job), "jobId": job.id}), 202


@app.get("/api/jobs/<job_id>")
def job_detail(job_id: str):
    job = queue.get(job_id)
    if not job:
        raise ValueError("Trabajo no encontrado")
    return jsonify(serialize_job(job))


@app.get("/api/components")
def components():
    result = []
    for key, info in COMPONENT_CATALOG.items():
        path = component_path(info)
        job = queue.get(component_jobs.get(key, ""))
        meta = read_install_meta("components", key)
        result.append({
            "id": key, "name": info["name"], "description": info["description"],
            "installed": path.exists(), "path": str(path), "root": str(COMPONENTS_ROOT),
            "size": file_size(component_root(info)) if component_root(info).exists() else 0,
            "installedVersion": meta.get("version") or "",
            "installedAt": meta.get("installedAt") or "",
            "job": serialize_job(job) if job else None,
        })
    return jsonify(result)


def component_update_entry(component_id: str, info: dict[str, Any]) -> dict[str, Any]:
    path = component_path(info)
    installed = path.exists()
    meta = read_install_meta("components", component_id)
    installed_version = str(meta.get("version") or "")
    try:
        latest_version, urls = resolve_release_asset(info)
        update_available = bool(installed and (not installed_version or installed_version != latest_version))
        return {
            "id": component_id,
            "name": info["name"],
            "installed": installed,
            "installedVersion": installed_version,
            "latestVersion": latest_version,
            "updateAvailable": update_available,
            "checked": True,
            "source": urls[0] if urls else "",
        }
    except Exception as exc:
        return {
            "id": component_id,
            "name": info["name"],
            "installed": installed,
            "installedVersion": installed_version,
            "latestVersion": "",
            "updateAvailable": False,
            "checked": False,
            "error": str(exc),
        }


@app.get("/api/components/updates")
def component_updates():
    return jsonify({"updates": [component_update_entry(key, info) for key, info in COMPONENT_CATALOG.items()]})


@app.post("/api/components-folder")
def components_folder():
    prepare_storage_folders()
    return jsonify({"path": str(COMPONENTS_ROOT), "storageRoot": str(STORAGE_ROOT), "cacheRoot": str(CACHE_ROOT)})


@app.post("/api/components/<component_id>/delete")
def delete_component(component_id: str):
    if component_id not in COMPONENT_CATALOG:
        raise ValueError("Componente desconocido")
    info = COMPONENT_CATALOG[component_id]
    root = component_root(info)
    if root.exists():
        shutil.rmtree(root, ignore_errors=True)
    remove_install_meta("components", component_id)
    return jsonify({"ok": True, "path": str(root)})


@app.post("/api/components/<component_id>/install")
def install_component(component_id: str):
    if component_id not in COMPONENT_CATALOG:
        raise ValueError("Componente desconocido")
    previous = queue.get(component_jobs.get(component_id, ""))
    if previous and previous.state.value in {"queued", "running"}:
        return jsonify(serialize_job(previous)), 202

    def operation(cancel_event: threading.Event, report):
        return str(install_component_inline(component_id, cancel_event, report))

    job = queue.submit(operation)
    component_jobs[component_id] = job.id
    return jsonify(serialize_job(job)), 202


@app.get("/api/models")
def models():
    result = []
    for key, info in MODEL_CATALOG.items():
        path = model_path(info)
        job = queue.get(model_jobs.get(key, ""))
        meta = read_install_meta("models", key)
        result.append({
            "id": key, "name": info["name"], "description": info["description"], "group": info["group"],
            "installed": path.exists(), "size": file_size(path if info["kind"] == "file" else path.parent), "path": str(path), "root": str(MODELS_ROOT),
            "installedVersion": meta.get("version") or "",
            "latestVersion": model_catalog_version(info),
            "job": serialize_job(job) if job else None,
        })
    return jsonify(result)


def model_update_entry(model_id: str, info: dict[str, Any]) -> dict[str, Any]:
    path = model_path(info)
    installed = path.exists()
    meta = read_install_meta("models", model_id)
    installed_version = str(meta.get("version") or "")
    latest_version = model_catalog_version(info)
    return {
        "id": model_id,
        "name": info["name"],
        "installed": installed,
        "installedVersion": installed_version,
        "latestVersion": latest_version,
        "updateAvailable": bool(installed and (not installed_version or installed_version != latest_version)),
        "checked": True,
        "source": info.get("url") or "",
    }


@app.get("/api/models/updates")
def model_updates():
    return jsonify({"updates": [model_update_entry(key, info) for key, info in MODEL_CATALOG.items()]})


@app.post("/api/models-folder")
def models_folder():
    prepare_storage_folders()
    return jsonify({"path": str(MODELS_ROOT), "storageRoot": str(STORAGE_ROOT), "cacheRoot": str(CACHE_ROOT)})


@app.post("/api/models/<model_id>/download")
def download_model(model_id: str):
    if model_id not in MODEL_CATALOG:
        raise ValueError("Modelo desconocido")
    previous = queue.get(model_jobs.get(model_id, ""))
    if previous and previous.state.value in {"queued", "running"}:
        return jsonify(serialize_job(previous)), 202
    info = MODEL_CATALOG[model_id]

    def operation(cancel_event: threading.Event, report):
        target = model_path(info)
        APP_DATA.mkdir(parents=True, exist_ok=True)
        MODEL_TEMP_ROOT.mkdir(parents=True, exist_ok=True)
        temp_file = MODEL_TEMP_ROOT / f"{model_id}_{uuid.uuid4().hex}.part"
        response = requests.get(info["url"], stream=True, timeout=60)
        response.raise_for_status()
        total = int(response.headers.get("content-length") or 0)
        downloaded = 0
        with temp_file.open("wb") as handle:
            for chunk in response.iter_content(1024 * 512):
                if cancel_event.is_set():
                    break
                if chunk:
                    handle.write(chunk)
                    downloaded += len(chunk)
                    percent = (downloaded / total * 85) if total else 25
                    report(ProgressEvent(percent, f"Descargando {info['name']}", "model", {"modelId": model_id}))
        if cancel_event.is_set():
            temp_file.unlink(missing_ok=True)
            return None
        if info["kind"] == "file":
            target.parent.mkdir(parents=True, exist_ok=True)
            temp_file.replace(target)
        else:
            MODEL_EXTRACT_ROOT.mkdir(parents=True, exist_ok=True)
            extract_root = MODEL_EXTRACT_ROOT / f"{model_id}_{uuid.uuid4().hex}"
            extract_root.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(temp_file) as archive:
                for member in archive.infolist():
                    resolved = (extract_root / member.filename).resolve()
                    if extract_root.resolve() not in resolved.parents and resolved != extract_root.resolve():
                        raise ValueError("El paquete del modelo contiene una ruta no segura")
                archive.extractall(extract_root)
            found = next(extract_root.rglob(info["exe"]), None)
            if not found:
                raise RuntimeError("El ejecutable esperado no está dentro del paquete")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(found.parent, target.parent, dirs_exist_ok=True)
            shutil.rmtree(extract_root, ignore_errors=True)
            temp_file.unlink(missing_ok=True)
        write_install_meta("models", model_id, model_catalog_version(info), info.get("url") or "")
        report(ProgressEvent(100, f"{info['name']} instalado", "complete", {"modelId": model_id}))
        return str(target)

    job = queue.submit(operation)
    model_jobs[model_id] = job.id
    return jsonify(serialize_job(job)), 202


@app.post("/api/models/<model_id>/delete")
def delete_model(model_id: str):
    if model_id not in MODEL_CATALOG:
        raise ValueError("Modelo desconocido")
    info = MODEL_CATALOG[model_id]
    target = model_path(info)
    if info["kind"] == "file":
        target.unlink(missing_ok=True)
    elif target.parent.exists():
        shutil.rmtree(target.parent)
    remove_install_meta("models", model_id)
    return jsonify({"deleted": True})



def asset_media_type(path: Path) -> str:
    ext = path.suffix.lower().lstrip('.')
    if ext in {'mp3','wav','flac','m4a','aac','ogg','aiff','aif'}:
        return 'audio'
    return 'video'


@app.get("/api/assets")
def assets():
    prepare_storage_folders()
    allowed = {'.mp4','.mov','.mkv','.webm','.avi','.m4v','.mp3','.wav','.flac','.m4a','.aac','.ogg','.aiff','.aif'}
    result: list[dict[str, Any]] = []
    for kind, folder in ASSET_FOLDERS.items():
        folder.mkdir(parents=True, exist_ok=True)
        for path in sorted(folder.rglob('*'), key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True):
            if not path.is_file() or path.suffix.lower() not in allowed:
                continue
            stat = path.stat()
            result.append({
                'kind': kind,
                'name': path.name,
                'path': str(path),
                'size': stat.st_size,
                'modified': stat.st_mtime,
                'modifiedLabel': time.strftime('%d/%m/%Y %H:%M', time.localtime(stat.st_mtime)),
                'mediaType': asset_media_type(path),
            })
    return jsonify({'assets': result, 'folders': {'root': str(ASSET_ROOT), 'sfx': str(ASSET_FOLDERS['sfx']), 'vfx': str(ASSET_FOLDERS['vfx'])}})


@app.get("/api/jobs")
def jobs():
    return jsonify([serialize_job(job) for job in reversed(list(queue._jobs.values()))])


@app.post("/api/jobs/<job_id>/cancel")
def cancel(job_id: str):
    return jsonify({"cancelled": queue.cancel(job_id)})


@app.post("/api/jobs/<job_id>/pause")
def pause_job(job_id: str):
    return jsonify({"paused": queue.pause(job_id)})


@app.post("/api/jobs/<job_id>/resume")
def resume_job(job_id: str):
    return jsonify({"resumed": queue.resume(job_id)})


@app.get("/api/adobe")
def adobe_status():
    target = bridge.clients.get(bridge.active_sid) if bridge.active_sid else None
    files = pop_adobe_inbox()
    downloads = list(pending_adobe_downloads)
    pending_adobe_downloads.clear()
    return jsonify({"target": target, "receivedFiles": files, "downloadRequests": downloads})


@app.post("/api/adobe/receive")
def adobe_receive():
    data = payload()
    raw_files = [str(item or "").strip() for item in data.get("files", []) if str(item or "").strip()]
    files: list[str] = []
    rejected: list[str] = []
    for item in raw_files:
        try:
            path = safe_path(item, must_exist=True)
            files.append(str(path))
        except Exception:
            # Premiere a veces entrega rutas que existen para Adobe pero Python no puede resolver
            # de inmediato (medios offline, rutas con encoding raro, carpetas de red). Las guardamos
            # igual para que la interfaz las enrute por extensión y muestre algo útil.
            rejected.append(item)
            files.append(item)
    if not files:
        raise ValueError("Adobe no envió archivos válidos")
    remember_adobe_files(files, str(data.get("source") or "api"))
    return jsonify({"received": len(files), "files": files, "unverified": rejected})


@app.post("/api/adobe/download-request")
def adobe_download_request():
    data = payload()
    url = normalize_url(data.get("url"))
    if not url.startswith(("http://", "https://")):
        raise ValueError("El enlace enviado desde Adobe no es válido")
    request_id = str(data.get("requestId") or data.get("id") or uuid.uuid4().hex)
    request_payload = {
        "id": request_id,
        "requestId": request_id,
        "url": url,
        "thumbnail": bool(data.get("thumbnail")),
        "subtitles": data.get("subtitles") if isinstance(data.get("subtitles"), list) else bool(data.get("subtitles")),
        "subtitleFormat": str(data.get("subtitleFormat") or "srt"),
        "subtitleLang": str(data.get("subtitleLang") or "auto"),
        "addToTimeline": bool(data.get("addToTimeline")),
        "title": str(data.get("title") or ""),
        "sourceThumbnail": str(data.get("sourceThumbnail") or ""),
        "formatSelector": str(data.get("formatSelector") or "bv*+ba/b"),
        "recode": data.get("recode") if isinstance(data.get("recode"), dict) else {"mode": "quick", "preset": "h264_standard", "keepOriginal": False},
        "outputDir": str(data.get("outputDir") or ""),
        "source": str(data.get("source") or "adobe-extension"),
        "autoStart": bool(data.get("autoStart", True)),
        "createdAt": time.time(),
    }
    pending_adobe_downloads.append(request_payload)
    return jsonify({"accepted": True, "request": request_payload})


@app.post("/api/adobe/send")
def adobe_send():
    data = payload()
    files = [str(safe_path(item, must_exist=True)) for item in data.get("files", [])]
    if not files:
        raise ValueError("Selecciona al menos un archivo")
    delivery = bridge.send_batch(
        files,
        str(data.get("targetBin") or "ClipDock"),
        add_to_timeline=bool(data.get("addToTimeline")),
        delivery_id=str(data.get("deliveryId") or "") or None,
        wait_timeout=float(data.get("waitTimeout") or 15),
    )
    return jsonify({
        "sent": len(files),
        "confirmed": bool(delivery.get("success")),
        "delivery": delivery,
    }), (200 if delivery.get("success") else 202)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=7790)
    args = parser.parse_args()
    bridge.api_port = args.port
    bridge.start_background()
    app.run(host="127.0.0.1", port=args.port, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()
