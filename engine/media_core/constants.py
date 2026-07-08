VIDEO_EXTENSIONS = {'mp4', 'mkv', 'webm', 'mov', 'flv', 'avi', 'gif'}
AUDIO_EXTENSIONS = {'m4a', 'mp3', 'ogg', 'opus', 'flac', 'wav'}
SINGLE_STREAM_AUDIO_CONTAINERS = {'.mp3', '.wav', '.flac', '.ac3'}

FORMAT_MUXER_MAP = {
    ".m4a": "mp4",
    ".wma": "asf"
}

LANG_CODE_MAP = {
    "es": "EspaÃ±ol",
    "es-419": "EspaÃ±ol (LatinoamÃ©rica)",
    "es-es": "EspaÃ±ol (EspaÃ±a)",
    "es_la": "EspaÃ±ol (LatinoamÃ©rica)", 
    "en": "InglÃ©s",
    "en-us": "InglÃ©s (EE.UU.)",
    "en-gb": "InglÃ©s (Reino Unido)",
    "en-orig": "InglÃ©s (Original)",
    "ja": "JaponÃ©s",
    "fr": "FrancÃ©s",
    "de": "AlemÃ¡n",
    "it": "Italiano",
    "pt": "PortuguÃ©s",
    "pt-br": "PortuguÃ©s (Brasil)",
    "pt-pt": "PortuguÃ©s (Portugal)",
    "ru": "Ruso",
    "zh": "Chino",
    "zh-cn": "Chino (Simplificado)",
    "zh-tw": "Chino (Tradicional)",
    "zh-hans": "Chino (Simplificado)", 
    "zh-hant": "Chino (Tradicional)", 
    "ko": "Coreano",
    "ar": "Ãrabe",
    "hi": "Hindi",
    "iw": "Hebreo (cÃ³digo antiguo)", 
    "he": "Hebreo",
    "fil": "Filipino", 
    "aa": "Afar",
    "ab": "Abjasio",
    "ae": "AvÃ©stico",
    "af": "AfrikÃ¡ans",
    "ak": "AkÃ¡n",
    "am": "AmÃ¡rico",
    "an": "AragonÃ©s",
    "as": "AsamÃ©s",
    "av": "Avar",
    "ay": "Aimara",
    "az": "AzerÃ­",
    "ba": "Baskir",
    "be": "Bielorruso",
    "bg": "BÃºlgaro",
    "bh": "Bhojpuri",
    "bho": "Bhojpuri", 
    "bi": "Bislama",
    "bm": "Bambara",
    "bn": "BengalÃ­",
    "bo": "Tibetano",
    "br": "BretÃ³n",
    "bs": "Bosnio",
    "ca": "CatalÃ¡n",
    "ce": "Checheno",
    "ceb": "Cebuano", 
    "ch": "Chamorro",
    "co": "Corso",
    "cr": "Cree",
    "cs": "Checo",
    "cu": "Eslavo eclesiÃ¡stico",
    "cv": "Chuvash",
    "cy": "GalÃ©s",
    "da": "DanÃ©s",
    "dv": "Divehi",
    "dz": "Dzongkha",
    "ee": "Ewe",
    "el": "Griego",
    "eo": "Esperanto",
    "et": "Estonio",
    "eu": "Euskera",
    "fa": "Persa",
    "ff": "Fula",
    "fi": "FinlandÃ©s",
    "fj": "Fiyiano",
    "fo": "FeroÃ©s",
    "fy": "FrisÃ³n occidental",
    "ga": "IrlandÃ©s",
    "gd": "GaÃ©lico escocÃ©s",
    "gl": "Gallego",
    "gn": "GuaranÃ­",
    "gu": "GuyaratÃ­",
    "gv": "ManÃ©s",
    "ha": "Hausa",
    "ht": "Haitiano",
    "hu": "HÃºngaro",
    "hy": "Armenio",
    "hz": "Herero",
    "ia": "Interlingua",
    "id": "Indonesio",
    "ie": "Interlingue",
    "ig": "Igbo",
    "ii": "Yi de SichuÃ¡n",
    "ik": "Inupiaq",
    "io": "Ido",
    "is": "IslandÃ©s",
    "iu": "Inuktitut",
    "jv": "JavanÃ©s",
    "ka": "Georgiano",
    "kg": "Kongo",
    "ki": "Kikuyu",
    "kj": "Kuanyama",
    "kk": "Kazajo",
    "kl": "GroenlandÃ©s",
    "km": "Jemer",
    "kn": "CanarÃ©s",
    "kr": "Kanuri",
    "ks": "Cachemiro",
    "ku": "Kurdo",
    "kv": "Komi",
    "kw": "CÃ³rnico",
    "ky": "KirguÃ­s",
    "la": "LatÃ­n",
    "lb": "LuxemburguÃ©s",
    "lg": "Ganda",
    "li": "LimburguÃ©s",
    "ln": "Lingala",
    "lo": "Lao",
    "lt": "Lituano",
    "lu": "Luba-katanga",
    "lv": "LetÃ³n",
    "mg": "Malgache",
    "mh": "MarshalÃ©s",
    "mi": "MaorÃ­",
    "mk": "Macedonio",
    "ml": "Malayalam",
    "mn": "Mongol",
    "mr": "MaratÃ­",
    "ms": "Malayo",
    "mt": "MaltÃ©s",
    "my": "Birmano",
    "na": "Nauruano",
    "nb": "Noruego bokmÃ¥l",
    "nd": "Ndebele del norte",
    "ne": "NepalÃ­",
    "ng": "Ndonga",
    "nl": "NeerlandÃ©s",
    "nn": "Noruego nynorsk",
    "no": "Noruego",
    "nr": "Ndebele del sur",
    "nv": "Navajo",
    "ny": "Chichewa",
    "oc": "Occitano",
    "oj": "Ojibwa",
    "om": "Oromo",
    "or": "Oriya",
    "os": "OsÃ©tico",
    "pa": "PanyabÃ­",
    "pi": "Pali",
    "pl": "Polaco",
    "ps": "PastÃºn",
    "qu": "Quechua",
    "rm": "Romanche",
    "rn": "Kirundi",
    "ro": "Rumano",
    "rw": "Kinyarwanda",
    "sa": "SÃ¡nscrito",
    "sc": "Sardo",
    "sd": "Sindhi",
    "se": "Sami septentrional",
    "sg": "Sango",
    "si": "CingalÃ©s",
    "sk": "Eslovaco",
    "sl": "Esloveno",
    "sm": "Samoano",
    "sn": "Shona",
    "so": "SomalÃ­",
    "sq": "AlbanÃ©s",
    "sr": "Serbio",
    "ss": "Suazi",
    "st": "Sesotho",
    "su": "SundanÃ©s",
    "sv": "Sueco",
    "sw": "Suajili",
    "ta": "Tamil",
    "te": "Telugu",
    "tg": "Tayiko",
    "th": "TailandÃ©s",
    "ti": "TigriÃ±a",
    "tk": "Turcomano",
    "tl": "Tagalo",
    "tn": "Setsuana",
    "to": "Tongano",
    "tr": "Turco",
    "ts": "Tsonga",
    "tt": "TÃ¡rtaro",
    "tw": "Twi",
    "ty": "Tahitiano",
    "ug": "Uigur",
    "uk": "Ucraniano",
    "ur": "Urdu",
    "uz": "Uzbeko",
    "ve": "Venda",
    "vi": "Vietnamita",
    "vo": "VolapÃ¼k",
    "wa": "ValÃ³n",
    "wo": "Wolof",
    "xh": "Xhosa",
    "yi": "Yidis",
    "yo": "Yoruba",
    "za": "Zhuang",
    "zu": "ZulÃº",
    "und": "No especificado",
    "alb-al": "AlbanÃ©s (Albania)",
    "ara-sa": "Ãrabe (Arabia Saudita)",
    "aze-az": "AzerÃ­ (AzerbaiyÃ¡n)",
    "ben-bd": "BengalÃ­ (Bangladesh)",
    "bul-bg": "BÃºlgaro (Bulgaria)",
    "cat-es": "CatalÃ¡n (EspaÃ±a)",
    "ces-cz": "Checo (RepÃºblica Checa)",
    "cmn-hans-cn": "Chino MandarÃ­n (Simplificado, China)",
    "cmn-hant-cn": "Chino MandarÃ­n (Tradicional, China)",
    "crs": "FrancÃ©s criollo seselwa",
    "dan-dk": "DanÃ©s (Dinamarca)",
    "deu-de": "AlemÃ¡n (Alemania)",
    "ell-gr": "Griego (Grecia)",
    "est-ee": "Estonio (Estonia)",
    "fil-ph": "Filipino (Filipinas)",
    "fin-fi": "FinlandÃ©s (Finlandia)",
    "fra-fr": "FrancÃ©s (Francia)",
    "gaa": "Ga",
    "gle-ie": "IrlandÃ©s (Irlanda)",
    "haw": "Hawaiano",
    "heb-il": "Hebreo (Israel)",
    "hin-in": "Hindi (India)",
    "hmn": "Hmong",
    "hrv-hr": "Croata (Croacia)",
    "hun-hu": "HÃºngaro (HungrÃ­a)",
    "ind-id": "Indonesio (Indonesia)",
    "isl-is": "IslandÃ©s (Islandia)",
    "ita-it": "Italiano (Italia)",
    "jav-id": "JavanÃ©s (Indonesia)",
    "jpn-jp": "JaponÃ©s (JapÃ³n)",
    "kaz-kz": "Kazajo (KazajistÃ¡n)",
    "kha": "Khasi",
    "khm-kh": "Jemer (Camboya)",
    "kor-kr": "Coreano (Corea del Sur)",
    "kri": "Krio",
    "lav-lv": "LetÃ³n (Letonia)",
    "lit-lt": "Lituano (Lituania)",
    "lua": "Luba-Lulua",
    "luo": "Luo",
    "mfe": "Morisyen",
    "msa-my": "Malayo (Malasia)",
    "mya-mm": "Birmano (Myanmar)",
    "new": "Newari",
    "nld-nl": "NeerlandÃ©s (PaÃ­ses Bajos)",
    "nob-no": "Noruego BokmÃ¥l (Noruega)",
    "nso": "Sotho del norte",
    "pam": "Pampanga",
    "pol-pl": "Polaco (Polonia)",
    "por-pt": "PortuguÃ©s (Portugal)",
    "ron-ro": "Rumano (Rumania)",
    "rus-ru": "Ruso (Rusia)",
    "slk-sk": "Eslovaco (Eslovaquia)",
    "slv-si": "Esloveno (Eslovenia)",
    "spa-es": "EspaÃ±ol (EspaÃ±a)",
    "swa-sw": "Suajili", 
    "swe-se": "Sueco (Suecia)",
    "tha-th": "TailandÃ©s (Tailandia)",
    "tum": "Tumbuka",
    "tur-tr": "Turco (TurquÃ­a)",
    "ukr-ua": "Ucraniano (Ucrania)",
    "urd-pk": "Urdu (PakistÃ¡n)",
    "uzb-uz": "Uzbeko (UzbekistÃ¡n)",
    "vie-vn": "Vietnamita (Vietnam)",
    "war": "Waray",
    "alb": "AlbanÃ©s",
    "ara": "Ãrabe",
    "aze": "AzerÃ­",
    "ben": "BengalÃ­",
    "bul": "BÃºlgaro",
    "cat": "CatalÃ¡n",
    "ces": "Checo",
    "cmn": "Chino MandarÃ­n",
    "dan": "DanÃ©s",
    "deu": "AlemÃ¡n",
    "ell": "Griego",
    "est": "Estonio",
    "fin": "FinlandÃ©s",
    "fra": "FrancÃ©s",
    "gle": "IrlandÃ©s",
    "heb": "Hebreo",
    "hin": "Hindi",
    "hrv": "Croata",
    "hun": "HÃºngaro",
    "ind": "Indonesio",
    "isl": "IslandÃ©s",
    "ita": "Italiano",
    "jav": "JavanÃ©s",
    "jpn": "JaponÃ©s",
    "kaz": "Kazajo",
    "khm": "Jemer",
    "kor": "Coreano",
    "lav": "LetÃ³n",
    "lit": "Lituano",
    "msa": "Malayo",
    "mya": "Birmano",
    "nld": "NeerlandÃ©s",
    "nob": "Noruego BokmÃ¥l",
    "pol": "Polaco",
    "por": "PortuguÃ©s",
    "ron": "Rumano",
    "rus": "Ruso",
    "slk": "Eslovaco",
    "slv": "Esloveno",
    "spa": "EspaÃ±ol",
    "swe": "Sueco",
    "swa": "Suajili",
    "tha": "TailandÃ©s",
    "tur": "Turco",
    "ukr": "Ucraniano",
    "urd": "Urdu",
    "uzb": "Uzbeko",
    "vie": "Vietnamita",
}

