# SPDX-License-Identifier: MIT OR Apache-2.0
# SPDX-FileCopyrightText: 2026 verared contributors
"""Motor multi-calendario determinista de Gerarion (fase GUTI-1).

Diez sistemas calendáricos que pivotan sobre `day_index`/`JDN`, con
aritmética ENTERA pura (sin `float` ni `Intl`): la paridad bit a bit con
`impl-c/gerarion_calendars.c` y `web/calendars.mjs` se demuestra con
`vectors/guti-calendars-001.json` y los corredores de las tres
implementaciones.

Separación estricta de las tres primitivas (Cap 13.1 GUS 3.0.0):

- `Instant`: segundos int64 + `nanos` separado (nunca fusionados).
- `CalendarDate`: fecha proyectada en un sistema (campos enteros).
- `LocalTime`: presentación civil con offset `TCJ±O` (escala de tiempo,
  no una fecha).

La ÚNICA parte no entera del motor es la GENERACIÓN de la tabla china
(`tools/generate_china_table.py`, efemérides Meeus truncadas en el
meridiano de Pekín); el motor en ejercito consume SOLO la tabla de
enteros generada (`china_table.po` de cada lenguaje): determinismo en
los tres lenguajes garantizado por dato, no por punto flotante.
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass, field as dc_field
from typing import Dict, List, Optional, Tuple

from ..core import calendar as cal
from . import china_table

GERO_ERANGE = "GERO_ERANGE"
GERO_EINVAL = "GERO_EINVAL"

SECS_PER_DAY = 86400
TCJ_OFFSET_DEFAULT = 8400  # TCJ = TAI + 8.400 s (congelado)

# --- estructura canónica de la fecha de un sistema -------------------------


@dataclass(frozen=True)
class CalendarDate:
    """Fecha proyectada en un sistema: campos enteros canónicos.

    `fields` respeta el orden declarado en los metadatos del sistema
    (`field_names`). `canonical` es la representación textual de la
    implementación de referencia (solo presentación).
    """

    system: str
    fields: Tuple[int, ...] = dc_field(default=())
    canonical: str = ""

    def get(self, name_index: int) -> int:
        return self.fields[name_index]


@dataclass(frozen=True)
class LocalTime:
    """Presentación civil local: hora del día y offset TCJ aplicado."""

    hour: int
    minute: int
    second: int
    nanos: int
    offset_seconds: int


# --- metadatos -------------------------------------------------------------

METADATA: List[dict] = [
    {
        "id": "gus",
        "name": "Gerarion (DY/AY)",
        "version": "3.0.1",
        "type": "proleptic-pure-solar",
        "epoch_jdn": 1719313,
        "supported_range": ["0000DY-01-01-S", "±2.51e16 años (GERO_ERANGE en C)"],
        "astronomical_dependency": "ninguna (aritmética entera cerrada)",
        "reference_meridian": "Jerusalén (TCJ = TAI + 8.400 s)",
        "known_limitations": [
            "la recurrencia simétrica AY/DY es definición normativa, no observación",
        ],
        "field_names": ["year", "month", "day"],
    },
    {
        "id": "greg",
        "name": "Gregoriano proléptico",
        "version": "1.0.0",
        "type": "proleptic-solar",
        "epoch_jdn": 1721060,
        "supported_range": ["año -4712", "año ±2.5e16 (límite int64 en C)"],
        "astronomical_dependency": "ninguna (regla de bisiesto entera)",
        "reference_meridian": "sin hora (fecha pura)",
        "known_limitations": [
            "años negativos con numeración astronómica (no hay año 0 en el uso histórico; aquí -1 = 2 a.C.)",
        ],
        "field_names": ["year", "month", "day"],
    },
    {
        "id": "julian",
        "name": "Juliano proléptico",
        "version": "1.0.0",
        "type": "proleptic-solar",
        "epoch_jdn": 1721424,
        "supported_range": ["año ±2.5e16 (límite int64 en C)"],
        "astronomical_dependency": "ninguna (bisiesto cada 4 años exacto)",
        "reference_meridian": "sin hora (fecha pura)",
        "known_limitations": [
            "no aplica la corrección gregoriana (el desfase crece 1 día cada ~128 años)",
        ],
        "field_names": ["year", "month", "day"],
    },
    {
        "id": "egyptian",
        "name": "Egipcio antiguo (año vago)",
        "version": "1.0.0",
        "type": "proleptic-fixed-solar",
        "epoch_jdn": 1448638,
        "supported_range": ["año I Nabonassar (747 a.C.)", "sin límite práctico"],
        "astronomical_dependency": "ninguna (año vago: 12×30 + 5 epagómenos)",
        "reference_meridian": "Alejandría (histórico)",
        "known_limitations": [
            "el año vago deriva respecto de las estaciones (1 día cada 4 años)",
            "los 5 epagómenos se exponen como mes 13",
        ],
        "field_names": ["year", "month", "day"],
    },
    {
        "id": "ethiopic",
        "name": "Etíope (Amete Mihrêt)",
        "version": "1.0.0",
        "type": "proleptic-solar",
        "epoch_jdn": 1724221,
        "supported_range": ["año ±10^6"],
        "astronomical_dependency": "ninguna (12×30 + Pagume 5/6, bisiesto año%4==3)",
        "reference_meridian": "Adís Abeba (histórico)",
        "known_limitations": [
            "variante Amete Mihret; Amete Alem desplazada 5.500 años",
        ],
        "field_names": ["year", "month", "day"],
    },
    {
        "id": "bahai",
        "name": "Bahá'í (Badí', tabular)",
        "version": "1.0.0",
        "type": "solar-tabular",
        "epoch_jdn": 2394647,
        "supported_range": ["1 B.E. (1844 d.C.)", "año 10000 B.E."],
        "astronomical_dependency": "ninguna en la variante tabular (alineación gregoriana)",
        "reference_meridian": "Tehrán (canonicalización astronómica; el BADÍ' oficial usa el meridiano de Teherán desde 2015 — la variante tabular alinea con el 21 de marzo gregoriano)",
        "known_limitations": [
            "variante TABULAR alineada al gregoriano; el calendario oficial astronomía-teherán difiere en años límite",
            "Ayyám-i-Há se expone como mes 0",
        ],
        "field_names": ["year", "month", "day"],
    },
    {
        "id": "maya",
        "name": "Cuenta Larga Maya",
        "version": "1.0.0",
        "type": "proleptic-arithmetical",
        "epoch_jdn": 584283,
        "supported_range": ["baktun 0..19 en el rango representable (13.0.0.0.0 = 2012-12-21 greg)"],
        "astronomical_dependency": "ninguna (correlación GMT 584283)",
        "reference_meridian": "sin hora (cuenta de días)",
        "known_limitations": [
            "correlación GMT/584283 (Goodman-Martínez-Thompson); correlaciones alternativas desplazan la cuenta",
            "baktun expone de 0 a 19 y sigue contando (no reinicia en 13)",
        ],
        "field_names": ["baktun", "katun", "tun", "uinal", "kin"],
    },
    {
        "id": "islamic",
        "name": "Islámico civil (tabular)",
        "version": "1.0.0",
        "type": "lunar-tabular",
        "epoch_jdn": 1948440,
        "supported_range": ["1 AH (622 d.C.)", "sin límite práctico"],
        "astronomical_dependency": "ninguna (ciclo tabular de 30 años, bisiestos {2,5,7,10,13,16,18,21,24,26,29})",
        "reference_meridian": "sin hora",
        "known_limitations": [
            "NATURALEZA TABULAR/CIVIL: puede diferir 1-2 días del avistamiento lunar local (hilal) o del calendario lunar de observación de cualquier país",
        ],
        "field_names": ["year", "month", "day"],
    },
    {
        "id": "hebrew",
        "name": "Hebreo (aritmético)",
        "version": "1.0.0",
        "type": "lunisolar-arithmetical",
        "epoch_jdn": 347998,
        "supported_range": ["AM 1 (−3761 d.C. proléptico)", "AM 9999"],
        "astronomical_dependency": "ninguna en tiempo de ejecución (molad BaHaRaD + dehiyot, ciclo metónico de 19 años — aritmética de halakim entera)",
        "reference_meridian": "Jerusalén (histórico; el algoritmo clásico ya lo fija)",
        "known_limitations": [
            "numeración rabínica: mes 1 = Nisan y 7 = Tishri; en años bisiestos 12 = Adar I y 13 = Adar II",
            "el calendario OFICIAL de Israel depende de la observación/avistamiento histórico; esta variante es el algoritmo clásico determinista",
        ],
        "field_names": ["year", "month", "day"],
    },
    {
        "id": "chinese",
        "name": "Chino lunisolar (computacional)",
        "version": "1.0.0",
        "type": "lunisolar-astronomical",
        # Año Nuevo chino de 1645 (primer día del año 1645 en la tabla):
        # JDN 2319912 = 28-01-1645 gregoriano.
        "epoch_jdn": 2319912,
        "supported_range": ["1645 d.C.", "2650 d.C. tras la reforma Shixian"],
        "astronomical_dependency": "lunas nuevas (shuo) y 12 términos principales (zhongqi) en el meridiano de Pekín (UTC+8, 120°E), calculados con efemérides truncadas al generar `china_table` (herramienta offline, sin red); el motor en ejercito consume solo enteros tablados",
        "reference_meridian": "Pekín: UTC+8 / 120°E",
        "known_limitations": [
            "rango validado STRICTO: 1645–2650 d.C. (fuera: GERO_EUNSUPPORTED, nunca extrapolación)",
            "modelo polinómico truncado (±2 min de efemérides completas); en noches límite puede diferir de las tablas oficiales históricas (Shixian de la correspondiente época)",
            "etiquetado de ciclo sexagenário (nam'#gan#zhi) disponible como presentación, no forma parte de la fecha",
        ],
        "field_names": ["year", "month", "day", "leap"],
    },
]

BY_ID = {m["id"]: m for m in METADATA}


def metadata(system_id: str) -> dict:
    try:
        return BY_ID[system_id]
    except KeyError:
        raise ValueError(f"GERO_EINVAL: sistema desconocido: {system_id!r}") from None


def system_ids() -> List[str]:
    return [m["id"] for m in METADATA]


# =========================================================================
# 1. GUS (núcleo congelado v3.0.0) y 2. Gregoriano proléptico — ya están
# verificados en calendar.py; aquí SOLO se adaptan a la interfaz común.
# =========================================================================


def _gus_from_di(di: int) -> CalendarDate:
    g = cal.to_gerarion(di)
    return CalendarDate("gus", (g.year, g.month, g.day), g.canonical())


def _gus_to_di(f):  # f: dict {year, month, day}
    g = cal.from_gerarion(f["year"], f["month"], f["day"])
    return g.day_index


def _greg_from_di(di: int) -> CalendarDate:
    y, m, d = cal.gregorian_from_day_index(di)
    return CalendarDate("greg", (y, m, d), f"{y:04d}-{m:02d}-{d:02d}")


_GREG_MONTH_DAYS = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)


def _greg_validate(y: int, m: int, d: int) -> None:
    """Validación estricta: una fecha civil imposible se rechaza, jamás se
    normaliza a otra fecha (Cap 4 GUS 3.0.0)."""
    if not 1 <= m <= 12:
        raise ValueError("GERO_EINVAL: mes gregoriano fuera de 1..12")
    maxd = _GREG_MONTH_DAYS[m - 1]
    if m == 2 and (y % 4 == 0) and (y % 100 != 0 or y % 400 == 0):
        maxd = 29
    if not 1 <= d <= maxd:
        raise ValueError("GERO_EINVAL: fecha gregoriana imposible")


def _greg_to_di(f):
    y, m, d = f["year"], f["month"], f["day"]
    _greg_validate(y, m, d)
    return cal.day_index_from_gregorian(y, m, d)


# =========================================================================
# 3. Juliano proléptico (época JDN 1721424 = 1-1-1 juliano)
# =========================================================================


def _julian_from_di(di: int) -> CalendarDate:
    jdn = di + 1719313
    c = jdn + 32082
    d = (4 * c + 3) // 1461
    e = c - (1461 * d) // 4
    m = (5 * e + 2) // 153
    day = e - (153 * m + 2) // 5 + 1
    month = m + 3 - 12 * (m // 10)
    year = d - 4800 + m // 10
    return CalendarDate("julian", (year, month, day), f"{year:04d}-{month:02d}-{day:02d}")


def _julian_to_di(f):
    y, m, d = f["year"], f["month"], f["day"]
    if not 1 <= m <= 12:
        raise ValueError("GERO_EINVAL: mes juliano fuera de 1..12")
    _MONTH_DAYS_JULIAN = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
    maxd = _MONTH_DAYS_JULIAN[m - 1]
    if m == 2 and y % 4 == 0:  # bisiesto juliano (Python: % con floor)
        maxd = 29
    if not 1 <= d <= maxd:
        raise ValueError("GERO_EINVAL: día juliano inválido para el mes")
    a = (14 - m) // 12
    yy = y + 4800 - a
    mm = m + 12 * a - 3
    jdn = d + (153 * mm + 2) // 5 + 365 * yy + yy // 4 - 32083
    return jdn - 1719313


def _is_julian_leap(year: int) -> bool:
    return year % 4 == 0


# =========================================================================
# 4. Egipcio antiquo — año vago (época Nabonassar, JDN 1448638)
# =========================================================================

_EGYPTIAN_EPOCH = 1448638


def _egyptian_from_di(di: int) -> CalendarDate:
    days = di + 1719313 - _EGYPTIAN_EPOCH
    year = days // 365 + 1
    doy = days % 365
    if doy < 360:
        month, day = doy // 30 + 1, doy % 30 + 1
    else:
        month, day = 13, doy - 360 + 1  # epagómenos como mes 13
    return CalendarDate("egyptian", (year, month, day), f"{year:04d}-{month:02d}-{day:02d}")


def _egyptian_to_di(f):
    y, m, d = f["year"], f["month"], f["day"]
    if not 1 <= m <= 13:
        raise ValueError("GERO_EINVAL: mes egipcio fuera de 1..13")
    if not 1 <= d <= (5 if m == 13 else 30):
        raise ValueError("GERO_EINVAL: día egipcio inválido")
    return (_EGYPTIAN_EPOCH + (y - 1) * 365 + (m - 1) * 30 + (d - 1)) - 1719313


# =========================================================================
# 5. Etíope (Amete Mihrêt, época JDN 1724221)
# =========================================================================

_ETHIOPIC_EPOCH = 1724221


def _ethiopic_leap(year: int) -> bool:
    return year % 4 == 3


def _ethiopic_jdn_of_1_1(year: int) -> int:
    # Mäskäräm 1 del año; ciclo juliano de 1461 días, correcto en años negativos.
    # El salto bisiesto (+366) se produce ANTES de los años múltiplos de 4,
    # de modo que el año con Pagume de 6 días es year % 4 == 3.
    return _ETHIOPIC_EPOCH + 365 * (year - 1) + year // 4


def _ethiopic_year_of(jdn: int) -> int:
    """Inversa exacta del ciclo juliano de 1.461 días, O(1) para cualquier
    JDN int64 (la estimación por /365 diverge en horizontes grandes)."""
    N = jdn - _ETHIOPIC_EPOCH
    q, r = divmod(N, 1461)
    return 4 * q + (4 * r + 1463) // 1461


def _ethiopic_from_di(di: int) -> CalendarDate:
    jdn = di + 1719313
    year = _ethiopic_year_of(jdn)
    while _ethiopic_jdn_of_1_1(year) > jdn:
        year -= 1
    while _ethiopic_jdn_of_1_1(year + 1) <= jdn:
        year += 1
    doy = jdn - _ethiopic_jdn_of_1_1(year)
    if doy < 360:
        month, day = doy // 30 + 1, doy % 30 + 1
    else:
        month, day = 13, doy - 360 + 1  # Pagume
    return CalendarDate("ethiopic", (year, month, day), f"{year:04d}-{month:02d}-{day:02d}")


def _ethiopic_to_di(f):
    y, m, d = f["year"], f["month"], f["day"]
    if not 1 <= m <= 13:
        raise ValueError("GERO_EINVAL: mes etíope fuera de 1..13")
    if m == 13:
        maxd = 6 if _ethiopic_leap(y) else 5
        if not 1 <= d <= maxd:
            raise ValueError("GERO_EINVAL: Pagume inválido")
    elif not 1 <= d <= 30:
        raise ValueError("GERO_EINVAL: día etíope fuera de 1..30")
    return _ethiopic_jdn_of_1_1(y) + (m - 1) * 30 + (d - 1) - 1719313


# =========================================================================
# 6. Bahá'í (Badí' TABULAR alineado al gregoriano, época JDN 2394647)
# =========================================================================

_BAHAI_EPOCH = 2394647
_BAHAI_GREG_Y0 = 1844  # año gregoriano de Naw-Rúz 1 B.E.


def _greg_jdn(y: int, m: int, d: int) -> int:
    return 1719313 + cal.day_index_from_gregorian(y, m, d)


def _is_greg_leap(y: int) -> bool:
    return (y % 4 == 0) and (y % 100 != 0 or y % 400 == 0)


def _bahai_nawruz(year_be: int) -> int:
    return _greg_jdn(_BAHAI_GREG_Y0 - 1 + year_be, 3, 21)


def _bahai_year_of(jdn: int) -> int:
    greg_year = cal.gregorian_from_day_index(jdn - 1719313)[0]
    if jdn < _bahai_nawruz(greg_year - _BAHAI_GREG_Y0 + 1):
        greg_year -= 1
    return greg_year - _BAHAI_GREG_Y0 + 1


def _bahai_from_di(di: int) -> CalendarDate:
    jdn = di + 1719313
    year = _bahai_year_of(jdn)
    doy = jdn - _bahai_nawruz(year)
    ayyam = 5 if _is_greg_leap(_BAHAI_GREG_Y0 + year) else 4
    if doy < 342:  # meses 1..18 de 19 días
        month, day = doy // 19 + 1, doy % 19 + 1
    elif doy < 342 + ayyam:  # Ayyám-i-Há → mes 0
        month, day = 0, doy - 342 + 1
    else:  # mes 19 (‘Alá’)
        month, day = 19, doy - 342 - ayyam + 1
    return CalendarDate("bahai", (year, month, day), f"{year:04d}-{month:02d}-{day:02d}")


def _bahai_to_di(f):
    y, m, d = f["year"], f["month"], f["day"]
    ayyam = 5 if _is_greg_leap(_BAHAI_GREG_Y0 + y) else 4
    if m == 0:
        if not 1 <= d <= ayyam:
            raise ValueError(f"GERO_EINVAL: Ayyám-i-Há tiene {ayyam} días en {y} B.E.")
        doy = 342 + d - 1
    elif 1 <= m <= 18:
        if not 1 <= d <= 19:
            raise ValueError("GERO_EINVAL: día Badí' fuera de 1..19")
        doy = (m - 1) * 19 + d - 1
    elif m == 19:
        if not 1 <= d <= 19:
            raise ValueError("GERO_EINVAL: día Badí' fuera de 1..19")
        doy = 342 + ayyam + d - 1
    else:
        raise ValueError("GERO_EINVAL: mes Badí' fuera de 0..19 (0 = Ayyám-i-Há)")
    return _bahai_nawruz(y) + doy - 1719313


# =========================================================================
# 7. Cuenta Larga Maya (correlación GMT, época JDN 584283)
# =========================================================================

_MAYA_EPOCH = 584283


def _maya_from_di(di: int) -> CalendarDate:
    days = di + 1719313 - _MAYA_EPOCH
    kin = days % 20
    uinal = (days // 20) % 18
    tun = (days // 360) % 20
    katun = (days // 7200) % 20
    baktun = days // 144000  # sigue contando (no reinicia en 13)
    canon = f"{baktun}.{katun}.{tun}.{uinal}.{kin}"
    return CalendarDate("maya", (baktun, katun, tun, uinal, kin), canon)


def _maya_to_di(f):
    b, k, t, u, n = (f[x] for x in ("baktun", "katun", "tun", "uinal", "kin"))
    # baktun puede ser negativo (proléptico); el resto son grupos finitos.
    if k > 19 or t > 19 or u > 17 or n > 19:
        raise ValueError("GERO_EINVAL: cuenta larga fuera de rango (uinal < 18)")
    if min(k, t, u, n) < 0:
        raise ValueError("GERO_EINVAL: cuenta larga fuera de rango (uinal < 18)")
    if abs(b) > (2**63 - 1) // 144000:
        raise ValueError("GERO_ERANGE: baktun fuera del horizonte int64")
    return _MAYA_EPOCH + b * 144000 + k * 7200 + t * 360 + u * 20 + n - 1719313


# =========================================================================
# 8. Islámico civil tabular (ciclo de 30 años, época JDN 1948440)
# =========================================================================

_ISLAMIC_EPOCH = 1948440
_ISLAMIC_LEAP = {2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29}


def _islamic_is_leap(year: int) -> bool:
    return year % 30 in _ISLAMIC_LEAP


def _islamic_leap_in_range(y0: int, y1: int) -> int:
    """Bisiestos tabulares en el rango de años [y0, y1] (exclusivo y1)."""
    return sum(1 for y in range(y0, y1) if y % 30 in _ISLAMIC_LEAP)


def _islamic_start(year: int) -> int:
    # days from 1 AH: 354 por año + bisiestos acumulados (por bloques de 30)
    cycles = (year - 1) // 30
    rem = (year - 1) % 30
    return (cycles * 10631 + rem * 354
            + _islamic_leap_in_range(1, rem + 1) + 1) - 1
    # devuelve days desde la época para el 1-1 del año


def _islamic_from_di(di: int) -> CalendarDate:
    days = di + 1719313 - _ISLAMIC_EPOCH
    year_est = days * 30 // 10631 + 1
    while _islamic_start(year_est) > days:
        year_est -= 1
    while _islamic_start(year_est + 1) <= days:
        year_est += 1
    doy = days - _islamic_start(year_est)
    leap = year_est % 30 in _ISLAMIC_LEAP
    month, cum = 1, 0
    for m in range(1, 13):
        L = 30 if m % 2 == 1 else 29
        if m == 12 and leap:
            L = 30
        if doy < cum + L:
            month, day = m, doy - cum + 1
            break
        cum += L
    else:
        raise ValueError("GERO_EINVAL: día islámico fuera de rango")
    return CalendarDate("islamic", (year_est, month, day), f"{year_est:04d}-{month:02d}-{day:02d}")


def _islamic_to_di(f):
    y, m, d = f["year"], f["month"], f["day"]
    if not 1 <= m <= 12:
        raise ValueError("GERO_EINVAL: mes islámico fuera de 1..12")
    leap = y % 30 in _ISLAMIC_LEAP
    maxd = 30 if m % 2 == 1 else 29
    if m == 12 and leap:
        maxd = 30
    if not 1 <= d <= maxd:
        raise ValueError("GERO_EINVAL: día islámico inválido")
    doy = sum(30 if mm % 2 == 1 else 29 for mm in range(1, m))
    return _ISLAMIC_EPOCH + _islamic_start(y) + doy + (d - 1) - 1719313


# =========================================================================
# 9. Hebreo aritmético (molad BaHaRaD + dehiyot; época JDN 347998)
# =========================================================================

_HEBREW_EPOCH = 347998  # Tishrei 1, AM 1 (7 d.C. proléptico juliano)
_HALAKIM_PER_HOUR = 1080
_HALAKIM_PER_DAY = 25920
_MOLAD_TOHU = 2 * _HALAKIM_PER_DAY + 5 * _HALAKIM_PER_HOUR + 204  # BaHaRaD
_weeks_per_month = 29 * _HALAKIM_PER_DAY + 12 * _HALAKIM_PER_HOUR + 793  # 765.433
_HEB_BASE = 347996  # BaHaRaD = día del molad 2; AM 1 = Tishri 1 = JDN 347998

# nombres de meses civil (1 = Tishrei ... 12/13 = Elul); presentación
HEBREW_MONTHS = [
    "Tishrei", "Heshvan", "Kislev", "Tevet", "Shevat",
    "Adar I", "Adar II", "Nisan", "Iyar", "Sivan", "Tammuz", "Av", "Elul",
]


def _heb_months_elapsed(year: int) -> int:
    return (235 * year - 234) // 19


def _heb_molad_period(year: int) -> int:
    """Días (distancia desde la época) del molad de Tishrei del año, entero."""
    m = _heb_months_elapsed(year)
    return (_MOLAD_TOHU + m * _weeks_per_month) // _HALAKIM_PER_DAY


def _heb_molad_parts(year: int) -> Tuple[int, int]:
    """(period días, halakim del día) del molad de Tishrei."""
    parts = _MOLAD_TOHU + _heb_months_elapsed(year) * _weeks_per_month
    return parts // _HALAKIM_PER_DAY, parts % _HALAKIM_PER_DAY


def _heb_rosh_hashanah(year: int) -> int:
    """JDN de Tishrei 1 del año AM dado (molad BaHaRaD + 4 dehiyot).

    JDN 0 es lunes. La cuenta de días del molad arranca en BaHaRaD
    (2d 5h 204p); _HEB_BASE compensa para que el molad del AM 1
    (día 2, 5h 204p) dé Tishrei 1, AM 1 = JDN 347998 (lunes).
    Horas del molad: rituales, contadas desde las 18:00 vespertinas;
    «molad zaken» (>= 18h) equivale al mediodía civil del día del molad.
    """
    period, parts = _heb_molad_parts(year)
    D = _HEB_BASE + period

    def adu(day: int) -> bool:
        return day % 7 in (6, 2, 4)  # 0=lunes: prohibidos domingo, miércoles, viernes

    # 1) Dehiyat Molad Zaken: molad >= 18h rituales => +1, con Lo ADU re-chequeado.
    #    Después de zaken no se aplica BeTUTaKaPaT.
    if parts >= 19440:
        D += 1
        if adu(D):
            D += 1
    # 2) Dehiyat Lo ADU Rosh: domingo, miércoles o viernes => +1.
    #    Si cae en lunes (molad original domingo) puede sumarse BeTUTaKaPaT.
    elif adu(D):
        D += 1
        if (D % 7 == 0 and _heb_is_leap(year - 1) and not _heb_is_leap(year)
                and parts >= 16789):
            D += 1   # domingo -> lunes -> martes (BeTUTaKaPaT)
    # 3) Dehiyat BeTUTaKaPaT: molad lunes >= 15h589p cuando el año anterior
    #    (cuya Tishrei cerraba) era embolismal y el nuevo es común => +1.
    elif (D % 7 == 0 and _heb_is_leap(year - 1) and not _heb_is_leap(year)
            and parts >= 16789):
        D += 1
    # 4) Dehiyat GaTaRaD: molad martes >= 9h204p en año común => +2 (a jueves).
    elif not _heb_is_leap(year) and D % 7 == 1 and parts >= 9924:
        D += 2
    return D


def _heb_year_length(year: int) -> int:
    return _heb_rosh_hashanah(year + 1) - _heb_rosh_hashanah(year)


def _heb_is_leap(year: int) -> bool:
    return (year * 7 + 1) % 19 < 7   # metónico: 7 emisiones intercalares


def _heb_month_lengths(year: int) -> List[int]:
    """Longitudes de los meses EN ORDEN CIVIL (Tishrei primero)."""
    L = _heb_year_length(year)
    if L in (353, 383):      # chaseirah: Heshvan 29, Kislev 29
        h, k = 29, 29
    elif L in (354, 384):    # kesidrah
        h, k = 29, 30
    elif L in (355, 385):    # shalemah
        h, k = 30, 30
    else:
        raise ValueError("GERO_EINVAL: longitud de año hebreo inválida")
    months = [30, h, k, 29, 30, 30, 29] if _heb_is_leap(year) else [30, h, k, 29, 30, 29]
    months += [30, 29, 30, 29, 30, 29]  # Nisan..Elul (tras Adar I o Adar)
    return months


_HEB_YEAR_LIMIT = 900_000_000_000  # horizonte del molad en int64 (C y Python)


def _heb_from_di(di: int) -> CalendarDate:
    jdn = di + 1719313
    if abs(jdn - 347998) // 365 + 2 > _HEB_YEAR_LIMIT:
        raise ValueError("GERO_ERANGE: año hebreo fuera del horizonte del molad int64")
    # Estimación O(1) por molad (sin deriva): m(y) = floor((235y-234)/19),
    # molad(y) ≈ floor(_HEB_BASE + m·W/H); invierto para partir cerca
    # del año correcto (válido también con m negativo) y corrijo con un
    # lazo acotado (≤ 8 iteraciones).
    months_est = ((jdn - _HEB_BASE) * _HALAKIM_PER_DAY) // _weeks_per_month
    year_est = (19 * months_est - 19 + 234) // 235 + 1
    for _ in range(8):
        rh = _heb_rosh_hashanah(year_est)
        if rh > jdn:
            year_est -= 1
        elif _heb_rosh_hashanah(year_est + 1) <= jdn:
            year_est += 1
        else:
            break
    else:
        raise ValueError("GERO_EINVAL: día hebreo fuera de año")
    doy = jdn - _heb_rosh_hashanah(year_est)
    months = _heb_month_lengths(year_est)
    cum = 0
    mc = None
    for idx, L in enumerate(months):
        if doy < cum + L:
            mc, day = idx + 1, doy - cum + 1
            break
        cum += L
    else:
        raise ValueError("GERO_EINVAL: día hebreo fuera de año")
    # numeración RABÍNICA (UI estable): 1 = Nisan ... 7 = Tishri;
    # bisiesto: 12 = Adar I y 13 = Adar II; común: 12 = Adar.
    if year_est and _heb_is_leap(year_est):
        month = mc + 6 if mc <= 7 else mc - 7
    else:
        month = mc + 6 if mc <= 6 else mc - 6
    name = _HEB_MONTH_NAME_RABINIC(year_est, month)
    return CalendarDate("hebrew", (year_est, month, day),
                        f"{year_est:04d}-{month:02d}-{day:02d} ({name})")


_HEB_NAME_COMMON = ["Nisan", "Iyar", "Sivan", "Tamuz", "Av", "Elul",
                    "Tishri", "Heshvan", "Kislev", "Tevet", "Shevat", "Adar"]
_HEB_NAME_LEAP = ["Nisan", "Iyar", "Sivan", "Tamuz", "Av", "Elul",
                  "Tishri", "Heshvan", "Kislev", "Tevet", "Shevat",
                  "Adar I", "Adar II"]


def _HEB_MONTH_NAME_RABINIC(year, month):
    names = _HEB_NAME_LEAP if _heb_is_leap(year) else _HEB_NAME_COMMON
    return names[month - 1]


def _heb_to_di(f):
    y, m, d = f["year"], f["month"], f["day"]
    if not -_HEB_YEAR_LIMIT <= y <= _HEB_YEAR_LIMIT:
        raise ValueError("GERO_ERANGE: año hebreo fuera del horizonte del molad int64")
    months = _heb_month_lengths(y)
    leap = _heb_is_leap(y)
    # rabínico → civil (Tishri primero): 7 = Tishri; embolismal:
    # 12 = Adar I, 13 = Adar II; común: 12 = Adar
    if not 1 <= m <= (13 if leap else 12):
        raise ValueError(f"GERO_EINVAL: mes hebreo inválido: {m} "
                         "(numeración rabínica: 1 = Nisan ... 12 = Adar I/Adar, 13 = Adar II)")
    mc = (m + 7 if leap else m + 6) if m <= 6 else (m - 6)
    if not 1 <= mc <= len(months):
        raise ValueError(f"GERO_EINVAL: mes hebreo inválido: {m} "
                         "(numeración rabínica: 1 = Nisan ... 12 = Adar I/Adar, 13 = Adar II)")
    if not 1 <= d <= months[mc - 1]:
        raise ValueError(f"GERO_EINVAL: día hebreo inválido (mes {m} tiene {months[mc-1]})")
    return _heb_rosh_hashanah(y) + sum(months[: mc - 1]) + (d - 1) - 1719313


# =========================================================================
# 10. Chino lunisolar computacional (tabla generada shuo/zhongqi — 1645..2650)
# =========================================================================
#
# El motor consume SOLO la tabla de enteros generada
# (`tools/generate_china_table.py`, efemérides Meeus truncadas en el
# meridiano de Pekín UTC+8): determinismo bit a bit en los tres lenguajes
# garantizado por dato, sin punto flotante en tiempo de ejecución.
# La numeración de zhongqi: ZQ[k] es el cruce de la longitud solar
# 270° + 30·(k−3), de modo que k ≡ 3 (mod 12) ⇒ Dongzhi (verificado con
# ZQ[3] = 1638-12-22 y ZQ[4575] = 2019-12-22).

_CHINA_MIN_YEAR = 1645
_CHINA_MAX_YEAR = 2650

_SHUO = tuple(china_table.SHUO)    # JDN de cada luna nueva (ordenado)
_ZQ = tuple(china_table.ZHONGQI)   # JDN del zhongqi k (270° + 30·(k−3))
_ZQ_DONGZHI_RESIDUE = 3            # k ≡ 3 (mod 12) ⇒ Dongzhi


def _china_bisect(arr, x: int) -> int:
    """Mayor i tal que arr[i] <= x; -1 si x < arr[0]."""
    lo, hi = 0, len(arr)
    while lo < hi:
        mid = (lo + hi) // 2
        if arr[mid] <= x:
            lo = mid + 1
        else:
            hi = mid
    return lo - 1


def _china_check(jdn: int) -> None:
    y = cal.gregorian_from_day_index(jdn - 1719313)[0]
    if not _CHINA_MIN_YEAR <= y <= _CHINA_MAX_YEAR:
        raise ValueError(
            f"GERO_EUNSUPPORTED: fecha china fuera del rango validado "
            f"{_CHINA_MIN_YEAR}..{_CHINA_MAX_YEAR} d.C.")


def _china_contains_zq(i: int) -> bool:
    """¿Cae algún zhongqi dentro de la lunación i ([SHUO[i], SHUO[i+1]))?"""
    if _SHUO[i + 1] > _ZQ[-1]:
        # lunación tras el último zhongqi tabulado: solo ocurre fuera de
        # rango (ya validado); tratar como sin zhongqi no es alcanzable.
        return True
    return _china_bisect(_ZQ, _SHUO[i + 1] - 1) != _china_bisect(_ZQ, _SHUO[i] - 1)


def _china_dongzhi_lunation(k: int) -> int:
    """Índice de la lunación que contiene al Zhongqi k (k ≡ 0 mod 12)."""
    return _china_bisect(_SHUO, _ZQ[k])


def _china_last_dongzhi(before: int) -> int:
    """Índice k del último Dongzhi (Zhongqi k ≡ 3 mod 12) con ZQ[k] <= before."""
    k = _china_bisect(_ZQ, before)
    d = (k - _ZQ_DONGZHI_RESIDUE) % 12
    return k - d


def _china_from_di(di: int) -> CalendarDate:
    jdn = di + 1719313
    _china_check(jdn)
    i = _china_bisect(_SHUO, jdn)  # lunación que contiene jdn
    while i < 0 or i >= len(_SHUO) - 1:
        raise ValueError("GERO_EUNSUPPORTED: fecha china fuera de la tabla")
    # solsticio de referencia: el último Dongzhi DENTRO o ANTES de la
    # lunación i — ancla el mes 11 del año lunar.
    kd = _china_last_dongzhi(_SHUO[i + 1] - 1)
    s11 = _china_dongzhi_lunation(kd)
    if i < s11:
        kd -= 12
        s11 = _china_dongzhi_lunation(kd)
    s11n = _china_dongzhi_lunation(kd + 12)  # mes 11 del año lunar siguiente
    if s11n - s11 > 12:
        # hay 13 lunaciones: la primera SIN zhongqi (después del mes 11)
        # es el mes intercalar (runyue)
        leap_i = None
        for j in range(s11 + 1, s11n):
            if not _china_contains_zq(j):
                leap_i = j
                break
        assert leap_i is not None, "año chino de 13 lunaciones sin mes intercalar"
    else:
        leap_i = None
    # numeración secuencial: mes 11 en s11; bisiesto repite el número del
    # anterior (cm), los demás avanzan la rueda 11→12→1→…→10.
    if i == s11:
        return CalendarDate("chinese", (cal.gregorian_from_day_index(_SHUO[s11] - 1719313)[0], 11, jdn - _SHUO[s11] + 1, False),
                            f"{cal.gregorian_from_day_index(_SHUO[s11] - 1719313)[0]}M11D{jdn - _SHUO[s11] + 1:02d}")
    cm = 11
    y0 = cal.gregorian_from_day_index(_SHUO[s11] - 1719313)[0]
    day_m1 = None
    for j in range(s11 + 1, s11n):
        if j == leap_i:
            month, leap, mm = cm, True, cm
        else:
            cm = 12 if cm == 11 else (1 if cm == 12 else cm + 1)
            month, leap, mm = cm, False, cm
        if month >= 1 and mm >= 1:
            year = y0 if month in (11, 12) else y0 + 1
        if j == i:
            return CalendarDate("chinese", (year, month, jdn - _SHUO[j] + 1, leap),
                                f"{year}M{month}{'l' if leap else ''}D{jdn - _SHUO[j] + 1:02d}")
    raise ValueError("GERO_EINVAL: lunación china no numerable")


def _china_month_index(year: int, month: int, leap: bool) -> int:
    """Índice de lunación i (SHUO[i] = 1 del mes) para el mes lunar pedido.

    Ancla: la lunación que contiene el Dongzhi posterior al 31/12 gregoriano
    del año lunar y es el mes 11; el intercalar repite el número del mes
    anterior (primera lunación sin zhongqi entre los dos meses 11, si el
    año tiene 13 lunaciones).
    """
    kd = _china_last_dongzhi(_greg_jdn(year if month >= 11 else year - 1, 12, 31))
    s11 = _china_dongzhi_lunation(kd)
    s11n = _china_dongzhi_lunation(kd + 12)
    leap_i = None
    if s11n - s11 == 13:
        leap_i = next(j for j in range(s11 + 1, s11n) if not _china_contains_zq(j))
    mm, ll = 0, False
    for j in range(s11, s11n):
        if j == s11:
            mm, ll = 11, False
        elif j == leap_i:
            ll = True          # intercalar: repite el número del mes anterior
        else:
            mm = mm + 1 if mm < 12 else 1
            ll = False
        if (mm, ll) == (month, leap):
            return j
    raise ValueError(
        f"GERO_EINVAL: no existe {'el mes intercalar ' if leap else 'el mes '}"
        f"{month} en el año lunar {year}")


def _china_to_di(f):
    year, month, day = f["year"], f["month"], f["day"]
    leap = bool(f.get("leap", False))
    if not 1 <= month <= 12:
        raise ValueError("GERO_EINVAL: mes chino fuera de 1..12")
    if not _CHINA_MIN_YEAR <= year <= _CHINA_MAX_YEAR:
        raise ValueError(f"GERO_EUNSUPPORTED: año chino {year} fuera de "
                         f"{_CHINA_MIN_YEAR}..{_CHINA_MAX_YEAR}")
    j = _china_month_index(year, month, leap)
    L = _SHUO[j + 1] - _SHUO[j]
    if not 1 <= day <= L:
        raise ValueError(f"GERO_EINVAL: el mes {month} de {year} tiene {L} días")
    return _SHUO[j] + day - 1 - 1719313


# =========================================================================
# Despacho del motor: from/to_day_index para los 10 sistemas
# =========================================================================

_ADAPTERS = {
    "gus": (_gus_from_di, _gus_to_di),
    "greg": (_greg_from_di, _greg_to_di),
    "julian": (_julian_from_di, _julian_to_di),
    "egyptian": (_egyptian_from_di, _egyptian_to_di),
    "ethiopic": (_ethiopic_from_di, _ethiopic_to_di),
    "bahai": (_bahai_from_di, _bahai_to_di),
    "maya": (_maya_from_di, _maya_to_di),
    "islamic": (_islamic_from_di, _islamic_to_di),
    "hebrew": (_heb_from_di, _heb_to_di),
    "chinese": (_china_from_di, _china_to_di),
}


def from_day_index(di: int, system_id: str) -> CalendarDate:
    """day_index GUS (días desde ORIGIN_JDN) → fecha en `system_id`."""
    try:
        adapter = _ADAPTERS[system_id]
    except KeyError:
        raise ValueError(f"GERO_EINVAL: sistema desconocido: {system_id!r}") from None
    return adapter[0](di)


def to_day_index(system_id: str, fields: dict) -> int:
    """Fecha en `system_id` (dict {campo: valor}) → day_index GUS."""
    try:
        adapter = _ADAPTERS[system_id]
    except KeyError:
        raise ValueError(f"GERO_EINVAL: sistema desconocido: {system_id!r}") from None
    return adapter[1](fields)


# =========================================================================
# from/to_instant: Instant (segundos + nanos) ↔ fecha + LocalTime
# =========================================================================


def from_instant(instant: int, system_id: str, offset_seconds: int = TCJ_OFFSET_DEFAULT,
                 nanos: int = 0) -> Tuple[CalendarDate, LocalTime]:
    """Instante TCJ → (fecha en el sistema, hora civil local con offset)."""
    local = instant + offset_seconds
    di, tod = divmod(local, SECS_PER_DAY)  # piso (divmod euclidiano)
    date = from_day_index(di, system_id)
    hour, rem = divmod(tod, 3600)
    minute, second = divmod(rem, 60)
    if not 0 <= nanos <= 999_999_999:
        raise ValueError(f"GERO_EINVAL: nanos fuera de rango 0..999999999: {nanos}")
    return date, LocalTime(hour, minute, second, nanos, offset_seconds)


def to_instant(system_id: str, fields: dict, hour: int, minute: int, second: int,
               offset_seconds: int = TCJ_OFFSET_DEFAULT, nanos: int = 0) -> int:
    """(fecha en sistema + hora civil con offset) → Instante TCJ (segundos)."""
    if not (0 <= hour <= 23 and 0 <= minute <= 59 and 0 <= second <= 59):
        raise ValueError("GERO_EINVAL: hora civil fuera de 00:00:00..23:59:59")
    if not 0 <= nanos <= 999_999_999:
        raise ValueError(f"GERO_EINVAL: nanos fuera de rango: {nanos}")
    di = to_day_index(system_id, fields)
    return di * SECS_PER_DAY + hour * 3600 + minute * 60 + second - offset_seconds


def validate_date(system_id: str, fields: dict) -> bool:
    """Validación sin excepciones (paridad con validate_date de C/JS)."""
    try:
        to_day_index(system_id, fields)
    except Exception:  # noqa: BLE001 — cualquier rechazo = fecha inválida
        return False
    return True


# =========================================================================
# Puente A → GUS → B (la prueba de «A -> GUS -> B» del vector)
# =========================================================================


def convert(from_system: str, fields: dict, to_system: str) -> Tuple[int, ...]:
    di = to_day_index(from_system, fields)
    target = from_day_index(di, to_system)
    return target.fields


# =========================================================================
# Autorprueba con hitos históricos (smoke, puede correr sin red)
# =========================================================================

def selfcheck() -> List[str]:
    out = []
    expect = [
        # (de, campos, a, esperado)
        ("greg", {"year": 2012, "month": 12, "day": 21}, "maya", (13, 0, 0, 0, 0)),
        ("greg", {"year": 1948, "month": 5, "day": 14}, "hebrew", (5708, 2, 5)),
        ("greg", {"year": 1844, "month": 3, "day": 21}, "bahai", (1, 1, 1)),
        ("greg", {"year": 2023, "month": 7, "day": 19}, "islamic", (1445, 1, 1)),
    ]
    for src, f, dst, want in expect:
        got = convert(src, f, dst)
        out.append(("OK" if got == want else f"FALLO {got} != {want}", src, dst))
    return out
