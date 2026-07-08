"""Cola genérica sin dependencias de UI."""

from __future__ import annotations

import queue
import threading
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable

from .contracts import JobState, ProgressEvent


ProgressCallback = Callable[[str, ProgressEvent], None]
JobCallable = Callable[[threading.Event, Callable[[ProgressEvent], None]], Any]


@dataclass
class EngineJob:
    operation: JobCallable
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    state: JobState = JobState.QUEUED
    result: Any = None
    error: str | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event)
    generation: int = 0


class JobQueue:
    def __init__(self, on_progress: ProgressCallback | None = None):
        self._jobs: dict[str, EngineJob] = {}
        self._queue: queue.Queue[tuple[EngineJob, int] | None] = queue.Queue()
        self._on_progress = on_progress or (lambda _job_id, _event: None)
        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._thread.start()

    def submit(self, operation: JobCallable) -> EngineJob:
        job = EngineJob(operation=operation)
        self._jobs[job.id] = job
        self._queue.put((job, job.generation))
        return job

    def get(self, job_id: str) -> EngineJob | None:
        return self._jobs.get(job_id)

    def cancel(self, job_id: str) -> bool:
        job = self._jobs.get(job_id)
        if not job or job.state in {JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED}:
            return False
        job.cancel_event.set()
        # Marcamos cancelado de inmediato para que la app y la extensión CEP
        # dejen de esperar aunque FFmpeg/yt-dlp tarde unos segundos en cerrar.
        job.state = JobState.CANCELLED
        return True

    def pause(self, job_id: str) -> bool:
        job = self._jobs.get(job_id)
        if not job or job.state in {JobState.PAUSED, JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED}:
            return False
        job.generation += 1
        job.state = JobState.PAUSED
        job.cancel_event.set()
        return True

    def resume(self, job_id: str) -> bool:
        job = self._jobs.get(job_id)
        if not job or job.state is not JobState.PAUSED:
            return False
        job.generation += 1
        job.cancel_event = threading.Event()
        job.error = None
        job.result = None
        job.state = JobState.QUEUED
        self._queue.put((job, job.generation))
        return True

    def close(self) -> None:
        self._queue.put(None)

    def _worker(self) -> None:
        while True:
            queued = self._queue.get()
            if queued is None:
                return
            job, generation = queued
            if generation != job.generation or job.state is JobState.PAUSED:
                continue
            if job.cancel_event.is_set():
                job.state = JobState.CANCELLED
                continue
            job.state = JobState.RUNNING
            report = lambda event: self._on_progress(job.id, event)
            try:
                job.result = job.operation(job.cancel_event, report)
                if generation == job.generation:
                    job.state = JobState.CANCELLED if job.cancel_event.is_set() else JobState.COMPLETED
            except Exception as exc:
                job.error = str(exc)
                if generation == job.generation:
                    job.state = JobState.CANCELLED if job.cancel_event.is_set() else JobState.FAILED