LANGUAGE_ORDER = {
    'es-419': 0,   # EspaÃ±ol LATAM
    'es-es': 1,    # EspaÃ±ol EspaÃ±a
    'es': 2,       # EspaÃ±ol general
    'en': 3,       # InglÃ©s
    'ja': 4,       # JaponÃ©s 
    'fr': 5,       # FrancÃ©s 
    'de': 6,       # AlemÃ¡n 
    'pt': 7,       # PortuguÃ©s
    'it': 8,       # Italiano
    'zh': 9,       # Chino
    'ko': 10,      # Coreano
    'ru': 11,      # Ruso
    'ar': 12,      # Ãrabe
    'hi': 13,      # Hindi
    'vi': 14,      # Vietnamita
    'th': 15,      # TailandÃ©s
    'pl': 16,      # Polaco
    'id': 17,      # Indonesio
    'tr': 18,      # Turco
    'bn': 19,      # BengalÃ­
    'ta': 20,      # Tamil
    'te': 21,      # Telugu
    'pa': 22,      # Punjabi
    'mr': 23,      # Marathi
    'ca': 24,      # CatalÃ¡n
    'gl': 25,      # Gallego
    'eu': 26,      # Euskera
    'und': 27,     # Indefinido
}

DEFAULT_PRIORITY = 99 

