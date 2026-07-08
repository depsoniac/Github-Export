import yt_dlp
from .exceptions import UserCancelledError, PlaylistDownloadError
import threading 
import os
import sys
from .paths import BIN_DIR, resolve_ffmpeg_executable, resolve_tool_executable

def get_deno_path():
    """Obtiene la ruta absoluta del ejecutable de Deno, si existe."""
    deno_executable = 'deno.exe' if sys.platform == 'win32' else 'deno'
    return resolve_tool_executable('deno', deno_executable)


def _deno_ready():
    deno_path = get_deno_path()
    return deno_path if os.path.exists(deno_path) else None


def _is_youtube_url(url):
    return 'youtube.com' in str(url).lower() or 'youtu.be' in str(url).lower()


def apply_js_runtime(ydl_opts):
    """Conecta Deno y el resolvedor EJS sin forzar un cliente de YouTube."""
    ydl_opts = dict(ydl_opts)
    deno_path = _deno_ready()
    if not deno_path:
        return ydl_opts
    ydl_opts['js_runtimes'] = {'deno': {'path': deno_path}}
    ydl_opts['remote_components'] = ['ejs:github']
    return ydl_opts


def apply_yt_patch(ydl_opts):
    """Parche DowP para YouTube, pero solo cuando Deno existe.

    En DowP el parche tv+web+n_client se aplica únicamente si Deno está disponible.
    ClipDock antes forzaba esos clientes aunque Deno no existiera; eso podía hacer que
    YouTube rechazara una sesión que en realidad sí estaba bien exportada.
    """
    ydl_opts = dict(ydl_opts)
    deno_path = _deno_ready()
    if not deno_path:
        print('ADVERTENCIA Deno no encontrado. Usando cookies.txt directo, sin parche tv/web.')
        return ydl_opts

    ydl_opts = apply_js_runtime(ydl_opts)
    extractor_args = dict(ydl_opts.get('extractor_args') or {})
    extractor_args['youtube'] = {
        'player_client': ['tv', 'web'],
        'n_client': ['tv'],
    }
    ydl_opts['extractor_args'] = extractor_args
    print(f'OK Parche YouTube + cookies aplicado. Deno: {deno_path}')
    return ydl_opts


def _with_youtube_args(ydl_opts, youtube_args):
    opts = dict(ydl_opts)
    extractor_args = dict(opts.get('extractor_args') or {})
    extractor_args['youtube'] = dict(youtube_args)
    opts['extractor_args'] = extractor_args
    return opts


def youtube_cookie_strategy_options(base_opts):
    """Genera intentos robustos para cookies.txt.

    Orden:
    1) Directo como DowP cuando no tiene Deno.
    2) Clientes web/mweb sin resolver externo.
    3) Parche DowP con Deno, si está instalado.
    4) Clientes móviles como último recurso.
    """
    strategies = []
    direct = dict(base_opts)
    direct.pop('extractor_args', None)
    direct.pop('js_runtimes', None)
    direct.pop('remote_components', None)
    strategies.append(('cookies.txt directo', direct))

    strategies.append(('YouTube web', _with_youtube_args(direct, {'player_client': ['web']})))
    strategies.append(('YouTube mweb + web', _with_youtube_args(direct, {'player_client': ['mweb', 'web']})))

    if _deno_ready():
        strategies.append(('DowP avanzado tv/web + Deno', apply_yt_patch(direct)))

    strategies.append(('YouTube móvil', _with_youtube_args(direct, {'player_client': ['android', 'ios']})))

    seen = set()
    unique = []
    for name, opts in strategies:
        key = repr(opts.get('extractor_args')) + repr(opts.get('js_runtimes')) + repr(opts.get('remote_components'))
        if key in seen:
            continue
        seen.add(key)
        unique.append((name, opts))
    return unique


def youtube_access_strategy_options(base_opts):
    """Flujo DowP afinado: público primero, Deno después y cookies solo si hacen falta."""
    public = dict(base_opts)
    public.pop('cookiefile', None)
    public.pop('cookiesfrombrowser', None)
    public.pop('extractor_args', None)
    public.pop('js_runtimes', None)
    public.pop('remote_components', None)
    strategies = [('acceso público directo', public)]
    if _deno_ready():
        strategies.append(('acceso público + Deno', apply_js_runtime(public)))
    if 'cookiefile' in base_opts or 'cookiesfrombrowser' in base_opts:
        strategies.extend(youtube_cookie_strategy_options(base_opts))
    return strategies


def _cookie_session_error_message(errors):
    compact = []
    for name, error in errors[-4:]:
        compact.append(f'{name}: {error}')
    return ' | '.join(compact) or 'YouTube rechazó la sesión.'

