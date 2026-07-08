"""Contrato mínimo para activar el procesador masivo recuperado sin una GUI."""

from __future__ import annotations

from typing import Any, Protocol


class BatchHostAdapter(Protocol):
    VIDEO_EXTENSIONS: set[str]
    AUDIO_EXTENSIONS: set[str]
    FORMAT_MUXER_MAP: dict[str, str]
    LANG_CODE_MAP: dict[str, str]
    LANGUAGE_ORDER: list[str]
    DEFAULT_PRIORITY: list[str]
    cookies_mode_saved: str
    cookies_path: str
    selected_browser_saved: str
    browser_profile_saved: str
    ffmpeg_processor: Any
    batch_context: Any
    single_context: Any
    image_context: Any
    socketio: Any

    def dispatch(self, delay_ms: int, callback: Any) -> Any: ...
    def ACTIVE_TARGET_SID_accessor(self) -> str | None: ...


class ImmediateDispatcher:
    """Implementación útil en CLI y pruebas: ejecuta callbacks inmediatamente."""

    def dispatch(self, _delay_ms: int, callback: Any) -> Any:
        return callback()
