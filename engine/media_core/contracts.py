"""Contratos neutrales para conectar cualquier GUI, CLI o API."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any


class JobState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(slots=True)
class ProgressEvent:
    percent: float
    message: str
    phase: str = "processing"
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class FilePackage:
    video: str | None = None
    thumbnail: str | None = None
    subtitle: str | None = None
    target_bin: str | None = None

    def to_bridge_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["targetBin"] = payload.pop("target_bin")
        return {key: value for key, value in payload.items() if value is not None}


@dataclass(slots=True)
class DownloadRequest:
    url: str
    output_template: str
    format_selector: str = "bv*+ba/b"
    cookie_file: str | None = None
    browser_cookies: tuple[str, ...] | None = None
    subtitles: list[str] = field(default_factory=list)
    extra_options: dict[str, Any] = field(default_factory=dict)

    def to_yt_dlp_options(self) -> dict[str, Any]:
        options: dict[str, Any] = {
            "format": self.format_selector,
            "outtmpl": self.output_template,
            "noplaylist": True,
        }
        if self.cookie_file:
            options["cookiefile"] = self.cookie_file
        if self.browser_cookies:
            options["cookiesfrombrowser"] = self.browser_cookies
        if self.subtitles:
            options.update({"writesubtitles": True, "subtitleslangs": self.subtitles})
        options.update(self.extra_options)
        return options