def get_video_info(url, cookie_opts=None):
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'socket_timeout': 30,
        'timeout': 30,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'referer': url,
        'noplaylist': True,
        'playlist_items': '1',
    }

    use_cookies = False
    if cookie_opts:
        if cookie_opts.get('cookiefile'):
            ydl_opts['cookiefile'] = cookie_opts['cookiefile']
            use_cookies = True
        elif cookie_opts.get('cookiesfrombrowser'):
            ydl_opts['cookiesfrombrowser'] = cookie_opts['cookiesfrombrowser']
            use_cookies = True

    strategies = [('normal', ydl_opts)]
    if _is_youtube_url(url):
        strategies = youtube_access_strategy_options(ydl_opts)
        print(f"Modo YouTube: {len(strategies)} estrategias · cookies {'disponibles' if use_cookies else 'no requeridas'}")
    elif use_cookies:
        print('Modo: Con cookies.txt')
    else:
        print('Modo: Sin cookies')

    errors = []
    for strategy_name, opts in strategies:
        try:
            print(f'Analizando con estrategia: {strategy_name}')
            with yt_dlp.YoutubeDL(opts) as ydl:
                info_dict = ydl.extract_info(url, download=False)
            if info_dict:
                info_dict = apply_site_specific_rules(info_dict)
                info_dict['_clipdock_cookie_strategy'] = strategy_name
            return info_dict
        except Exception as e:
            errors.append((strategy_name, str(e)))
            print(f"ERROR estrategia {strategy_name}: {e}")
            continue

    raise RuntimeError(f"El motor de descarga no pudo analizar el enlace. {_cookie_session_error_message(errors)}")


_MEDIA_EXTENSIONS = {
    '.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v', '.flv', '.ts', '.m2ts', '.mpg', '.mpeg', '.wmv',
    '.mp3', '.m4a', '.aac', '.opus', '.ogg', '.wav', '.flac', '.wma', '.ac3'
}
_SIDECAR_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.srt', '.vtt', '.ass', '.json3', '.srv1', '.srv2', '.srv3', '.ttml', '.description', '.info.json'}


def _existing_path(value):
    if not value:
        return None
    try:
        path = os.path.abspath(os.path.expanduser(str(value)))
        return path if os.path.exists(path) else None
    except Exception:
        return None


def _choose_downloaded_media(info_dict):
    """Elige el archivo multimedia principal y evita devolver miniaturas/subtítulos."""
    candidates = []

    def add(value):
        path = _existing_path(value)
        if path and path not in candidates:
            candidates.append(path)

    add(info_dict.get('filepath'))
    add(info_dict.get('_filename'))
    add(info_dict.get('filename'))
    requested_downloads = info_dict.get('requested_downloads')
    if isinstance(requested_downloads, dict):
        requested_downloads = [requested_downloads]
    elif not isinstance(requested_downloads, (list, tuple)):
        requested_downloads = []
    for entry in requested_downloads:
        if isinstance(entry, dict):
            add(entry.get('filepath'))
            add(entry.get('_filename'))
            add(entry.get('filename'))

    def is_media(path):
        lower = path.lower()
        suffix = os.path.splitext(lower)[1]
        return suffix in _MEDIA_EXTENSIONS and not any(lower.endswith(ext) for ext in _SIDECAR_EXTENSIONS)

    media = [path for path in candidates if is_media(path)]
    if media:
        return max(media, key=lambda path: os.path.getsize(path) if os.path.exists(path) else 0)
    non_sidecar = [path for path in candidates if os.path.splitext(path.lower())[1] not in _SIDECAR_EXTENSIONS]
    if non_sidecar:
        return max(non_sidecar, key=lambda path: os.path.getsize(path) if os.path.exists(path) else 0)
    return candidates[0] if candidates else None

