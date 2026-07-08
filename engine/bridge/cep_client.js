/* Cliente CEP mínimo. Requiere CSInterface.js y socket.io.js del SDK de Adobe. */
(function (global) {
    "use strict";

    function escapeForExtendScript(value) {
        return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "\\'");
    }

    function createClipDockBridge(options) {
        var cs = new CSInterface();
        var identifier = options.appIdentifier; // "premiere" o "aftereffects"
        var socket = io(options.serverUrl || "http://127.0.0.1:7788", {
            transports: ["polling", "websocket"],
            reconnection: true
        });

        socket.on("connect", function () {
            socket.emit("register", { appIdentifier: identifier });
            socket.emit("get_active_target");
        });

        socket.on("active_target_update", function (data) {
            if (options.onTargetChanged) options.onTargetChanged(data.activeTarget || null, data || {});
        });

        socket.on("new_file", function (data) {
            var pkg = data && data.filePackage;
            if (!pkg) return;
            var files = [pkg.video, pkg.thumbnail, pkg.subtitle].filter(Boolean);
            importFiles(files, pkg.targetBin || null, options.addToTimeline === true);
        });

        socket.on("import_files", function (data) {
            if (data && data.files) importFiles(data.files, data.targetBin || null, data.addToTimeline === true);
        });

        function importFiles(files, targetBin, addToTimeline) {
            var json = escapeForExtendScript(JSON.stringify(files));
            var bin = targetBin ? '"' + escapeForExtendScript(targetBin) + '"' : "null";
            var script = 'importFiles("' + json + '", ' + addToTimeline + ', 0, false, ' + bin + ')';
            cs.evalScript(script, function (result) {
                if (options.onImportResult) options.onImportResult(result);
            });
        }

        return {
            link: function () {
                socket.emit("set_active_target", { targetApp: identifier });
            },
            unlink: function () {
                socket.emit("clear_active_target");
            },
            sendSelection: function () {
                cs.evalScript("getSelectedFilePathsFromAdobe()", function (result) {
                    var files = JSON.parse(result || "[]");
                    socket.emit("adobe_push_files", { files: files });
                });
            },
            socket: socket
        };
    }

    global.createClipDockBridge = createClipDockBridge;
    global.createLegacyBridge = createClipDockBridge;
}(this));
