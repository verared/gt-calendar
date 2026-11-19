# Especificación CALENDAR — Calendario Gerarion y motor multi-calendario

- **Estado:** Estable (normativo, matemática congelada) · **Versión:** 1.0.0 · **Línea base:** GUS v3.1.1
- **Edición consolidada:** [`../spec/gus-3.0.0.md`](../spec/gus-3.0.0.md) (§3–§4, Apéndice A) ·
  Se consolida aquí: [`../spec/CALENDAR-ENGINE.md`](../spec/CALENDAR-ENGINE.md)
- **Licencia:** CC-BY-4.0 · Mantenida por: verared contributors

## 1. Alcance

El calendario regular Gerarion (meses, Tempalum, eras `DY`/`AY`, semana
invariante) y el motor determinista de conversión con **10 sistemas
calendáricos externos** (fase GUTI-1). Todo pivota sobre `day_index`/JDN
con aritmética entera pura.

## 2. Reglas normativas

1. **Estructura:** 12 meses × 30 días (360) + Tempalum (mes 00) de 4 u 11
   días. Año común 364 = 52 semanas; Gran Tempalum 371 = 53 semanas.
2. **Origen:** `0000DY-01-01-S` ≡ **JDN 1.719.313** (21 de marzo de −5
   proléptico, año astronómico −5). Es una **época matemática fija,
   determinista y reproducible**, desacoplada de la historiografía
   (Apéndice A.4: un fork cambia el JDN base, nunca el algoritmo).
3. **Gran Tempalum simétrico (forma cerrada O(1)):** con `S = 1.242.190`
   µd y `U = 7.000.000` µd, para todo entero `year`:
   `r_y = ((year mod U)+U) mod U`; `r = (r_y × S) mod U`;
   `GT(year) ⟺ r + S ≥ U`. Módulos **euclidianos**, válidos en AY y DY;
   `year_start_day_index(year) = year×364 + 7×(q×S + floor(r_y×S/U))`.
4. **Duración media exacta:** `364 + 7·(1.242.190/7.000.000) = 365,24219`
   días (racional exacto, cociente racional 365,24219, sin flotantes).
5. **Deriva solar:** `|ysi(n) − n·L| < 7 días` para todo `n ∈ ℤ`
   (invariante del residuo euclidiano `R_n ∈ [0, U)`; demostración en el
   Apéndice A.2 y en `docs/papers/drift-acotado.md`).
6. **Invariancia semanal perpetua:** `364 ≡ 371 ≡ 0 (mod 7)`; el 1-1 de
   todo año cae en Soludyia; `weekday(d) = ((d mod 7)+7) mod 7`.
7. **Motor multi-calendario (10 sistemas):** gregoriano proléptico,
   juliano proléptico, egipcio vago, etíope, bahá'í (Badí'), cuenta larga
   maya, islámico civil tabular, hebreo aritmético (dehiyot en cascada,
   meses Adar I/II con numeración rabínica), chino lunisolar
   computacional (tabla determinista SHUO/ZHONGQI, meridiano de Pekín
   UTC+8, rango validado 1645–2650, años bisiestos `runyue`), más el
   núcleo Gerarion. Cada adaptador expone metadatos estructurados
   (`id`, `name`, `version`, `epoch_jdn`, `supported_range`,
   `astronomical_dependency`, `reference_meridian`, `known_limitations`)
   y operaciones bidireccionales (`from/to_day_index`, `from/to_instant`,
   `validate_date`).
8. **Separación de primitivas:** `Instant` (segundos int64 + `nanos`),
   `CalendarDate` (fecha proyectada) y `LocalTime` (presentación civil
   con offset `TCJ±O`) nunca se fusionan.
9. **Fuera de rango:** una fecha fuera del rango declarado de un
   calendario devuelve error explícito (`GERO_EUNSUPPORTED`),
   nunca una aproximación silenciosa.

## 3. Fuentes de verdad

| Plataforma | Implementación |
|---|---|
| Python | `src/gerarion/calendars/` (`engine.py` + `china_table.py`) |
| C11 | `impl-c/calendars/gerarion_calendars.c` + `china_table.c` |
| JavaScript | `web/engine/guti.mjs` + `web/engine/china-table.mjs` |

## 4. Vectores aplicables

- `vectors/guti-calendars-001.json` — 63.545 casos: conversiones
  cruzadas A→GUS→B y B→GUS→A, bordes de rango y entradas inválidas.
- `vectors/gus-normative-003.json` y `gus-regression-001.json` — núcleo
  AY/DY y Gran Tempalum.

## 5. Madurez y límites

- Matemática del núcleo **congelada** desde v3.0.0; `day_index` común de
  los vectores acotado a |di| ≤ 2⁴⁸−1 (límite de precisión del núcleo
  web); los extremos de plataforma se ejercen en suites nativas.
- Calendario chino: divergencia documentada ≤ 1 día en noches límite
  (1700/1751/1851/2050) frente a efemérides completas; tolerancia
  declarada en `CALENDAR-ENGINE.md`.
- Islámico civil: naturaleza tabular declarada; no sustituye la
  observación lunar local. Mayas: baktun negativo proléptico admitido
  con guardia de desbordamiento int64.

## 6. Referencias

- `docs/spec/CALENDAR-ENGINE.md` (ES/EN) y `docs/papers/drift-acotado.md`
- Apartado GUTI-1 de `docs/audit/AUDIT-REPORT-v3.0.0.md`.