EDITOR_FRIENDLY_CRITERIA = {
    "compatible_vcodecs": [
        "h264", "avc1",  # H.264
        "hevc", "h265",  # H.265
        "prores",        # Apple ProRes
        "dnxhd", "dnxhr", # Avid DNxHD/HR
        "cfhd",          # GoPro CineForm
        "mpeg2video",    
        "dvvideo"        # Formato de cÃ¡maras MiniDV
    ],
    "compatible_acodecs": ["aac", "mp4a", "pcm_s16le", "pcm_s24le", "mp3", "ac3"],
    "compatible_exts": ["mp4", "mov", "mxf", "mts", "m2ts", "avi"],
}

COMPATIBILITY_RULES = {
    ".gif": {
        "video": ["gif"],  
        "audio": []       
    },
    ".mov": {
        "video": ["prores_aw", "prores_ks", "dnxhd", "cfhd", "qtrle", "hap", "h264_videotoolbox", "libx264"],
        "audio": ["pcm_s16le", "pcm_s24le", "alac"]
    },
    ".mp4": {
        "video": ["libx264", "libx265", "h264_nvenc", "hevc_nvenc", "h264_amf", "hevc_amf", "av1_nvenc", "av1_amf", "h264_qsv", "hevc_qsv", "av1_qsv", "vp9_qsv"],
        "audio": ["aac", "mp3", "ac3", "opus"]
    },
    ".mkv": {
        "video": ["libx264", "libx265", "libvpx", "libvpx-vp9", "libaom-av1", "h264_nvenc", "hevc_nvenc", "av1_nvenc"],
        "audio": ["aac", "mp3", "opus", "flac", "libvorbis", "ac3", "pcm_s16le"]
    },
    ".webm": { "video": ["libvpx", "libvpx-vp9", "libaom-av1"], "audio": ["libopus", "libvorbis"] },
    ".ogg": { "video": [], "audio": ["libvorbis", "libopus"] },
    ".ac3": { "video": [], "audio": ["ac3"] },
    ".wma": { "video": [], "audio": ["wmav2"] },
    ".mxf": { "video": ["mpeg2video", "dnxhd"], "audio": ["pcm_s16le", "pcm_s24le"] },
    ".flac": { "video": [], "audio": ["flac"] },
    ".mp3": { "video": [], "audio": ["libmp3lame"] },
    ".m4a": { "video": [], "audio": ["aac", "alac"] },
    ".opus": { "video": [], "audio": ["libopus"] },
    ".wav": { "video": [], "audio": ["pcm_s16le", "pcm_s24le"] }
}

