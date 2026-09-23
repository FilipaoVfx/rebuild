"""Fotos de campo (ADR-24): lo que entra, lo que no, y a que sitio se pega."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from uri.contracts.evidence import prohibited_columns
from uri.contracts.provenance import PUBLISHED_LAYER_TABLES
from uri.ingestion import field
from uri.ingestion.adapters import pereiramap
from uri.ingestion.registry import SOURCES

FIXTURE = Path(__file__).parent / "fixtures" / "pereiramap_rows.json"
ROWS = json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_parse_row_tipa_y_conserva_lo_que_la_ficha_necesita():
    obs = pereiramap.parse_row(ROWS[0])
    assert obs.observation_id == "24cd2ffa-f35d-42e6-af8f-35576bb8d98a"
    assert (obs.lon, obs.lat) == (-75.695, 4.815)
    assert obs.location_source == "DEVICE" and obs.accuracy_m == 12.0
    assert obs.exif_gps is True and obs.exif_device_offset_m == 88.0
    assert obs.review_status == "PENDIENTE" and obs.category == "DANO_ESTRUCTURAL"
    sin_categoria = pereiramap.parse_row(ROWS[1])
    assert sin_categoria.category is None and sin_categoria.heading_deg == 123.5


@pytest.mark.parametrize(
    ("patch", "razon"),
    [
        ({"review_status": "RECHAZADA"}, "review_status"),
        ({"category": "GRAFFITI"}, "categoria"),
        ({"lon": 75.695}, "fuera de la caja"),
        ({"lat": 0, "lon": 0}, "fuera de la caja"),
        ({"image_sha256": "abc"}, "hex"),
        ({"image_path": "otro/full.jpg"}, "rutas"),
        ({"location_source": "GUESS"}, "location_source"),
        ({"captured_at": "ayer"}, "fecha"),
    ],
)
def test_parse_row_rechaza_lo_que_no_es_lo_que_dice_ser(patch, razon):
    with pytest.raises(pereiramap.FieldRowRejected, match=razon):
        pereiramap.parse_row({**ROWS[0], **patch})


def test_las_columnas_de_la_vista_no_traen_datos_personales():
    """La vista publica no expone device_id ni nada que el diccionario prohiba."""
    assert "device_id" not in ROWS[0]
    assert prohibited_columns(list(ROWS[0])) == []


def test_download_verifica_el_hash_y_descarta_lo_que_no_coincide(tmp_path, monkeypatch):
    jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 64 + b"\xff\xd9"
    served: dict[str, bytes] = {}
    good = pereiramap.parse_row({**ROWS[0], "image_sha256": hashlib.sha256(jpeg).hexdigest()})
    bad = pereiramap.parse_row(ROWS[1])  # sha de ceros: nunca coincide
    for obs in (good, bad):
        served[pereiramap.image_url("https://x", obs.image_path)] = jpeg
        served[pereiramap.image_url("https://x", obs.thumb_path)] = jpeg

    def fake_get(url: str, target: Path, timeout: float) -> None:
        target.write_bytes(served[url])

    monkeypatch.setattr(pereiramap, "_get", fake_get)
    ok, rejected = pereiramap.download_images("https://x", [good, bad], dest=tmp_path)
    assert [o.observation_id for o in ok] == [good.observation_id]
    assert "sha256" in rejected[bad.observation_id]
    assert (tmp_path / good.observation_id / "full.jpg").read_bytes() == jpeg
    assert (tmp_path / good.observation_id / "thumb.jpg").exists()
    assert not (tmp_path / bad.observation_id / "full.jpg").exists()


def test_la_fuente_esta_registrada_y_la_tabla_pasa_por_la_puerta():
    src = next(s for s in SOURCES if s.source_id == "pereiramap")
    assert src.license_class.name == "ATTRIBUTION" and src.redistribution_allowed
    assert src.terms_snapshot_path.endswith("pereiramap_20260919.txt")
    assert "rebuild_core.field_observation" in PUBLISHED_LAYER_TABLES


def test_configured_exige_url_https_y_clave(monkeypatch):
    monkeypatch.delenv(pereiramap.ENV_URL, raising=False)
    monkeypatch.delenv(pereiramap.ENV_KEY, raising=False)
    assert pereiramap.configured() is None
    monkeypatch.setenv(pereiramap.ENV_URL, "http://inseguro")
    monkeypatch.setenv(pereiramap.ENV_KEY, "k")
    assert pereiramap.configured() is None
    monkeypatch.setenv(pereiramap.ENV_URL, "https://p.supabase.co/")
    assert pereiramap.configured() == ("https://p.supabase.co", "k")


@pytest.fixture
def loaded(db_conn):
    from uri.db import fetch_one

    row = fetch_one(db_conn, "SELECT count(*) AS n FROM rebuild_core.site")
    if not row or row["n"] == 0:
        pytest.skip("sin pipeline ejecutado: corra scripts/run_pipeline.py")
    return db_conn


def test_el_enlace_toma_el_sitio_mas_cercano_a_75_m_y_declara_los_sueltos(loaded):
    """Una foto encima de un sitio se enlaza a el; una a 2 km queda sin sitio
    y sale en la alerta FIELD_UNLINKED. Todo dentro de una transaccion que
    se deshace: la base queda como estaba."""
    from uri.db import fetch_all, fetch_one

    conn = loaded
    site = fetch_one(
        conn,
        "SELECT site_id, ST_X(centroid) AS lon, ST_Y(centroid) AS lat FROM rebuild_core.site "
        "ORDER BY site_id LIMIT 1",
    )
    version = fetch_one(conn, "SELECT min(data_version) AS v FROM rebuild_core.dataset_version")
    version = version["v"]
    before = fetch_all(conn, "SELECT observation_id FROM rebuild_core.field_observation")
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM rebuild_core.field_observation")
            for oid, lon, lat in (
                ("11111111-1111-4111-8111-111111111111", site["lon"], site["lat"]),
                ("22222222-2222-4222-8222-222222222222", site["lon"] + 0.02, site["lat"]),
            ):
                cur.execute(
                    """
                    INSERT INTO rebuild_core.field_observation (
                        observation_id, captured_at, received_at, location_source, review_status,
                        image_path, thumb_path, image_sha256, width, height, geometry, data_version
                    ) VALUES (%s, now(), now(), 'DEVICE', 'PENDIENTE', %s, %s, repeat('a', 64),
                              100, 100, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s)
                    """,
                    (oid, f"{oid}/full.jpg", f"{oid}/thumb.jpg", lon, lat, version),
                )
        stats = field.link_field_observations(conn)
        assert stats == {"total": 2, "linked": 1, "unlinked": 1}
        linked = fetch_one(
            conn,
            "SELECT site_id, site_distance_m FROM rebuild_core.field_observation "
            "WHERE observation_id = '11111111-1111-4111-8111-111111111111'",
        )
        assert linked["site_id"] == site["site_id"]
        assert float(linked["site_distance_m"]) <= field.FIELD_LINK_M
        alert = fetch_one(
            conn, "SELECT payload FROM rebuild_core.quality_alert WHERE code = 'FIELD_UNLINKED'"
        )
        assert alert["payload"]["unlinked"] == 1
    finally:
        conn.rollback()
    after = fetch_all(conn, "SELECT observation_id FROM rebuild_core.field_observation")
    assert after == before
