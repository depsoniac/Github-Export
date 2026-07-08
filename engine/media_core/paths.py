"""Rutas configurables del motor; no depende de ninguna interfaz."""

from __future__ import annotations

import os
import shutil
from pathlib import Path


def _documents_dir() -> Path:
    """Devuelve la carpeta Documentos del usuario con un fallback portable."""
    home = Path.home()
    if os.name == "nt":
        # En Windows la carpeta puede verse como "Documentos" en Explorer,
        # pero normalmente la ruta real sigue siendo "Documents".
        return Path(os.environ.get("USERPROFILE", str(home))) / "Documents"
    return home / "Documents"


def _user_storage_root() -> Path:
    """Raíz externa editable para modelos y archivos pesados de ClipDock."""
    custom_root = os.environ.get("CLIPDOCK_STORAGE_DIR")
    if custom_root:
        return Path(custom_root).expanduser()
    return _documents_dir() / "ClipDock"


PROJECT_ROOT = str(Path(__file__).resolve().parents[1])
USER_STORAGE_ROOT = _user_storage_root()

# Componentes multimedia externos (FFmpeg, Deno, Poppler, Inkscape).
# Antes vivían en engine/bin; ahora quedan fuera del programa para poder
# actualizar, borrar o reinstalar sin tocar los archivos de la app.
COMPONENTS_DIR = os.environ.get(
    "MEDIA_ENGINE_COMPONENTS_DIR",
    os.environ.get("MEDIA_ENGINE_BIN_DIR", str(USER_STORAGE_ROOT / "Componentes")),
)
BIN_DIR = COMPONENTS_DIR  # Compatibilidad con módulos viejos que esperan BIN_DIR.
FFMPEG_BIN_DIR = os.path.join(COMPONENTS_DIR, "ffmpeg")
COMPONENT_DOWNLOADS_DIR = os.path.join(COMPONENTS_DIR, "_downloads")
COMPONENT_EXTRACT_DIR = os.path.join(COMPONENTS_DIR, "_extracting")

MODELS_DIR = os.environ.get("MEDIA_ENGINE_MODELS_DIR", str(USER_STORAGE_ROOT / "Modelos"))
REMBG_MODELS_DIR = os.path.join(MODELS_DIR, "rembg")
UPSCALING_DIR = os.path.join(MODELS_DIR, "upscaling")
MODEL_DOWNLOADS_DIR = os.path.join(MODELS_DIR, "_downloads")
MODEL_EXTRACT_DIR = os.path.join(MODELS_DIR, "_extracting")
CACHE_DIR = os.environ.get("MEDIA_ENGINE_CACHE_DIR", str(USER_STORAGE_ROOT / "Cache"))

# Evita que librerías de IA creen cachés/modelos sueltos en carpetas ocultas del usuario.
os.environ.setdefault("U2NET_HOME", REMBG_MODELS_DIR)
os.environ.setdefault("XDG_CACHE_HOME", CACHE_DIR)
os.environ.setdefault("HF_HOME", os.path.join(CACHE_DIR, "huggingface"))
os.environ.setdefault("TORCH_HOME", os.path.join(CACHE_DIR, "torch"))


_DLL_HANDLES: list[object] = []
_native_dir = os.environ.get("MEDIA_ENGINE_NATIVE_DIR")
if _native_dir and os.path.isdir(_native_dir):
    os.environ["PATH"] = _native_dir + os.pathsep + os.environ.get("PATH", "")
    if hasattr(os, "add_dll_directory"):
        _DLL_HANDLES.append(os.add_dll_directory(_native_dir))



def resolve_tool_executable(component_folder: str, executable_name: str, allow_system: bool = True) -> str:
    """Encuentra un ejecutable aunque el paquete se haya extraído con bin/ o carpeta raíz.

    Orden de búsqueda:
    1. Componentes externos en Documentos/ClipDock.
    2. Componentes antiguos dentro de engine/bin.
    3. PATH del sistema (solo si allow_system=True).
    4. Ruta esperada por defecto, para que los errores sigan siendo trazables.
    """
    exe = executable_name
    base_candidates = [
        Path(COMPONENTS_DIR) / component_folder,
        Path(PROJECT_ROOT) / "bin" / component_folder,
        Path(PROJECT_ROOT) / "engine" / "bin" / component_folder,
        Path(PROJECT_ROOT) / "engine" / "bin",
    ]
    candidates: list[Path] = []
    for base in base_candidates:
        candidates.extend([base / exe, base / "bin" / exe])
    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return str(candidate)
    for base in base_candidates[:3]:
        if base.exists():
            found = next(base.rglob(exe), None)
            if found and found.is_file():
                return str(found)
    if allow_system:
        system_path = shutil.which(exe)
        if system_path:
            return system_path
    return str(Path(COMPONENTS_DIR) / component_folder / exe)


def resolve_ffmpeg_executable(tool: str = "ffmpeg") -> str:
    # FFmpeg SIEMPRE es la copia propia de ClipDock (Documentos/ClipDock/Componentes/ffmpeg).
    # No se usa el FFmpeg del sistema: así la versión es la que ClipDock probó y
    # se puede actualizar/eliminar desde Ajustes -> Componentes sin sorpresas.
    exe = f"{tool}.exe" if os.name == "nt" else tool
    return resolve_tool_executable("ffmpeg", exe, allow_system=False)