# --- NUEVO: Definir formatos RAW ---
IMAGE_RAW_FORMATS = {".CR2", ".DNG", ".ARW", ".NEF", ".ORF", ".RW2", ".SR2", ".RAF", ".CR3", ".PEF"}
# --- CONSTANTES DE HERRAMIENTAS DE IMAGEN ---

# Actualizar los formatos de entrada permitidos sumando los RAW
IMAGE_INPUT_FORMATS = {".svg", ".eps", ".ai", ".pdf", ".ps", ".avif"}.union(IMAGE_RAW_FORMATS)
IMAGE_EXPORT_FORMATS = ["PNG", "JPG", "JPEG", "WEBP", "AVIF", "BMP", "PDF", "TIFF"]

# Agrupar formatos por tipo para mejor manejo en la lÃ³gica y la UI
IMAGE_RASTER_FORMATS = {"PNG", "JPG", "JPEG", "WEBP", "BMP", "TIFF", "AVIF"}
IMAGE_VECTOR_FORMATS = {"PDF"} 
FORMATS_WITH_TRANSPARENCY = {"PNG", "WEBP", "TIFF", "ICO", "PDF", "AVIF"}

# DPI por defecto para rasterizaciÃ³n (de PDF, SVG, etc.)
DEFAULT_RASTER_DPI = 300

