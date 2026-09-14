#!/usr/bin/env bash
# Arranca la API y el visor en desarrollo.
#
# `stop` mata el proceso que escucha en el puerto, no el PID del envoltorio:
# un setsid deja el PID del lanzador, no el de uvicorn, y matar ese deja el
# servidor viejo sirviendo codigo viejo — un fallo silencioso que se lee como
# "mi cambio no hizo efecto".
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-8099}

stop() {
    fuser -k -TERM "${PORT}/tcp" 2>/dev/null || true
    sleep 1
    fuser -k -KILL "${PORT}/tcp" 2>/dev/null || true
}

case "${1:-run}" in
    stop)
        stop
        echo "detenido (puerto $PORT)"
        ;;
    restart)
        stop
        shift
        exec "$0" run "$@"
        ;;
    *)
        export PYTHONPATH=src
        exec .venv/bin/uvicorn uri.api.app:app --host 127.0.0.1 --port "$PORT"
        ;;
esac
