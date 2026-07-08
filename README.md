# ClipDock — proyecto fuente

Descargas, procesamiento multimedia e integración con Adobe en una sola mesa de trabajo.

## Estructura

```
├── main.js            Proceso principal de Electron (ventanas, IPC, motor, complementos)
├── preload.js         Puente seguro renderer ↔ main
├── renderer/          Interfaz (index.html, app.js, styles/settings/studio.css, splash.html)
├── backend/           Servidor Flask (app.py) que expone el motor
├── engine/            Núcleo Python (media_core, bridge, requirements.txt)
│   └── .venv/         Entorno virtual SOLO para desarrollo (lo crea ARRANCAR.bat)
├── runtime/           Perfiles de instalación inicial (profiles.json)
├── assets/            Iconos y logo (clipdock.ico/png, logo.svg)
├── build-tools/       Scripts de desarrollo y exportación (arrancar.js, exportar.js)
├── update-config.json Config de actualizaciones por GitHub Releases
├── ARRANCAR.bat       Modo desarrollo (crea .venv y abre la app con Electron)
└── EXPORTAR.bat       Genera el instalador Windows en release-dist/
```

## Complementos (marketplace)

Los complementos **no viven en este repo**. Se publican en
[github.com/depsoniac/ClipDock-Marketplace](https://github.com/depsoniac/ClipDock-Marketplace)
y se sirven por GitHub Pages:

- Catálogo: `https://depsoniac.github.io/ClipDock-Marketplace/catalog.json`
- La app lee ese catálogo en runtime (URL por defecto en `main.js` → `DEFAULT_REMOTE_CATALOG_URL`)
  y cachea el resultado, así Complementos funciona incluso sin internet tras la primera carga.
- Para publicar o actualizar un complemento: sube el folder con su `plugin.json` y ZIP al repo
  del marketplace y agrégalo a `plugins/index.json`. La app no necesita recompilarse.

## Exportar para macOS (GitHub Actions)

La app es bi-plataforma: en el repo vive `.github/workflows/build-apps.yml`. Desde la
pestaña **Actions → Build ClipDock → Run workflow** se generan en runners de GitHub:

- `ClipDock_Setup_<version>.exe` (Windows, mismo instalador estilo G Hub)
- `ClipDock_Mac_<version>_arm64.dmg` y `_x64.dmg` (macOS, sin firmar)
- `ClipDock_Runtime_python-3.11.9-macos.zip` — el motor Python para macOS
  (súbelo al release `runtime` junto al de Windows; la app elige el asset
  según la plataforma vía `update-config.json` → `runtime.assetMac`)

Notas macOS: la app usa `bin/python3` dentro del runtime (layout de
python-build-standalone), los ZIP se extraen con `ditto`, y la carpeta CEP de
Adobe es `~/Library/Application Support/Adobe/CEP/extensions`. Al no estar
firmado con cuenta de Apple, la primera apertura requiere clic derecho → Abrir.
Importante: la carpeta `build/` (splash del instalador) debe estar commiteada
en el repo para que el job de Windows funcione.

## Exportar instalador

1. Ejecuta `EXPORTAR.bat` (necesita Node.js LTS solo en la PC de desarrollo).
2. El script verifica el proyecto, prepara el Python mini portable, instala dependencias
   y compila con electron-builder.
3. En `release-dist/` quedan **dos archivos**:
   - `ClipDock_Setup_<version>.exe` → súbelo al release de cada versión.
   - `ClipDock_Runtime_python-<ver>.zip` → súbelo **una sola vez** a un release fijo
     con tag `runtime` (solo se resube si cambian los requirements o la versión de Python).

El instalador **no empaqueta complementos ni el motor Python**: los complementos se cargan
del repo del marketplace, y el motor se descarga en el primer arranque de la app
(ventana de progreso con el rombo → `renderer/runtime-download.html`) hacia
`Documentos/ClipDock/Componentes/python-runtime`. La URL se configura en
`update-config.json` → bloque `runtime`.

### Velocidad del export

La **primera** exportación es lenta (descarga Python + paquetes pip + compila el NSIS con
~600 MB) — eso es normal. Las siguientes son mucho más rápidas gracias al caché en `.build/`:

- El runtime Python solo se reconstruye si cambia `engine/requirements.txt`
  (forzar: `set CLIPDOCK_REBUILD_RUNTIME=1`).
- `npm install` solo corre si cambió `package-lock.json`
  (forzar: `set CLIPDOCK_REBUILD_NODE=1`).
- pip reutiliza descargas desde `.build/cache/pip`.

La carpeta `.build/` es solo caché local: se puede borrar sin riesgo (solo vuelve lento
el siguiente export). El tiempo de **instalación** en la PC del usuario lo domina la
descompresión de los miles de archivos del runtime Python; es el costo de que el usuario
no necesite instalar nada aparte.

### Diseño del instalador (estilo G Hub)

`ClipDock_Setup_<version>.exe` es un build **portable** de la propia app: al abrirlo,
Electron define `PORTABLE_EXECUTABLE_FILE` y `main.js` entra en **modo instalador** —
una sola ventana con el rombo animado, botón INSTALAR y barra de progreso
(`renderer/setup.html` + `setup-preload.js`). Mientras el stub se desempaqueta,
se muestra `build/installerSplash.bmp`.

La instalación copia la app a `%LocalAppData%\Programs\ClipDock` (sin pedir
administrador, como Discord/G Hub), crea accesos directos de escritorio y menú
inicio, y registra la entrada de desinstalación en HKCU. Desinstalar ejecuta
`ClipDock.exe --uninstall` (quita accesos, registro y la carpeta; los archivos
del usuario en Documentos/ClipDock quedan intactos).
