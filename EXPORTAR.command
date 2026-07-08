#!/bin/bash
cd "$(dirname "$0")"
clear
printf '\033]0;Exportar ClipDock\007'
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] No encontre Node.js en esta Mac de desarrollo."
  echo "Instala Node.js LTS. El usuario final no lo necesitara."
  read -n 1 -s -r -p "Presiona cualquier tecla para cerrar..."
  exit 1
fi
node "build-tools/exportar.js"
ERR=$?
echo
read -n 1 -s -r -p "Presiona cualquier tecla para cerrar..."
exit $ERR
