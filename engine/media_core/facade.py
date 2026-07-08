"""Fachada estable que una interfaz nueva puede consumir."""

from __future__ import annotations

import threading
from typing import Any, Callable

from .contracts import DownloadRequest
from .downloader import download_media, get_video_info
from .image_converter import ImageConverter
from .image_processor import ImageProcessor
from .paths import BIN_DIR, FFMPEG_BIN_DIR, UPSCALING_DIR
from .processor import FFmpegProcessor
from .video_upscaler import VideoUpscaler


class MediaEngine:
    def __init__(self):
        self.bin_dir = BIN_DIR
        self.ffmpeg_dir = FFMPEG_BIN_DIR
        self.ffmpeg = FFmpegProcessor()
        self.images = ImageProcessor(
            poppler_path=f"{BIN_DIR}/poppler",
            inkscape_path=f"{BIN_DIR}/inkscape/bin",
            ffmpeg_path=self.ffmpeg_dir,
        )
        self.converter = ImageConverter(
            poppler_path=f"{BIN_DIR}/poppler",
            inkscape_path=f"{BIN_DIR}/inkscape/bin",
            ffmpeg_processor=self.ffmpeg,
        )

    def analyze_url(self, url: str, cookie_options: dict[str, Any] | None = None) -> dict[str, Any]:
        return get_video_info(url, cookie_options)

    def download(
        self,
        request: DownloadRequest,
        progress: Callable[..., None] | None = None,
        cancel_event: threading.Event | None = None,
    ) -> Any:
        return download_media(
            request.url,
            request.to_yt_dlp_options(),
            progress or (lambda *_args, **_kwargs: None),
            cancel_event or threading.Event(),
        )

    def local_media_info(self, path: str) -> dict[str, Any]:
        return self.ffmpeg.get_local_media_info(path)

    def video_thumbnail(self, path: str, duration: float = 0) -> str:
        return self.ffmpeg.get_frame_from_video(path, duration)

    def document_thumbnail(self, path: str, size: tuple[int, int] = (400, 400), page: int | None = None):
        return self.images.generate_thumbnail(path, size=size, page_number=page)

    def convert_image(self, input_path: str, output_path: str, options: dict[str, Any], **kwargs: Any) -> bool:
        return self.converter.convert_file(input_path, output_path, options, **kwargs)

    def video_upscaler(self, **kwargs: Any) -> VideoUpscaler:
        return VideoUpscaler(self.ffmpeg_dir, UPSCALING_DIR, **kwargs)