# LÃ­mites de seguridad para escalado
MAX_RECOMMENDED_DPI = 600
MAX_SAFE_DIMENSION = 8192  # PÃ­xeles (8K)
CRITICAL_DPI_THRESHOLD = 1200
CRITICAL_DIMENSION_THRESHOLD = 16384  # 16K

# MÃ©todos de interpolaciÃ³n para escalado de raster
INTERPOLATION_METHODS = {
    "Lanczos (Mejor Calidad)": "LANCZOS",
    "BicÃºbico (RÃ¡pido)": "BICUBIC", 
    "Bilineal (Muy RÃ¡pido)": "BILINEAR",
    "Nearest (Pixelado)": "NEAREST"
}

# Opciones de Canvas
CANVAS_OPTIONS = [
    "Sin ajuste",
    "AÃ±adir Margen Externo",
    "AÃ±adir Margen Interno",
    "Instagram Post (1080Ã-1080)",
    "Instagram Story (1080Ã-1920)",
    "YouTube Thumbnail (1280Ã-720)",
    "Twitter Header (1500Ã-500)",
    "Facebook Cover (820Ã-312)",
    "Personalizado..."
]

# Mapeo de presets fijos
CANVAS_PRESET_SIZES = {
    "Instagram Post (1080Ã-1080)": (1080, 1080),
    "Instagram Story (1080Ã-1920)": (1080, 1920),
    "YouTube Thumbnail (1280Ã-720)": (1280, 720),
    "Twitter Header (1500Ã-500)": (1500, 500),
    "Facebook Cover (820Ã-312)": (820, 312)
}

# Posiciones para el contenido en el canvas
CANVAS_POSITIONS = [
    "Centro",
    "Arriba Izquierda",
    "Arriba Centro",
    "Arriba Derecha",
    "Centro Izquierda",
    "Centro Derecha",
    "Abajo Izquierda",
    "Abajo Centro",
    "Abajo Derecha"
]

# Modos de manejo cuando la imagen excede el canvas
CANVAS_OVERFLOW_MODES = [
    "Reducir hasta que quepa",           
    "Centrar (puede recortar)",
    "Recortar al canvas",
    "Advertir y no procesar"
]

# Opciones de cambio de fondo
BACKGROUND_TYPES = [
    "Color SÃ³lido",
    "Degradado",
    "Imagen de Fondo"
]

GRADIENT_DIRECTIONS = [
    "Horizontal (Izq -> Der)",
    "Vertical (Arr -> Aba)",
    "Diagonal (â†˜)",
    "Diagonal (â†™)",
    "Radial (Centro)"
]

# Formatos que soportan transparencia
FORMATS_WITH_TRANSPARENCY = {"PNG", "WEBP", "TIFF", "ICO", "PDF"}

