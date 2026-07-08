import json
import tempfile
import subprocess
import threading
import os
import re
import sys
import time
from .exceptions import UserCancelledError
from media_core.paths import FFMPEG_BIN_DIR, resolve_ffmpeg_executable

CODEC_PROFILES = {
    "Video": {
        "H.264 (x264)": {
            "libx264": {
                "Alta Calidad (CRF 18)": ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p'],
                "Calidad Media (CRF 23)": ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p'],
                "Calidad RÃ¡pida (CRF 28)": ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p'],
                "Bitrate Personalizado (VBR)": "CUSTOM_BITRATE_VBR",
                "Bitrate Personalizado (CBR)": "CUSTOM_BITRATE_CBR"
            }, "container": ".mp4"
        },
        "H.265 (x265)": {
            "libx265": {
                "Calidad Alta (CRF 20)": ['-c:v', 'libx265', '-preset', 'slow', '-crf', '20', '-tag:v', 'hvc1'],
                "Calidad Media (CRF 24)": ['-c:v', 'libx265', '-preset', 'medium', '-crf', '24', '-tag:v', 'hvc1'],
                "Bitrate Personalizado (VBR)": "CUSTOM_BITRATE_VBR",
                "Bitrate Personalizado (CBR)": "CUSTOM_BITRATE_CBR"
            }, "container": ".mp4"
        },
        "Apple ProRes (prores_aw) (Velocidad)": {
            "prores_aw": {
                "422 Proxy":    ['-c:v', 'prores_aw', '-profile:v', '0', '-pix_fmt', 'yuv422p10le', '-threads', '0'],
                "422 LT":       ['-c:v', 'prores_aw', '-profile:v', '1', '-pix_fmt', 'yuv422p10le', '-threads', '0'],
                "422 Standard": ['-c:v', 'prores_aw', '-profile:v', '2', '-pix_fmt', 'yuv422p10le', '-threads', '0'],
                "422 HQ":       ['-c:v', 'prores_aw', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-threads', '0'],
                "4444":         ['-c:v', 'prores_aw', '-profile:v', '4', '-pix_fmt', 'yuv444p10le', '-threads', '0'],
                "4444 XQ":      ['-c:v', 'prores_aw', '-profile:v', '5', '-pix_fmt', 'yuv444p10le', '-threads', '0']
            }, "container": ".mov"
        },
        "Apple ProRes (prores_ks) (PrecisiÃ³n)": {
            "prores_ks": {
                "422 Proxy":    ['-c:v', 'prores_ks', '-profile:v', '0', '-pix_fmt', 'yuv422p10le', '-threads', '0'],
                "422 LT":       ['-c:v', 'prores_ks', '-profile:v', '1', '-pix_fmt', 'yuv422p10le', '-threads', '0'],
                "422 Standard": ['-c:v', 'prores_ks', '-profile:v', '2', '-pix_fmt', 'yuv422p10le', '-threads', '0'],
                "422 HQ":       ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-threads', '0'],
                "4444":         ['-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuv444p10le', '-threads', '0'],
                "4444 XQ":      ['-c:v', 'prores_ks', '-profile:v', '5', '-pix_fmt', 'yuv444p10le', '-threads', '0']
            }, "container": ".mov"
        },
        "DNxHD (dnxhd)": {
            "dnxhd": {
                "1080p25 (145 Mbps)":     ['-c:v', 'dnxhd', '-b:v', '145M', '-pix_fmt', 'yuv422p'],
                "1080p29.97 (145 Mbps)":  ['-c:v', 'dnxhd', '-b:v', '145M', '-pix_fmt', 'yuv422p'],
                "1080i50 (120 Mbps)":     ['-c:v', 'dnxhd', '-b:v', '120M', '-pix_fmt', 'yuv422p', '-flags', '+ildct+ilme', '-top', '1'],
                "1080i59.94 (120 Mbps)":  ['-c:v', 'dnxhd', '-b:v', '120M', '-pix_fmt', 'yuv422p', '-flags', '+ildct+ilme', '-top', '1'],
                "720p50 (90 Mbps)":       ['-c:v', 'dnxhd', '-b:v', '90M', '-pix_fmt', 'yuv422p'],
                "720p59.94 (90 Mbps)":    ['-c:v', 'dnxhd', '-b:v', '90M', '-pix_fmt', 'yuv422p']
            }, "container": ".mov"
        },
        "DNxHR (dnxhd)": {
            "dnxhd": {
                "LB (8-bit 4:2:2)":    ['-c:v', 'dnxhd', '-profile:v', 'dnxhr_lb', '-pix_fmt', 'yuv422p'],
                "SQ (8-bit 4:2:2)":    ['-c:v', 'dnxhd', '-profile:v', 'dnxhr_sq', '-pix_fmt', 'yuv422p'],
                "HQ (8-bit 4:2:2)":    ['-c:v', 'dnxhd', '-profile:v', 'dnxhr_hq', '-pix_fmt', 'yuv422p'],
                "HQX (10-bit 4:2:2)":  ['-c:v', 'dnxhd', '-profile:v', 'dnxhr_hqx', '-pix_fmt', 'yuv422p10le'],
                "444 (10-bit 4:4:4)":  ['-c:v', 'dnxhd', '-profile:v', 'dnxhr_444', '-pix_fmt', 'yuv444p10le']
            }, "container": ".mov"
        },
        "VP8 (libvpx)": {
             "libvpx": {
                "Calidad Alta (CRF 10)": ['-c:v', 'libvpx', '-crf', '10', '-b:v', '0'],
                "Calidad Media (CRF 20)": ['-c:v', 'libvpx', '-crf', '20', '-b:v', '0'],
                "Bitrate Personalizado (VBR)": "CUSTOM_BITRATE_VBR"
             }, "container": ".webm"
        },
        "VP9 (libvpx-vp9)": {
            "libvpx-vp9": {
                "Calidad Alta (CRF 28)": ['-c:v', 'libvpx-vp9', '-crf', '28', '-b:v', '0'],
                "Calidad Media (CRF 33)": ['-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0'],
                "Bitrate Personalizado (VBR)": "CUSTOM_BITRATE_VBR"
            }, "container": ".webm"
        },
        "AV1 (libaom-av1)": {
            "libaom-av1": {
                "Calidad Alta (CRF 28)": ['-c:v', 'libaom-av1', '-strict', 'experimental', '-cpu-used', '4', '-crf', '28'],
                "Calidad Media (CRF 35)": ['-c:v', 'libaom-av1', '-strict', 'experimental', '-cpu-used', '6', '-crf', '35'],
                "Bitrate Personalizado (VBR)": "CUSTOM_BITRATE_VBR"
            }, "container": ".mkv"
        },
        "H.264 (NVIDIA NVENC)": {
            "h264_nvenc": {
                # AÃ‘ADIDO: '-pix_fmt', 'yuv420p' al final de las listas
                "Calidad Alta (CQP 18)": ['-c:v', 'h264_nvenc', '-preset', 'p7', '-rc', 'vbr', '-cq', '18', '-pix_fmt', 'yuv420p'],
                "Calidad Media (CQP 23)": ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '23', '-pix_fmt', 'yuv420p'],
                "Bitrate Personalizado (VBR)": "CUSTOM_BITRATE_VBR",
                "Bitrate Personalizado (CBR)": "CUSTOM_BITRATE_CBR"
            }, "container": ".mp4"
        },
        "H.265/HEVC (NVIDIA NVENC)": {
            "hevc_nvenc": {
                "Calidad Alta (CQP 20)": ['-c:v', 'hevc_nvenc', '-preset', 'p7', '-rc', 'vbr', '-cq', '20', '-pix_fmt', 'yuv420p'],
                "Calidad Media (CQP 24)": ['-c:v', 'hevc_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '24', '-pix_fmt', 'yuv420p'],
                "Bitrate Personalizado (VBR)": "CUSTOM_BITRATE_VBR",
                "Bitrate Personalizado (CBR)": "CUSTOM_BITRATE_CBR"
            }, "container": ".mp4"
        },
        "AV1 (NVENC)": {
            "av1_nvenc": {
                "Calidad Alta (CQP 24)": ['-c:v', 'av1_nvenc', '-preset', 'p7', '-rc', 'vbr', '-cq', '24'],
                "Calidad Media (CQP 28)": ['-c:v', 'av1_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '28'],
                "Bitrate Personalizado (VBR)": "CUSTOM_BITRATE_VBR",
                "Bitrate Personalizado (CBR)": "CUSTOM_BITRATE_CBR"
            }, "container": ".mp4"
        },
        "H.264 (AMD AMF)": {
            "h264_amf": {
                # AÃ‘ADIDO: '-pix_fmt', 'yuv420p'
                "Alta Calidad": ['-c:v', 'h264_amf', '-quality', 'quality', '-rc', 'cqp', '-qp_i', '18', '-qp_p', '18', '-pix_fmt', 'yuv420p'],
                "Calidad Balanceada": ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', '23', '-qp_p', '23', '-pix_fmt', 'yuv420p'],
                "Bitrate Personalizado (VBR)": "CUSTOM_BITRATE_VBR",
                "Bitrate Personalizado (CBR)": "CUSTOM_BITRATE_CBR"
            }, "container": ".mp4"
        },
        "H.265/HEVC (Intel QSV)": {
            "hevc_qsv": {
                "Alta Calidad": ['-c:v', 'hevc_qsv', '-preset', 'veryslow', '-global_quality', '20', '-pix_fmt', 'yuv420p'],
                "Calidad Media": ['-c:v', 'hevc_qsv', '-preset', 'medium', '-global_quality', '24', '-pix_fmt', 'yuv420p'],
                "Bitrate Personalizado (VBR)": "CUSTOM_BITRATE_VBR",
                "Bitrate Personalizado (CBR)": "CUSTOM_BITRATE_CBR"
            }, "container": ".mp4"
        },
        "AV1 (AMF)": {
            "av1_amf": {
                "Alta Calidad": ['-c:v', 'av1_amf', '-quality', 'quality', '-rc', 'cqp', '-qp_i', '28', '-qp_p', '28'],
                "Calidad Balanceada": ['-c:v', 'av1_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', '32', '-qp_p', '32'],
                "Bitrate Personalizado (VBR)": "CUSTOM_BITRATE_VBR",
                "Bitrate Personalizado (CBR)": "CUSTOM_BITRATE_CBR"
            }, "container": ".mp4"
        },
        "H.264 (Intel QSV)": {
            "h264_qsv": {
                # AÃ‘ADIDO: '-pix_fmt', 'yuv420p'
                "Alta Calidad": ['-c:v', 'h264_qsv', '-preset', 'veryslow', '-global_quality', '18', '-pix_fmt', 'yuv420p'],
                "Calidad Media": ['-c:v', 'h264_qsv', '-preset', 'medium', '-global_quality', '23', '-pix_fmt', 'yuv420p'],
                "Bitrate Personalizado (VBR)": "CUSTOM_BITRATE_VBR",
                "Bitrate Personalizado (CBR)": "CUSTOM_BITRATE_CBR"
            }, "container": ".mp4"
        },
        "H.265/HEVC (Intel QSV)": {
            "hevc_qsv": {
                "Alta Calidad": ['-c:v', 'hevc_qsv', '-preset', 'veryslow', '-global_quality', '20'],
                "Calidad Media": ['-c:v', 'hevc_qsv', '-preset', 'medium', '-global_quality', '24'],
                "Bitrate Personalizado (VBR)": "CUSTOM_BITRATE_VBR",
                "Bitrate Personalizado (CBR)": "CUSTOM_BITRATE_CBR"
            }, "container": ".mp4"
        },
        "AV1 (QSV)": {
            "av1_qsv": {
                "Calidad Alta": ['-c:v', 'av1_qsv', '-global_quality', '25', '-preset', 'slow'],
                "Calidad Media": ['-c:v', 'av1_qsv', '-global_quality', '30', '-preset', 'medium'],
                "Bitrate Personalizado (VBR)": "CUSTOM_BITRATE_VBR",
                "Bitrate Personalizado (CBR)": "CUSTOM_BITRATE_CBR"
            }, "container": ".mp4"
        },
        "VP9 (QSV)": {
            "vp9_qsv": {
                "Calidad Alta": ['-c:v', 'vp9_qsv', '-global_quality', '25', '-preset', 'slow'],
                "Calidad Media": ['-c:v', 'vp9_qsv', '-global_quality', '30', '-preset', 'medium'],
                "Bitrate Personalizado (VBR)": "CUSTOM_BITRATE_VBR",
                "Bitrate Personalizado (CBR)": "CUSTOM_BITRATE_CBR"
            }, "container": ".mp4"
        },
        "H.264 (Apple VideoToolbox)": {
            "h264_videotoolbox": {
                "Alta Calidad": ['-c:v', 'h264_videotoolbox', '-profile:v', 'high', '-q:v', '70'],
                "Calidad Media": ['-c:v', 'h264_videotoolbox', '-profile:v', 'main', '-q:v', '50'],
                "Bitrate Personalizado (CBR)": "CUSTOM_BITRATE_CBR"
            }, "container": ".mp4"
        },
        "H.265/HEVC (Apple VideoToolbox)": {
            "hevc_videotoolbox": {
                "Alta Calidad": ['-c:v', 'hevc_videotoolbox', '-profile:v', 'main', '-q:v', '80'],
                "Calidad Media": ['-c:v', 'hevc_videotoolbox', '-profile:v', 'main', '-q:v', '65'],
                "Bitrate Personalizado (CBR)": "CUSTOM_BITRATE_CBR"
            }, "container": ".mp4"
        },
        "GIF (animado)": {
            "gif": { 
                "Baja Calidad (RÃ¡pido)": ['-vf', 'fps=15,scale=480:-1'],
                "Calidad Web (480p, 15fps)": ['-filter_complex', '[0:v] fps=15,scale=480:-1,split [a][b];[a] palettegen [p];[b][p] paletteuse'],
                "Calidad Media (540p, 24fps)": ['-filter_complex', '[0:v] fps=24,scale=540:-1,split [a][b];[a] palettegen [p];[b][p] paletteuse'],
                "Calidad Alta (720p, 30fps)": ['-filter_complex', '[0:v] fps=30,scale=720:-1,split [a][b];[a] palettegen [p];[b][p] paletteuse'],
                "Personalizado": "CUSTOM_GIF" 
            }, "container": ".gif"
        },
        "XDCAM HD422": {
            "mpeg2video": {
                "1080i50 (50 Mbps)": ['-c:v', 'mpeg2video', '-pix_fmt', 'yuv422p', '-b:v', '50M', '-flags', '+ildct+ilme', '-top', '1', '-minrate', '50M', '-maxrate', '50M'],
                "1080p25 (50 Mbps)": ['-c:v', 'mpeg2video', '-pix_fmt', 'yuv422p', '-b:v', '50M', '-minrate', '50M', '-maxrate', '50M'],
                "720p50 (50 Mbps)":  ['-c:v', 'mpeg2video', '-pix_fmt', 'yuv422p', '-b:v', '50M', '-minrate', '50M', '-maxrate', '50M']
            }, "container": ".mxf"
        },
        "XDCAM HD 35": {
            "mpeg2video": {
                "1080i50 (35 Mbps)": ['-c:v', 'mpeg2video', '-pix_fmt', 'yuv420p', '-b:v', '35M', '-flags', '+ildct+ilme', '-top', '1', '-minrate', '35M', '-maxrate', '35M'],
                "1080p25 (35 Mbps)": ['-c:v', 'mpeg2video', '-pix_fmt', 'yuv420p', '-b:v', '35M', '-minrate', '35M', '-maxrate', '35M'],
                "720p50 (35 Mbps)":  ['-c:v', 'mpeg2video', '-pix_fmt', 'yuv420p', '-b:v', '35M', '-minrate', '35M', '-maxrate', '35M']
            }, "container": ".mxf"
        },
        "AVC-Intra 100 (x264)": {
            "libx264": {
                "1080p (100 Mbps)": ['-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high422', '-level', '4.1', '-b:v', '100M', '-minrate', '100M', '-maxrate', '100M', '-bufsize', '2M', '-g', '1', '-keyint_min', '1', '-pix_fmt', 'yuv422p10le'],
                "720p (50 Mbps)":   ['-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high422', '-level', '3.1', '-b:v', '50M', '-minrate', '50M', '-maxrate', '50M', '-bufsize', '1M', '-g', '1', '-keyint_min', '1', '-pix_fmt', 'yuv422p10le']
            }, "container": ".mov"
        },
        "GoPro CineForm": {
            "cfhd": {
                "Baja": ['-c:v', 'cfhd', '-quality', '1'], "Media": ['-c:v', 'cfhd', '-quality', '4'], "Alta": ['-c:v', 'cfhd', '-quality', '6']
            }, "container": ".mov"
        },
        "QT Animation (qtrle)": { "qtrle": { "EstÃ¡ndar": ['-c:v', 'qtrle'] }, "container": ".mov" },
        "HAP": { "hap": { "EstÃ¡ndar": ['-c:v', 'hap'] }, "container": ".mov" },
    },
    "Audio": {
        "AAC": {
            "aac": {
                "Alta Calidad (~256kbps)": ['-c:a', 'aac', '-b:a', '256k'],
                "Buena Calidad (~192kbps)": ['-c:a', 'aac', '-b:a', '192k'],
                "Calidad Media (~128kbps)": ['-c:a', 'aac', '-b:a', '128k']
            }, "container": ".m4a"
        },
        "MP3 (libmp3lame)": {
            "libmp3lame": {
                "320kbps (CBR)": ['-c:a', 'libmp3lame', '-b:a', '320k'],
                "256kbps (VBR)": ['-c:a', 'libmp3lame', '-q:a', '0'],
                "192kbps (CBR)": ['-c:a', 'libmp3lame', '-b:a', '192k']
            }, "container": ".mp3"
        },
        "Opus (libopus)": {
            "libopus": {
                "Calidad Transparente (~256kbps)": ['-c:a', 'libopus', '-b:a', '256k'],
                "Calidad Alta (~192kbps)": ['-c:a', 'libopus', '-b:a', '192k'],
                "Calidad Media (~128kbps)": ['-c:a', 'libopus', '-b:a', '128k']
            }, "container": ".opus"
        },
        "Vorbis (libvorbis)": {
            "libvorbis": {
                "Calidad Muy Alta (q8)": ['-c:a', 'libvorbis', '-q:a', '8'],
                "Calidad Alta (q6)": ['-c:a', 'libvorbis', '-q:a', '6'],
                "Calidad Media (q4)": ['-c:a', 'libvorbis', '-q:a', '4']
            }, "container": ".ogg"
        },
        "AC-3 (Dolby Digital)": {
            "ac3": {
                "Stereo (192kbps)": ['-c:a', 'ac3', '-b:a', '192k'],
                "Stereo (256kbps)": ['-c:a', 'ac3', '-b:a', '256k'],
                "Surround 5.1 (448kbps)": ['-c:a', 'ac3', '-b:a', '448k', '-ac', '6'],
                "Surround 5.1 (640kbps)": ['-c:a', 'ac3', '-b:a', '640k', '-ac', '6']
            }, "container": ".ac3"
        },
        "ALAC (Apple Lossless)": {
            "alac": {
                "EstÃ¡ndar (Sin PÃ©rdida)": ['-c:a', 'alac']
            }, "container": ".m4a"
        },
        "FLAC (Sin PÃ©rdida)": {
            "flac": {
                "Nivel de CompresiÃ³n 5": ['-c:a', 'flac', '-compression_level', '5'],
                "Nivel de CompresiÃ³n 8 (MÃ¡s Lento)": ['-c:a', 'flac', '-compression_level', '8']
            }, "container": ".flac"
        },
        "WAV (Sin Comprimir)": {
            "pcm_s16le": {
                "PCM 16-bit": ['-c:a', 'pcm_s16le'],
                "PCM 24-bit": ['-c:a', 'pcm_s24le']
            }, "container": ".wav"
        },
        "WMA v2 (Windows Media)": {
            "wmav2": {
                "Calidad Alta (192kbps)": ['-c:a', 'wmav2', '-b:a', '192k'],
                "Calidad Media (128kbps)": ['-c:a', 'wmav2', '-b:a', '128k']
            }, "container": ".wma"
        }
    }
}

class FFmpegProcessor:
    def __init__(self):
        self.ffmpeg_path = resolve_ffmpeg_executable("ffmpeg")
        self.ffprobe_path = resolve_ffmpeg_executable("ffprobe")

        self.gpu_vendor = None
        self.is_detection_complete = False
        self.available_encoders = {"CPU": {"Video": {}, "Audio": {}}, "GPU": {"Video": {}}}
        self.current_process = None
    def cancel_current_process(self):
        """
        Cancela el proceso de FFmpeg que se estÃ© ejecutando actualmente.
        """
        if self.current_process and self.current_process.poll() is None:
            print("DEBUG: Enviando seÃ±al de terminaciÃ³n al proceso de FFmpeg...")
            try:
                self.current_process.terminate()
                self.current_process.wait(timeout=5) 
                print("DEBUG: Proceso de FFmpeg terminado.")
            except Exception as e:
                print(f"ERROR: No se pudo terminar el proceso de FFmpeg: {e}")
            self.current_process = None

    # --- Aceleración por GPU para recodificación (NVENC / QSV / AMF) ---
    # Los presets definen libx264/libx265 (CPU). Si la PC tiene un encoder por
    # hardware FUNCIONAL, se reescribe el comando al equivalente GPU (5-10x más
    # rápido). Si la GPU falla a media codificación, se reintenta con CPU.
    _hw_probe_cache = {}

    def _probe_encoder_works(self, encoder_name):
        cache = FFmpegProcessor._hw_probe_cache
        if encoder_name in cache:
            return cache[encoder_name]
        try:
            creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            result = subprocess.run(
                [self.ffmpeg_path, '-hide_banner', '-loglevel', 'error',
                 '-f', 'lavfi', '-i', 'color=black:s=256x256:d=0.2:r=10',
                 '-frames:v', '2', '-c:v', encoder_name, '-f', 'null', '-'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                timeout=15, creationflags=creationflags
            )
            ok = result.returncode == 0
        except Exception:
            ok = False
        cache[encoder_name] = ok
        print(f"DEBUG: encoder GPU {encoder_name}: {'disponible' if ok else 'no disponible'}")
        return ok

    def _hw_encoder_for(self, family):
        candidates = {
            'h264': ['h264_nvenc', 'h264_qsv', 'h264_amf'],
            'hevc': ['hevc_nvenc', 'hevc_qsv', 'hevc_amf'],
        }.get(family, [])
        for name in candidates:
            if self._probe_encoder_works(name):
                return name
        return None

    @staticmethod
    def _extract_param(params, flag, default=None):
        try:
            index = list(params).index(flag)
            return params[index + 1]
        except (ValueError, IndexError):
            return default

    def _apply_hw_acceleration(self, params):
        """Devuelve (params, se_uso_gpu). Solo reescribe libx264/libx265."""
        try:
            codec = self._extract_param(params, '-c:v')
            if codec not in ('libx264', 'libx265'):
                return params, False
            family = 'h264' if codec == 'libx264' else 'hevc'
            encoder = self._hw_encoder_for(family)
            if not encoder:
                return params, False
            crf = str(self._extract_param(params, '-crf', '23'))
            preset = str(self._extract_param(params, '-preset', 'medium'))
            cleaned = []
            skip_next = False
            for token in params:
                if skip_next:
                    skip_next = False
                    continue
                if token in ('-c:v', '-crf', '-preset', '-tune'):
                    skip_next = True
                    continue
                cleaned.append(token)
            if 'nvenc' in encoder:
                speed = {'slow': 'p6', 'medium': 'p5', 'fast': 'p4', 'veryfast': 'p3'}.get(preset, 'p5')
                hw = ['-c:v', encoder, '-preset', speed, '-rc', 'vbr', '-cq', crf, '-b:v', '0']
            elif 'qsv' in encoder:
                qsv_preset = preset if preset in ('slow', 'medium', 'fast', 'veryfast') else 'medium'
                hw = ['-c:v', encoder, '-preset', qsv_preset, '-global_quality', crf]
            else:  # amf
                quality = {'slow': 'quality', 'medium': 'balanced', 'fast': 'speed', 'veryfast': 'speed'}.get(preset, 'balanced')
                hw = ['-c:v', encoder, '-quality', quality, '-rc', 'cqp', '-qp_i', crf, '-qp_p', crf]
            print(f"DEBUG: recodificación acelerada por GPU con {encoder} (calidad {crf}, perfil {preset})")
            return hw + cleaned, True
        except Exception as error:
            print(f"ADVERTENCIA: no se pudo aplicar aceleración GPU: {error}")
            return params, False

    def run_detection_async(self, callback):
        threading.Thread(target=self._detect_encoders, args=(callback,), daemon=True).start()

    def _detect_encoders(self, callback):
        try:
            creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            
            subprocess.check_output(
                [self.ffmpeg_path, '-version'], 
                stderr=subprocess.STDOUT, 
                creationflags=creationflags,
                cwd=os.path.dirname(self.ffmpeg_path) 
            )
            
            all_encoders_output = subprocess.check_output(
                [self.ffmpeg_path, '-encoders'], 
                text=True, 
                encoding='utf-8', 
                stderr=subprocess.STDOUT, 
                creationflags=creationflags,
                cwd=os.path.dirname(self.ffmpeg_path)
            )
            
            try:
                if getattr(sys, 'frozen', False):
                    base_path = os.path.dirname(sys.executable)
                else:
                    base_path = os.path.dirname(os.path.abspath(__file__))
                log_path = os.path.join(base_path, "ffmpeg_encoders_log.txt")
                with open(log_path, "w", encoding="utf-8") as f:
                    f.write("--- ENCODERS DETECTADOS POR FFmpeg ---\n")
                    f.write(all_encoders_output)
                print(f"DEBUG: Se ha guardado un registro de los cÃ³decs de FFmpeg en {log_path}")
            except Exception as e:
                print(f"ADVERTENCIA: No se pudo escribir el log de cÃ³decs de FFmpeg: {e}")
                
            for category, codecs in CODEC_PROFILES.items():
                for friendly_name, details in codecs.items():
                    ffmpeg_codec_name = next((key for key in details if key != 'container'), None)
                    if not ffmpeg_codec_name:
                        continue 
                    search_pattern = r"^\s[A-Z\.]{6}\s+" + re.escape(ffmpeg_codec_name) + r"\s"
                    if re.search(search_pattern, all_encoders_output, re.MULTILINE):
                        proc_type = "GPU" if "nvenc" in ffmpeg_codec_name or "qsv" in ffmpeg_codec_name or "amf" in ffmpeg_codec_name or "videotoolbox" in ffmpeg_codec_name else "CPU"
                        if proc_type == "GPU" and self.gpu_vendor is None:
                            if "nvenc" in ffmpeg_codec_name: self.gpu_vendor = "NVIDIA"
                            elif "qsv" in ffmpeg_codec_name: self.gpu_vendor = "Intel"
                            elif "amf" in ffmpeg_codec_name: self.gpu_vendor = "AMD"
                            elif "videotoolbox" in ffmpeg_codec_name: self.gpu_vendor = "Apple"
                        target_category = self.available_encoders[proc_type].get(category, {})
                        target_category[friendly_name] = details
                        self.available_encoders[proc_type][category] = target_category
                        
            self.is_detection_complete = True
            callback(True, "DetecciÃ³n completada.")
            
        except (FileNotFoundError, subprocess.CalledProcessError) as e:
            self.is_detection_complete = True
            callback(False, "Error: ffmpeg no estÃ¡ instalado o no se encuentra en el PATH.")
        except Exception as e:
            self.is_detection_complete = True
            callback(False, f"Error inesperado durante la detecciÃ³n: {e}")

    def extract_audio(self, input_file, output_file, duration, progress_callback, cancellation_event: threading.Event):
        """
        Extrae la pista de audio de un archivo de video sin recodificar.
        Usa '-c:a copy' para una operaciÃ³n extremadamente rÃ¡pida.
        """
        process = None
        try:
            if cancellation_event.is_set():
                raise UserCancelledError("ExtracciÃ³n de audio cancelada antes de iniciar.")

            command = [
                self.ffmpeg_path, '-y', '-nostdin', '-progress', '-', '-i', input_file,
                '-vn',  
                '-c:a', 'copy',  
                '-map_metadata', '-1', 
                '-acodec', 'copy',
                output_file
            ]

            print("--- Comando FFmpeg para extracciÃ³n de audio ---")
            print(" ".join(command))
            print("---------------------------------------------")

            creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            error_output_buffer = []
            process = subprocess.Popen(
                command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, encoding='utf-8', errors='ignore', creationflags=creationflags
            )
            self.current_process = process

            def read_stream_into_buffer(stream, buffer):
                for line in iter(stream.readline, ''):
                    buffer.append(line.strip())
            stdout_thread = threading.Thread(target=self._read_stdout_for_progress, args=(process.stdout, progress_callback, cancellation_event, duration), daemon=True)
            stderr_thread = threading.Thread(target=read_stream_into_buffer, args=(process.stderr, error_output_buffer), daemon=True)
            stdout_thread.start()
            stderr_thread.start()
            while process.poll() is None:
                if cancellation_event.is_set():
                    self.cancel_current_process()
                    raise UserCancelledError("ExtracciÃ³n de audio cancelada por el usuario.")
                time.sleep(0.1)
            stdout_thread.join()
            stderr_thread.join()
            if process.returncode != 0:
                raise Exception(f"FFmpeg fallÃ³ al extraer audio: {' '.join(error_output_buffer)}")
            return output_file
        except UserCancelledError as e:
            raise e
        except Exception as e:
            self.cancel_current_process()
            raise e
        finally:
            if process:
                if process.stdout: process.stdout.close()
                if process.stderr: process.stderr.close()
            self.current_process = None

    def execute_recode(self, options, progress_callback, cancellation_event: threading.Event):
        process = None
        try:
            if cancellation_event.is_set():
                raise UserCancelledError("RecodificaciÃ³n cancelada por el usuario antes de iniciar.")
            input_file = options['input_file']
            output_file = os.path.normpath(options['output_file'])
            try:
                media_info = self.get_local_media_info(input_file)
                actual_duration = float(media_info['format']['duration'])
            except (Exception, KeyError, TypeError):
                actual_duration = options.get('duration', 0) 
            
            command = [self.ffmpeg_path, '-y', '-nostdin', '-progress', '-']
            duration = options.get('duration', 0)
            pre_params = options.get('pre_params', [])
            if pre_params:
                command.extend(pre_params)
            final_params = list(options['ffmpeg_params'])
            used_hw = False
            if not options.get('force_cpu'):
                final_params, used_hw = self._apply_hw_acceleration(final_params)
            video_idx = options.get('selected_video_stream_index')
            audio_idx = options.get('selected_audio_stream_index')
            mode = options.get('mode')
            command.extend(['-i', input_file])
            if mode == "Video+Audio":
                if video_idx is not None:
                    command.extend(['-map', f'0:{video_idx}?'])
                if audio_idx == "all":
                    command.extend(['-map', '0:a?'])
                elif audio_idx is not None:
                    command.extend(['-map', f'0:{audio_idx}?'])
            elif mode == "Solo Audio":
                if audio_idx == "all":
                    command.extend(['-map', '0:a?'])
                elif audio_idx is not None:
                    command.extend(['-map', f'0:{audio_idx}?'])
            command.extend(final_params)
            command.append(output_file)
            if not os.path.isfile(self.ffmpeg_path):
                raise FileNotFoundError(
                    f"FFmpeg no está instalado o no se encontró en {self.ffmpeg_path}. "
                    "Instálalo desde Ajustes > Almacenamiento > Componentes multimedia."
                )
            print("--- Comando FFmpeg a ejecutar ---")
            print(" ".join(command))
            print("---------------------------------")
            creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            error_output_buffer = []
            process = subprocess.Popen(command,stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='ignore', creationflags=creationflags)
            self.current_process = process

            def read_stream_into_buffer(stream, buffer):
                """Lee lÃ­nea por lÃ­nea de un stream y lo guarda en una lista."""
                for line in iter(stream.readline, ''):
                    buffer.append(line.strip())
            stdout_reader_thread = threading.Thread(target=self._read_stdout_for_progress, args=(process.stdout, progress_callback, cancellation_event, actual_duration), daemon=True)
            stderr_reader_thread = threading.Thread(target=read_stream_into_buffer, args=(process.stderr, error_output_buffer), daemon=True)
            stdout_reader_thread.start()
            stderr_reader_thread.start()
            while process.poll() is None:
                if cancellation_event.is_set():
                    # ESTA ES LA LÃ“GICA DE CANCELACIÃ“N DE single_tab
                    self.cancel_current_process()
                    raise UserCancelledError("RecodificaciÃ³n cancelada por el usuario.")
                time.sleep(0.1) # Usar un tiempo de espera mÃ¡s corto
            # ... (cÃ³digo anterior dentro de execute_recode) ...

            stdout_reader_thread.join()
            stderr_reader_thread.join()

            # Si la GPU falló, se reintenta automáticamente con CPU antes de rendirse.
            if process.returncode != 0 and not cancellation_event.is_set() and used_hw:
                print("ADVERTENCIA: la codificación por GPU falló; reintentando con CPU...")
                retry_options = dict(options)
                retry_options['force_cpu'] = True
                return self.execute_recode(retry_options, progress_callback, cancellation_event)

            # --- INICIO DE LA MODIFICACIÃ“N ---
            if process.returncode != 0 and not cancellation_event.is_set():
                # 1. Unir las lÃ­neas con saltos de lÃ­nea para procesarlas mejor
                full_error_log_text = "\n".join(error_output_buffer)
                
                # Imprimir en consola para debug completo (como antes)
                print(f"\n--- ERROR DETALLADO DE FFmpeg ---\n{full_error_log_text}\n---------------------------------\n")
                
                # 2. Filtrar/Extraer las lÃ­neas mÃ¡s relevantes para el usuario
                # FFmpeg suele poner el error crÃ­tico al final. Tomamos las Ãºltimas 10 lÃ­neas.
                lines = full_error_log_text.split('\n')
                
                # Eliminamos lÃ­neas vacÃ­as al final
                lines = [L for L in lines if L.strip()]
                
                # Tomamos las Ãºltimas lÃ­neas (ej. 8 lÃ­neas) para dar contexto sin llenar toda la pantalla
                relevant_lines = lines[-8:] if len(lines) > 8 else lines
                error_summary = "\n".join(relevant_lines)

                # 3. Lanzar la excepciÃ³n con el resumen del error real
                raise Exception(f"FFmpeg fallÃ³. Detalles:\n\n{error_summary}")
            # --- FIN DE LA MODIFICACIÃ“N ---

            if cancellation_event.is_set():
                raise UserCancelledError("RecodificaciÃ³n cancelada por el usuario.")
            return output_file

# ... (resto del cÃ³digo) ...
        except UserCancelledError as e:
            self.cancel_current_process()
            raise e
        except Exception as e:
            self.cancel_current_process()
            raise Exception(f"Error en recodificaciÃ³n: {e}")
        finally:
            if process:
                if process.stdout: process.stdout.close()
                if process.stderr: process.stderr.close()
            self.current_process = None

    def _read_stdout_for_progress(self, stream, progress_callback, cancellation_event, duration):
        """Lee el stdout de FFmpeg para el progreso, actualizando menos frecuentemente."""
        last_reported_percentage = -1.0
        for line in iter(stream.readline, ''):
            if cancellation_event.is_set():
                break
            if 'out_time_ms=' in line:
                try:
                    progress_us = int(line.strip().split('=')[1])
                    if duration > 0:
                        progress_seconds = progress_us / 1_000_000
                        percentage = (progress_seconds / duration) * 100
                        if percentage >= last_reported_percentage + 1.0 or percentage >= 99.9 or percentage <= 0.1:
                            progress_callback(percentage, f"Recodificando... {percentage:.1f}%")
                            last_reported_percentage = percentage
                except ValueError:
                    pass

    def get_local_media_info(self, input_file):
        """
        Usa ffprobe para obtener informaciÃ³n detallada de un archivo local.
        Esta versiÃ³n usa Popen para un manejo mÃ¡s robusto de timeouts y streams.
        """
        ffprobe_exe_name = "ffprobe.exe" if os.name == 'nt' else "ffprobe"
        ffprobe_path = self.ffprobe_path or os.path.join(os.path.dirname(self.ffmpeg_path), ffprobe_exe_name)
        
        command = [
            ffprobe_path, # <--- Usar la ruta reciÃ©n construida
            '-v', 'quiet',
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            input_file
        ]
        print(f"DEBUG: Ejecutando comando ffprobe con Popen: {' '.join(command)}")
        try:
            creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding='utf-8',
                errors='ignore',
                creationflags=creationflags
            )
            stdout, stderr = process.communicate(timeout=60)
            if process.returncode != 0:
                print("--- ERROR DETALLADO DE FFPROBE (Popen) ---")
                print(f"El proceso ffprobe fallÃ³ con el cÃ³digo de salida: {process.returncode}")
                print(f"Salida estÃ¡ndar (stdout):\n{stdout}")
                print(f"Salida de error (stderr):\n{stderr}")
                print("-----------------------------------------")
                return None
            return json.loads(stdout)
        except subprocess.TimeoutExpired:
            print("--- ERROR: TIMEOUT DE FFPROBE ---")
            print("La operaciÃ³n de anÃ¡lisis del archivo local tardÃ³ demasiado (mÃ¡s de 60s) y fue cancelada.")
            if 'process' in locals() and process:
                process.kill() 
                process.communicate()
            print("---------------------------------")
            return None
        except (FileNotFoundError, json.JSONDecodeError) as e:
            print(f"ERROR: No se pudo obtener informaciÃ³n de '{input_file}' con ffprobe: {e}")
            return None

    def get_frame_from_video(self, input_file, duration=0):
        """
        Extrae un fotograma de un video en un punto de tiempo seguro.
        CORREGIDO: Usa el orden de argumentos mÃ¡s robusto para FFmpeg.
        """
        if duration > 0:
            seek_time_seconds = min(duration / 2, 5.0)
            at_time = f"{seek_time_seconds:.3f}"
        else:
            at_time = '00:00:01' 

        temp_dir = tempfile.gettempdir()
        output_path = os.path.join(temp_dir, f"mediacore_thumbnail_{os.path.basename(input_file)}.jpg")
        
        command = [
            self.ffmpeg_path,
            '-y',
            '-i', input_file,    
            '-ss', at_time,      
            '-vframes', '1',
            '-q:v', '2',
            output_path
        ]
        
        try:
            creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            subprocess.run(command, check=True, capture_output=True, creationflags=creationflags)
            return output_path
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            print(f"ERROR: No se pudo extraer el fotograma: {e}")
            return None
        
    def execute_video_to_images(self, options, progress_callback, cancellation_event: threading.Event):
            """
            Convierte un archivo de video en una secuencia de imÃ¡genes (ej. JPG o PNG).
            """
            process = None
            try:
                if cancellation_event.is_set():
                    raise UserCancelledError("ExtracciÃ³n cancelada por el usuario antes de iniciar.")
                    
                input_file = options['input_file']
                output_folder = os.path.normpath(options['output_folder'])
                image_format = options.get('image_format', 'png')
                fps = options.get('fps')
                jpg_quality = options.get('jpg_quality', '2')  # String por defecto

                # Validar calidad JPG
                try:
                    jpg_quality_int = int(jpg_quality)
                    if not (1 <= jpg_quality_int <= 31):
                        jpg_quality = '2'  # Fallback a calidad alta
                except (ValueError, TypeError):
                    jpg_quality = '2'

                # 1. Asegurarse de que la carpeta de salida exista
                os.makedirs(output_folder, exist_ok=True)
                
                # 2. Construir el comando
                command = [self.ffmpeg_path, '-y', '-nostdin', '-progress', '-']
                
                pre_params = options.get('pre_params', [])
                if pre_params:
                    command.extend(pre_params)
                
                command.extend(['-i', input_file])
                
                final_params = []
                
                # 3. AÃ±adir filtro de FPS (si se especificÃ³)
                if fps:
                    try:
                        fps_value = float(fps)
                        final_params.extend(['-vf', f"fps={fps_value}"])
                        print(f"INFO: Extrayendo a {fps_value} FPS.")
                    except (ValueError, TypeError):
                        print("INFO: FPS invÃ¡lido, extrayendo todos los fotogramas.")
                else:
                    print("INFO: Extrayendo todos los fotogramas (FPS no especificado).")
                
                # 4. AÃ±adir opciones de formato de imagen
                if image_format == 'jpg':
                    final_params.extend(['-q:v', str(jpg_quality)])
                    output_pattern = "frame_%06d.jpg"
                else:  # PNG
                    output_pattern = "frame_%06d.png"

                command.extend(final_params)
                command.append(os.path.join(output_folder, output_pattern))
                
                print("--- Comando FFmpeg para ExtracciÃ³n de ImÃ¡genes ---")
                print(" ".join(command))
                print("-------------------------------------------------")
                
                # 5. Obtener duraciÃ³n
                try:
                    media_info = self.get_local_media_info(input_file)
                    actual_duration = float(media_info['format']['duration'])
                except Exception:
                    actual_duration = options.get('duration', 0)

                # 6. Ejecutar el proceso
                creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                error_output_buffer = []
                process = subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.PIPE, 
                    text=True, 
                    encoding='utf-8', 
                    errors='ignore', 
                    creationflags=creationflags
                )
                self.current_process = process

                def read_stream_into_buffer(stream, buffer):
                    for line in iter(stream.readline, ''):
                        buffer.append(line.strip())
                
                stdout_reader_thread = threading.Thread(
                    target=self._read_stdout_for_progress, 
                    args=(process.stdout, progress_callback, cancellation_event, actual_duration), 
                    daemon=True
                )
                stderr_reader_thread = threading.Thread(
                    target=read_stream_into_buffer, 
                    args=(process.stderr, error_output_buffer), 
                    daemon=True
                )
                
                stdout_reader_thread.start()
                stderr_reader_thread.start()
                
                while process.poll() is None:
                    if cancellation_event.is_set():
                        self.cancel_current_process()
                        raise UserCancelledError("ExtracciÃ³n cancelada por el usuario.")
                    time.sleep(0.1)
                
                stdout_reader_thread.join()
                stderr_reader_thread.join()
                
                if process.returncode != 0 and not cancellation_event.is_set():
                    full_error_log = " ".join(error_output_buffer)
                    print(f"\n--- ERROR DETALLADO DE FFmpeg ---\n{full_error_log}\n---------------------------------\n")
                    raise Exception(f"FFmpeg fallÃ³ (ver consola para detalles tÃ©cnicos).")
                
                if cancellation_event.is_set():
                    raise UserCancelledError("ExtracciÃ³n cancelada por el usuario.")
                
                # 7. Ã‰xito: Devolver la RUTA DE LA CARPETA
                return output_folder
                
            except UserCancelledError as e:
                self.cancel_current_process()
                raise e
            except Exception as e:
                self.cancel_current_process()
                raise Exception(f"Error en extracciÃ³n de imÃ¡genes: {e}")
            finally:
                if process:
                    if process.stdout: process.stdout.close()
                    if process.stderr: process.stderr.close()
                self.current_process = None

def clean_and_convert_vtt_to_srt(input_path):
    """
    Convierte un archivo VTT a SRT limpio, o limpia un SRT existente.
    Elimina etiquetas de formato, marcas de tiempo duplicadas y texto de karaoke.
    """
    import re
    
    output_path = input_path
    is_vtt = input_path.lower().endswith('.vtt')
    
    # Si es VTT, cambiar la extensiÃ³n a SRT
    if is_vtt:
        output_path = os.path.splitext(input_path)[0] + '.srt'
    
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        lines = content.split('\n')
        cleaned_lines = []
        counter = 1
        skip_next = False
        
        for i, line in enumerate(lines):
            # Saltar el encabezado WEBVTT
            if line.strip().startswith('WEBVTT') or line.strip().startswith('Kind:') or line.strip().startswith('Language:'):
                continue
            
            # Saltar lÃ­neas de estilo
            if line.strip().startswith('STYLE') or '::cue' in line:
                skip_next = True
                continue
            
            if skip_next:
                if line.strip() == '':
                    skip_next = False
                continue
            
            # ðŸ”§ CRÃTICO: Limpiar texto de karaoke y etiquetas HTML
            if line.strip() and '-->' not in line and not line.strip().isdigit():
                # Eliminar etiquetas de formato VTT como <c>, <v>, etc.
                cleaned = re.sub(r'<[^>]+>', '', line)
                # Eliminar marcas de tiempo embebidas (karaoke)
                cleaned = re.sub(r'<\d{2}:\d{2}:\d{2}\.\d{3}>', '', cleaned)
                # Eliminar etiquetas de color y estilo
                cleaned = re.sub(r'\{[^}]+\}', '', cleaned)
                cleaned = cleaned.strip()
                
                if cleaned:
                    cleaned_lines.append(cleaned)
                continue
            
            # Mantener timestamps y nÃºmeros de secuencia
            if '-->' in line or line.strip().isdigit() or line.strip() == '':
                cleaned_lines.append(line.strip())
        
        # Reconstruir el archivo SRT
        srt_content = []
        i = 0
        while i < len(cleaned_lines):
            line = cleaned_lines[i]
            
            # Si es un timestamp
            if '-->' in line:
                # Agregar nÃºmero de secuencia
                srt_content.append(str(counter))
                # Convertir formato de tiempo VTT a SRT si es necesario
                timestamp = line.replace('.', ',')  # VTT usa punto, SRT usa coma
                srt_content.append(timestamp)
                
                # Recoger todas las lÃ­neas de texto hasta la siguiente lÃ­nea vacÃ­a
                i += 1
                text_lines = []
                while i < len(cleaned_lines) and cleaned_lines[i].strip() != '':
                    if '-->' not in cleaned_lines[i]:
                        text_lines.append(cleaned_lines[i])
                    else:
                        i -= 1
                        break
                    i += 1
                
                if text_lines:
                    srt_content.extend(text_lines)
                
                srt_content.append('')  # LÃ­nea vacÃ­a entre subtÃ­tulos
                counter += 1
            
            i += 1
        
        # Guardar el archivo limpio
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(srt_content))
        
        # Si era VTT, eliminar el archivo original
        if is_vtt and output_path != input_path:
            try:
                os.remove(input_path)
            except:
                pass
        
        print(f"DEBUG: SubtÃ­tulo limpiado y guardado en: {output_path}")
        return output_path
        
    except Exception as e:
        print(f"ERROR al limpiar subtÃ­tulo: {e}")
        return input_path
    
