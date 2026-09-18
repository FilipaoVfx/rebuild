#!/usr/bin/env python3
"""Descarga y archiva las capas del SIG de la Alcaldía de Pereira con licencia.

Manual y con red, como `fetch_terrain.py`: el pipeline y CI leen el extracto
archivado en `db/seed/`, nunca el servicio. Refrescarlo es publicar una
`data_version` nueva, no editar la anterior.

Solo las capas de `pereira_sig` (equipamientos y espacio publico), que
declaran licencia en su ficha. Antes de escribir un byte pasa por el control
C1: si alguien reclasifica la fuente a UNCLEAR, este script deja de archivar.
"""

from __future__ import annotations

import gzip
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from uri.ingestion import loader  # noqa: E402
from uri.ingestion.adapters import pereira_sig  # noqa: E402


def main() -> int:
    loader.assert_source_usable(pereira_sig.SOURCE_ID)
    for layer in pereira_sig.LAYERS:
        print(f"{layer.key}: {layer.url}")
        collection = pereira_sig.fetch_layer(layer)
        collection["retrieved_at"] = datetime.now(UTC).isoformat()
        destino = loader.SEED / layer.seed
        with gzip.open(destino, "wt", encoding="utf-8") as handle:
            json.dump(collection, handle, ensure_ascii=False, separators=(",", ":"))
        print(
            f"   {len(collection['features'])} features -> {destino.relative_to(ROOT)} "
            f"({destino.stat().st_size / 1024:.0f} KB)"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