def download_media(url, ydl_opts, progress_callback, cancellation_event: threading.Event):
    """
    Descarga y procesa el medio. Para YouTube + cookies.txt usa varios intentos,
    empezando por el método directo de DowP y solo aplicando el parche Deno si existe.
    """
    base_opts = dict(ydl_opts)
    use_cookies = 'cookiefile' in base_opts or 'cookiesfrombrowser' in base_opts

    ffmpeg_path = resolve_ffmpeg_executable('ffmpeg')
    if os.path.exists(ffmpeg_path):
        base_opts.setdefault('ffmpeg_location', os.path.dirname(ffmpeg_path))

    base_opts.setdefault('user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')
    base_opts.setdefault('referer', url)
    base_opts.setdefault('playlist_items', '1')
    base_opts.setdefault('downloader', 'native')
    if 'outtmpl' in base_opts:
        base_opts['restrictfilenames'] = True

    strategies = [('normal', base_opts)]
    if _is_youtube_url(url):
        strategies = youtube_access_strategy_options(base_opts)
        print(f"Descarga YouTube: {len(strategies)} estrategias · cookies {'disponibles' if use_cookies else 'no requeridas'}")
    elif use_cookies:
        print('Descarga: Con cookies.txt')
    else:
        print('Descarga: Sin cookies')

    errors = []
    last_exception = None

    for strategy_name, strategy_opts in strategies:
        fragment_started = False
        opts = dict(strategy_opts)
        is_fragment = 'download_ranges' in opts

        def hook(d):
            nonlocal fragment_started
            if cancellation_event.is_set():
                print('DEBUG: Evento de cancelación detectado en el hook de yt-dlp.')
                raise UserCancelledError('Descarga cancelada por el usuario.')

            status = d.get('status', 'N/A')
            if status == 'downloading':
                fragment_started = True
                total_bytes = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
                downloaded_bytes = d.get('downloaded_bytes', 0)
                if total_bytes > 0:
                    percentage = (downloaded_bytes / total_bytes) * 100
                    speed = d.get('speed')
                    if speed:
                        speed_mb = speed / 1024 / 1024
                        speed_str = f'{speed_mb:.1f} MB/s' if speed_mb >= 1.0 else f'{speed / 1024:.0f} KB/s'
                    else:
                        speed_str = 'N/A'
                    download_type = 'fragmento' if is_fragment else 'archivo'
                    progress_callback(percentage, f'Descargando {download_type}... {percentage:.1f}% a {speed_str}')
                elif is_fragment:
                    elapsed = d.get('elapsed', 0)
                    progress_callback(-1, f'Descargando fragmento... {elapsed:.0f}s transcurridos')
            elif status == 'finished':
                if is_fragment:
                    progress_callback(-1, 'Fragmento descargado. Procesando con FFmpeg...')
                else:
                    progress_callback(95, 'Descarga completada. Fusionando archivos si es necesario...')
            elif status == 'error':
                raise yt_dlp.utils.DownloadError('yt-dlp reportó un error durante la descarga.')

        opts['progress_hooks'] = [hook]

        try:
            if cancellation_event.is_set():
                raise UserCancelledError('Descarga cancelada por el usuario antes de iniciar.')
            if is_fragment:
                progress_callback(-1, 'Descargando fragmento, esto puede tardar...')
            if len(strategies) > 1:
                progress_callback(0, f'Probando acceso YouTube: {strategy_name}')
                print(f'Descargando con estrategia: {strategy_name}')

            with yt_dlp.YoutubeDL(opts) as ydl:
                info_dict = ydl.extract_info(url, download=True)

            if is_fragment and not fragment_started:
                progress_callback(-1, 'Fragmento extraído. Finalizando...')

            final_filepath = _choose_downloaded_media(info_dict)
            if not final_filepath:
                raise PlaylistDownloadError('No se pudo determinar la ruta del archivo multimedia descargado después del proceso.')

            progress_callback(100, 'Descarga completada exitosamente')
            return final_filepath

        except UserCancelledError as e:
            print(f'DEBUG: Operación de descarga interrumpida: {e}')
            raise e
        except Exception as e:
            if cancellation_event.is_set():
                print(f'DEBUG: Cancelación confirmada durante estrategia {strategy_name}: {e}')
                raise UserCancelledError('Descarga cancelada por el usuario.') from e
            last_exception = e
            errors.append((strategy_name, str(e)))
            print(f'Error estrategia {strategy_name}: {e}')
            if not (_is_youtube_url(url) and len(strategies) > 1):
                raise e
            continue

    if last_exception:
        raise RuntimeError(f'No se pudo descargar el enlace. {_cookie_session_error_message(errors)}') from last_exception
    raise RuntimeError('No se pudo descargar el medio.')

# =========================================================
# ðŸ†• SECCIÃ“N DE REGLAS ESPECÃFICAS POR SITIO
# =========================================================

def apply_site_specific_rules(info):
    """
    Normaliza metadatos de sitios problemÃ¡ticos antes de que la UI los procese.
    """
    if not info:
        return info

    extractor = info.get('extractor_key', '').lower()
    url = info.get('webpage_url', '').lower()
    
    # Filtro Estricto para Clips de Twitch
    is_twitch_clip = 'clips' in extractor or '/clip/' in url
    
    if is_twitch_clip:
        print(f"DEBUG: [Twitch] Aplicando parche de compatibilidad para Twitch CLIP ({extractor})")
        info = _fix_twitch_clip_formats(info)

    return info

def _fix_twitch_clip_formats(info):
    """
    Asigna cÃ³decs falsos (h264/aac) si faltan, para que la UI habilite los menÃºs.
    """
    formats = info.get('formats', [])
    
    for f in formats:
        # OK CORRECCIÃ“N: Detectar explÃ­citamente None, 'none' y 'unknown'
        vcodec = f.get('vcodec')
        acodec = f.get('acodec')

        # Si el video es desconocido o nulo -> Forzar H.264
        if not vcodec or vcodec == 'none' or vcodec == 'unknown':
            f['vcodec'] = 'h264'
        
        # Si el audio es desconocido o nulo -> Forzar AAC
        if not acodec or acodec == 'none' or acodec == 'unknown':
            f['acodec'] = 'aac'
            
        # Asegurar contenedor MP4
        if not f.get('ext') or f.get('ext') == 'unknown':
            f['ext'] = 'mp4'

    return info
