# REBUILD · por qué (30 s)

Pieza de 30 s, sin voz ni audio, sobre la razón de ser del proyecto. No muestra el
software. Cuenta un insight: **la ciudad que el sismo dañó se construyó para otra
gente, y reconstruirla igual sería reconstruir una ciudad que ya no existe.**

| Tiempo | Qué se ve | Qué se dice |
|---|---|---|
| 0–5 s | El relieve real del sector de estudio, vacío | Una ciudad se construye para la gente de su tiempo |
| 5–12,6 s | La ciudad aparece por época: lo urbanizado hasta 1985 de golpe, en ámbar; después, año a año hasta 2015 | Casi 6 de cada 10 edificios están sobre suelo que ya era ciudad en 1985 |
| 12,6–18,6 s | Por celda de 300 m: niños de 0 a 9 años frente a personas de 70 o más | 13 mayores de 70 por cada 10 niños donde la ciudad es de antes de 1985; 4 donde es de después de 2000 |
| 18,6–23,2 s | El sismo: la onda llega desde el oeste y se encienden los daños observados | 9 de cada 10 daños observados están en suelo que ya era ciudad en 1985 |
| 23,2–27,6 s | La ciudad se apaga | Reconstruir lo mismo es reconstruir una ciudad que ya no existe. Hoy, cada sector necesita otra cosa |
| 27,6–30 s | Cierre | Hay que saber qué construir. Y dónde. |

## De dónde salen las cifras

`prepare_data.py` las calcula y las deja en `public/porque.json` (incluido en el
repositorio):

| Cifra | Cálculo | Fuente |
|---|---|---|
| 57,8 % de los edificios ("casi 6 de cada 10") | Huellas del sector de estudio con año de urbanización ≤ 1985, sobre las 5.102 de 6.386 que tienen año | Microsoft Building Footprints × WSF Evolution |
| 91 % de los daños ("9 de cada 10") | Observaciones con año ≤ 1985, sobre las 177 de 182 que tienen año | Copernicus EMS EMSR916 × WSF Evolution |
| 13,3 y 4,3 mayores de 70 por cada 10 niños | Manzanas del censo agrupadas por la época de su suelo: hasta 1985 (104.780 personas) y 2000–2015 (21.948) | DANE CNPV 2018 × WSF Evolution |

**Límites, dichos también en pantalla:**
- La época es el año en que el suelo aparece urbanizado (World Settlement Footprint
  Evolution, DLR, Landsat, 30 m; "1985" significa en 1985 o antes). No es el año de
  construcción de cada edificio: el catastro de AMCO lo tiene, pero no está
  publicado (`docs/plan/antiguedad-de-la-edificacion.md`).
- Las edades son del censo de 2018. Los grupos de edad no son simétricos (0–9 frente
  a 70 o más) y se dicen tal cual.
- Que el daño se concentre en la ciudad más antigua es una coincidencia espacial
  observada, no una causa demostrada. Ahí está también el centro, donde Copernicus
  concentró su observación.
- El censo se muestra agregado en una malla de 300 m, con celdas de 100 personas o
  más: nunca una manzana suelta (FR-PII-03).
- El relieve está exagerado 1,5 veces y la altura de los edificios es esquemática.

WSF Evolution está bajo licencia CC BY 4.0 (© DLR). Los créditos completos, con el
aviso del Copernicus DEM, cierran la pieza.

## Cómo se regenera

```bash
curl -O https://download.geoservice.dlr.de/WSF_EVO/files/WSFevolution_v1_-76_4.tif
python3 prepare_data.py --wsf WSFevolution_v1_-76_4.tif --data <paquete-estatico>/data
npm ci && npm run build && cp -r dist <paquete-estatico>/porque
python3 render_frames.py --url http://127.0.0.1:8816/porque/index.html \
    --frames /ruta/fotogramas --out rebuild-por-que-30s.mp4 [--max 450]
```