REMBG_MODEL_FAMILIES = {
    "Rembg Standard (U2Net)": {
        "isnet-general-use (Recomendado)": {
            "file": "isnet-general-use.onnx",
            "folder": "rembg" 
        },
        "u2netp (RÃ¡pido)": {
            "file": "u2netp.onnx",
            "folder": "rembg"
        },
        "u2net (Alta PrecisiÃ³n)": {
            "file": "u2net.onnx",
            "folder": "rembg"
        },
        "u2net_human_seg (Humanos)": {
            "file": "u2net_human_seg.onnx",
            "folder": "rembg"
        },
        "isnet-anime (Anime)": {
            "file": "isnet-anime.onnx",
            "folder": "rembg"
        }
    },
    "BiRefNet (Next-Gen 2024)": {
        # --- MODELOS GENERALES ---
        "General (EstÃ¡ndar)": {
            "file": "birefnet-general.onnx",  # OK Nombre que rembg espera
            "folder": "rembg"
        },
        "General Lite (RÃ¡pido)": {
            "file": "birefnet-general-lite.onnx",  # OK Cambiado
            "folder": "rembg"
        },
        
        # --- ESPECIALIZADOS ---
        "Portrait (Retratos)": {
            "file": "birefnet-portrait.onnx",  # OK Cambiado
            "folder": "rembg"
        },
        "DIS (Bordes Finos/Complejo)": {
            "file": "birefnet-dis.onnx",  # OK Cambiado
            "folder": "rembg"
        },
        "COD (Objetos Camuflados)": {
            "file": "birefnet-cod.onnx",  # OK Cambiado
            "folder": "rembg"
        },
        "HRSOD (Alta DetecciÃ³n)": {
            "file": "birefnet-hrsod.onnx",  # OK Cambiado
            "folder": "rembg"
        },
        
        # --- ALTA RESOLUCIÃ“N (HR) & MASIVOS ---
        "Massive (Entrenamiento Masivo)": {
            "file": "birefnet-massive.onnx",  # OK Cambiado
            "folder": "rembg"
        },
        "HR General (4K/8K)": {
            "file": "birefnet-hr-general.onnx",  # OK Cambiado
            "folder": "rembg"
        },
        "HR Matting (Recorte Ultra Fino)": {
            "file": "birefnet-hr-matting.onnx",  # OK Cambiado
            "folder": "rembg"
        }
    },

    # --- NUEVO BLOQUE: RMBG 2.0 (Descarga Manual) ---
    "RMBG 2.0 (BriaAI)": {
        "Standard (AutomÃ¡tico - 977 MB)": {
            "file": "rmbg2_gatis.onnx", 
            "folder": "rmbg2"
        },
        "Standard (1.02 GB)": {
            "file": "model.onnx", 
            "folder": "rmbg2" 
        },
        "BnB4 (Recomendado - 355 MB)": {
            "file": "model_bnb4.onnx",
            "folder": "rmbg2"
        },
        "FP16 (Media - 514 MB)": {
            "file": "model_fp16.onnx",
            "folder": "rmbg2"
        },
        "Int8 (RÃ¡pido - 366 MB)": {
            "file": "model_int8.onnx",
            "folder": "rmbg2"
        },
        "Quantized (366 MB)": {
            "file": "model_quantized.onnx",
            "folder": "rmbg2"
        }
    }
}

UPSCALING_TOOLS = {
    "Real-ESRGAN": {
        "name": "Real-ESRGAN",
        "folder": "realesrgan",
        "exe": "realesrgan-ncnn-vulkan.exe",
    },
    "Waifu2x": {
        "name": "Waifu2x",
        "folder": "waifu2x",
        "exe": "waifu2x-ncnn-vulkan.exe",
    },
    "RealSR": {
        "name": "RealSR",
        "folder": "realsr",
        "exe": "realsr-ncnn-vulkan.exe",
    },
    "SRMD": {
        "name": "SRMD",
        "folder": "srmd",
        "exe": "srmd-ncnn-vulkan.exe",
    }
}

# --- CONSTANTES DE REESCALADO (IA) ---

# Definimos el modelo interno y las escalas permitidas para cada opciÃ³n
REALESRGAN_MODELS = {
    "Anime Video v3 (RÃ¡pido, Multi-escala)": {
        "model": "realesr-animevideov3",
        "scales": ["2x", "3x", "4x"]
    },
    "x4 Plus (Fotos / General)": {
        "model": "realesrgan-x4plus",
        "scales": ["4x"]  # Solo nativo 4x
    },
    "x4 Plus Anime (Ilustraciones)": {
        "model": "realesrgan-x4plus-anime",
        "scales": ["4x"]  # Solo nativo 4x
    },
}

WAIFU2X_MODELS = {
    "CU-Net (Alta Calidad)": {
        "model": "models-cunet",
        "scales": ["1x", "2x", "4x", "8x", "16x", "32x"]
    },
    "Anime Style Art (ClÃ¡sico)": {
        "model": "models-upconv_7_anime_style_art_rgb",
        "scales": ["1x", "2x", "4x", "8x", "16x", "32x"]
    },
    "Photo (Fotos Reales)": {
        "model": "models-upconv_7_photo",
        "scales": ["1x", "2x", "4x", "8x", "16x", "32x"]
    },
}

REALSR_MODELS = {
    "EstÃ¡ndar (DF2K)": {
        "model": "models-DF2K",
        "scales": ["4x"]
    },
    "Reparar JPEG (DF2K_JPEG)": {
        "model": "models-DF2K_JPEG",
        "scales": ["4x"]
    }
}

SRMD_MODELS = {
    "EstÃ¡ndar (General)": {
        "model": "models-srmd",
        "scales": ["2x", "3x", "4x"]
    }
}