def slice_subtitle(ffmpeg_path, input_path, output_path, start_time, end_time=None):
    """
    Corta el subtÃ­tulo usando FFmpeg con 'Input Seeking'.
    Esto fuerza a FFmpeg a resetear los timestamps a 00:00:00 y maneja
    la deriva de tiempo (drift) automÃ¡ticamente.
    """
    import subprocess
    import os

    # Helper simple para calcular duraciÃ³n (necesario para -t)
    def parse_time_to_seconds(t_str):
        if not t_str: return 0.0
        try:
            parts = str(t_str).split(':')
            if len(parts) == 3:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
            elif len(parts) == 2:
                return int(parts[0]) * 60 + float(parts[1])
            return 0.0
        except: return 0.0

    # Construir comando FFmpeg
    cmd = [ffmpeg_path, '-y']
    
    # 1. CRÃTICO: -ss ANTES del input (-i)
    # Esto le dice a FFmpeg: "Salta a este punto y finge que es el inicio (00:00:00)"
    if start_time:
        cmd.extend(['-ss', str(start_time)])
    
    cmd.extend(['-i', input_path])

    # 2. Calcular duraciÃ³n para el corte final
    # Al usar Input Seeking, -to ya no funciona igual, debemos usar -t (duraciÃ³n)
    if end_time:
        s_sec = parse_time_to_seconds(start_time)
        e_sec = parse_time_to_seconds(end_time)
        duration = e_sec - s_sec
        if duration > 0:
            cmd.extend(['-t', str(duration)])

    # 3. Forzar codificaciÃ³n UTF-8 para evitar errores de caracteres
    # (Especialmente Ãºtil con acentos en espaÃ±ol)
    cmd.append(output_path)
    
    try:
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        subprocess.run(
            cmd, 
            check=True, 
            stdout=subprocess.DEVNULL, 
            stderr=subprocess.DEVNULL,
            creationflags=creationflags
        )
        return True
    except Exception as e:
        print(f"ERROR cortando subtÃ­tulo con FFmpeg: {e}")
        return False
    
