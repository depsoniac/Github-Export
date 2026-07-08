"""Servidor Socket.IO independiente y sin interfaz."""

from __future__ import annotations

import threading
import time
import uuid
from collections.abc import Callable, Iterable
from typing import Any

from flask import Flask, jsonify, request
from flask_socketio import SocketIO

from media_core.contracts import FilePackage


class CEPBridgeServer:
    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 7788,
        on_editor_files: Callable[[list[str]], None] | None = None,
        on_download_request: Callable[[dict[str, Any]], None] | None = None,
    ):
        self.host = host
        self.port = port
        self.on_editor_files = on_editor_files or (lambda _files: None)
        self.on_download_request = on_download_request or (lambda _request: None)
        self.app = Flask(__name__)

        @self.app.after_request
        def _allow_cep(response):
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            return response

        self.socket = SocketIO(self.app, cors_allowed_origins="*", async_mode="threading")
        self.clients: dict[str, str] = {}
        self.client_ids: dict[str, str] = {}
        self.active_sid: str | None = None
        self.active_client_id: str | None = None
        self.deliveries: dict[str, dict[str, Any]] = {}
        self.api_port: int | None = None
        self.app_name = "ClipDock"
        self._lock = threading.RLock()
        self._register_events()

    def _register_events(self) -> None:
        @self.socket.on("connect")
        def _connect():
            return True

        @self.socket.on("disconnect")
        def _disconnect():
            with self._lock:
                self.clients.pop(request.sid, None)
                self.client_ids.pop(request.sid, None)
                if request.sid == self.active_sid:
                    self.active_sid = None
                    self.socket.emit("active_target_update", {"activeTarget": None})

        @self.socket.on("register")
        def _register(data: dict[str, Any] | None):
            identifier = (data or {}).get("appIdentifier")
            client_id = str((data or {}).get("clientId") or request.sid)
            if identifier:
                with self._lock:
                    self.clients[request.sid] = str(identifier)
                    self.client_ids[request.sid] = client_id
                    if self.active_client_id == client_id:
                        self.active_sid = request.sid
            self._emit_active()
            return {"registered": bool(identifier), "clientId": client_id}

        @self.socket.on("get_active_target")
        def _get_active():
            self._emit_active(to=request.sid)

        @self.socket.on("get_bridge_status")
        def _get_bridge_status():
            self._emit_active(to=request.sid)

        @self.socket.on("set_active_target")
        def _set_active(data: dict[str, Any] | None):
            target = (data or {}).get("targetApp")
            with self._lock:
                # El panel que hace clic debe ser el destino. Elegir el primer cliente por
                # nombre enviaba archivos a otro proyecto cuando habia varios paneles CEP.
                if self.clients.get(request.sid) == target:
                    self.active_sid = request.sid
                else:
                    self.active_sid = next((sid for sid, name in self.clients.items() if name == target), None)
                self.active_client_id = self.client_ids.get(self.active_sid) if self.active_sid else None
            self._emit_active()
            return {"active": self.active_sid == request.sid, "activeTarget": self.clients.get(self.active_sid) if self.active_sid else None}

        @self.socket.on("clear_active_target")
        def _clear_active():
            with self._lock:
                if request.sid == self.active_sid:
                    self.active_sid = None
                    self.active_client_id = None
            self._emit_active()

        @self.socket.on("adobe_push_files")
        def _receive_files(data: dict[str, Any] | None):
            files = [str(path) for path in (data or {}).get("files", []) if path]
            if files:
                self.on_editor_files(files)
            return {"received": len(files), "files": files}

        @self.socket.on("adobe_download_request")
        def _receive_download_request(data: dict[str, Any] | None):
            if data:
                self.on_download_request(dict(data))
                return {"accepted": True}
            return {"accepted": False}

        @self.socket.on("import_result")
        def _import_result(data: dict[str, Any] | None):
            payload = data or {}
            delivery_id = str(payload.get("deliveryId") or "")
            if not delivery_id:
                return {"accepted": False}
            with self._lock:
                delivery = self.deliveries.get(delivery_id)
                if not delivery:
                    return {"accepted": False}
                sender_client_id = self.client_ids.get(request.sid)
                if delivery.get("targetClientId") and delivery.get("targetClientId") != sender_client_id:
                    return {"accepted": False}
                delivery.update({
                    "status": "completed" if payload.get("success") else "failed",
                    "success": bool(payload.get("success")),
                    "result": str(payload.get("result") or ""),
                    "completedAt": time.time(),
                })
                delivery["event"].set()
            return {"accepted": True, "deliveryId": delivery_id}

        @self.app.route("/bridge/status", methods=["GET", "OPTIONS"])
        def _http_status():
            if request.method == "OPTIONS":
                return ("", 204)
            with self._lock:
                active = self.clients.get(self.active_sid) if self.active_sid else None
                clients = dict(self.clients)
            return jsonify({
                "ready": True,
                "activeTarget": active,
                "activeClientId": self.active_client_id if self.active_sid else None,
                "apiPort": self.api_port,
                "bridgePort": self.port,
                "appName": self.app_name,
                "clientCount": len(clients),
                "clients": list(clients.values()),
            })

        @self.app.route("/adobe/receive", methods=["POST", "OPTIONS"])
        def _http_receive_files():
            if request.method == "OPTIONS":
                return ("", 204)
            data = request.get_json(silent=True) or {}
            files = [str(path).strip() for path in data.get("files", []) if str(path).strip()]
            if files:
                self.on_editor_files(files)
            return jsonify({"received": len(files), "files": files})

        @self.app.route("/adobe/download-request", methods=["POST", "OPTIONS"])
        def _http_download_request():
            if request.method == "OPTIONS":
                return ("", 204)
            data = request.get_json(silent=True) or {}
            if data:
                self.on_download_request(dict(data))
            return jsonify({"accepted": bool(data)})

    def _emit_active(self, to: str | None = None) -> None:
        with self._lock:
            active = self.clients.get(self.active_sid) if self.active_sid else None
            active_client_id = self.active_client_id if self.active_sid else None
        self.socket.emit("active_target_update", {
            "activeTarget": active,
            "activeClientId": active_client_id,
            "apiPort": self.api_port,
            "appName": self.app_name,
            "clientCount": len(self.clients),
            "ready": True,
        }, to=to)

    def send_package(self, package: FilePackage | dict[str, Any]) -> None:
        payload = package.to_bridge_dict() if isinstance(package, FilePackage) else package
        with self._lock:
            target = self.active_sid
        if not target:
            raise RuntimeError("No hay un editor CEP enlazado")
        self.socket.emit("new_file", {"filePackage": payload}, to=target)

    def send_batch(
        self,
        files: Iterable[str],
        target_bin: str | None = None,
        add_to_timeline: bool = False,
        delivery_id: str | None = None,
        wait_timeout: float = 15.0,
    ) -> dict[str, Any]:
        paths = list(files)
        delivery_id = str(delivery_id or uuid.uuid4().hex)
        with self._lock:
            target = self.active_sid
            existing = self.deliveries.get(delivery_id)
            if existing and existing.get("status") in {"completed", "failed"}:
                return {key: value for key, value in existing.items() if key != "event"}
            delivery = existing or {
                "deliveryId": delivery_id,
                "status": "pending",
                "success": False,
                "files": paths,
                "createdAt": time.time(),
                "targetClientId": self.client_ids.get(target),
                "event": threading.Event(),
            }
            self.deliveries[delivery_id] = delivery
            if len(self.deliveries) > 500:
                oldest = sorted(self.deliveries, key=lambda key: self.deliveries[key].get("createdAt", 0))[:100]
                for key in oldest:
                    if key != delivery_id:
                        self.deliveries.pop(key, None)
        if not target:
            raise RuntimeError("No hay un editor CEP enlazado")
        # Reemitir el mismo deliveryId es seguro: el panel deduplica y devuelve su
        # confirmacion anterior si el ACK se perdio durante una reconexion.
        self.socket.emit("import_files", {
            "deliveryId": delivery_id,
            "files": paths,
            "targetBin": target_bin,
            "addToTimeline": bool(add_to_timeline),
        }, to=target)
        delivery["event"].wait(max(0.0, min(float(wait_timeout), 30.0)))
        with self._lock:
            current = self.deliveries.get(delivery_id, delivery)
            result = {key: value for key, value in current.items() if key != "event"}
        if result.get("status") == "pending":
            result["status"] = "timeout"
        return result

    def run(self) -> None:
        self.socket.run(
            self.app,
            host=self.host,
            port=self.port,
            log_output=False,
            allow_unsafe_werkzeug=True,
        )

    def start_background(self) -> threading.Thread:
        thread = threading.Thread(target=self.run, daemon=True, name="cep-bridge")
        thread.start()
        return thread
