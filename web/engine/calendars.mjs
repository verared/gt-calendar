// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2026 verared contributors
// calendars.mjs — Motor de traducción multi-calendario del portal Gerarion.
//
// Pivote matemático: JDN (número de día juliano entero) y day_index GUS,
// con JDN = 1719313 + day_index (ORIGIN_JDN). Todas las conversiones son
// puentes enteros exactos hacia/desde JDN; los calendarios que Intl
// implementa nativamente (hebreo, islámico, chino) se convierten también en
// sentido INVERSO buscando en el propio motor Intl la coincidencia exacta
// de componentes (y verificándola).
//
// Convención temporal global: las fechas son días civiles completos en UTC
// (el JDN de un día civil = JDN de su mediodía UTC). La hora se conserva
// como información adjunta: los sellos GUS la llevan en su formato y las
// demás tarjetas la muestran como nota (HH:MM UTC).
//
// 100 % local: cero CDN, cero servicios externos, cero dependencias de red.
// Aritmética entera con Number (segura hasta 2^53 ≈ 9·10^15 días).
//
// Límites documentados (ver web/README.md): Intl/ICU cubre el rango de
// Date (±8.64·10^15 ms ≈ ±273.790 años); el hebreo/islámico/chino de ICU
// son extrapolaciones matemáticas fuera de sus tablas históricas (~1900–2100
// para chino; tablas uyurqura 1900–2074 aprox.); se avisa por tarjeta.

// Estado modular (v3.2.0): el núcleo exacto vive en engine/core.mjs y el
// motor GUTI en engine/guti.mjs. Este módulo conserva los modos de entrada
// del atlas, los helpers de presentación y las rutas Intl aún alcanzables
// (islamicUmalqura e inversas hebreo/islámico-civil/chino), marcadas como
// legado de la fase GUTI-2: no se usan para conversión normativa.
import {
  ORIGIN_JDN,
  jdn,
  jdnToGregorian,
  toGerarion,
  parse,
  canonicalOf,
  tempalumName,
  MONTHS,
} from './core.mjs';

export { ORIGIN_JDN };

/** División piso (⊔), igual que // de Python (JS trunca hacia cero). */
function fdiv(a, b) {
  const q = Math.trunc(a / b);
  if (a % b !== 0 && (a < 0) !== (b < 0)) return q - 1;
  return q;
}

/** Módulo euclidiano: resultado en [0, m). */
function emod(a, m) {
  return ((a % m) + m) % m;
}

// ---------------------------------------------------------------------------
// Semana civil (etiqueta para humanos; el día GUS no usa semana civil).
// JDN 0 = lunes → (jdn + 1) mod 7: 0 = Domingo … 6 = Sábado.
// ---------------------------------------------------------------------------

const CIVIL_WEEK = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function civilWeekday(j) {
  return CIVIL_WEEK[emod(j + 1, 7)];
}

// ---------------------------------------------------------------------------
// Gregoriano proléptico / Juliano proléptico (numeración astronómica:
// 747 a.C. = año −746; el año 0 existe).
// ---------------------------------------------------------------------------

export function gregorianToJdn(y, m, d) {
  return jdn(y, m, d);
}

export function jdnToGregorianStr(j) {
  const [y, m, d] = jdnToGregorian(j);
  return {
    year: y,
    month: m,
    day: d,
    iso: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  };
}

export function julianToJdn(y, m, d) {
  const a = fdiv(14 - m, 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  return d + fdiv(153 * m2 + 2, 5) + 365 * y2 + fdiv(y2, 4) - 32083;
}

export function jdnToJulian(j) {
  const c = j + 32082;
  const d4 = fdiv(4 * c + 3, 1461);
  const e = c - fdiv(1461 * d4, 4);
  const m = fdiv(5 * e + 2, 153);
  const day = e - fdiv(153 * m + 2, 5) + 1;
  const month = m + 3 - 12 * fdiv(m, 10);
  const year = d4 - 4800 + fdiv(m, 10);
  return { year, month, day };
}

// ---------------------------------------------------------------------------
// Egipcio antiguo (Vago/Alejandrino, sin intercalación): 12 × 30 + 5
// epagómenos. Época de Nabonassar: 1 Thoth 1 = JDN 1448638
// (= 26 feb 747 a.C. juliano). Año ≤ 0 Nabonassar: extensión proleptica.
// ---------------------------------------------------------------------------

export const EGYPT_EPOCH_JDN = 1448638;

export const EGYPT_MONTHS = [
  'Thoth', 'Phaophi', 'Athyr', 'Choiak', 'Tybi', 'Mecheir',
  'Phamenoth', 'Pharmuthi', 'Pachon', 'Payni', 'Epiphi', 'Mesore',
  'Epagómenos',
];

export function egyptianToJdn(y, m, d) {
  return EGYPT_EPOCH_JDN + (y - 1) * 365 + (m - 1) * 30 + (d - 1);
}

export function jdnToEgyptian(j) {
  const n = j - EGYPT_EPOCH_JDN; // 0 = 1 Thoth 1
  const year = fdiv(n, 365) + 1;
  const doy = n - (year - 1) * 365; // 0..364
  if (doy >= 360) return { year, month: 13, day: doy - 359, epagomenos: true };
  return { year, month: fdiv(doy, 30) + 1, day: emod(doy, 30) + 1, epagomenos: false };
}

// ---------------------------------------------------------------------------
// Etíope (Amete Mihret): 12 × 30 + Pagume (5 días; 6 en bisiesto).
// Época: 1 Meskerem 1 = JDN 1724221 (29 ago 8 e.c. juliano).
// Bisiestos: year % 4 == 3. Extended behind ~543 e.c.: proleptico.
// ---------------------------------------------------------------------------

export const ETHIOPIC_EPOCH_JDN = 1724221;

export const ETHIOPIC_MONTHS = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
  'Megabit', 'Miyazya', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume',
];

export function isEthiopicLeap(year) {
  return emod(year, 4) === 3;
}

export function ethiopicToJdn(y, m, d) {
  const ny = ETHIOPIC_EPOCH_JDN + (y - 1) * 365 + fdiv(y, 4);
  const add = m === 13 ? 360 + (d - 1) : (m - 1) * 30 + (d - 1);
  return ny + add;
}

export function jdnToEthiopic(j) {
  const n = j - ETHIOPIC_EPOCH_JDN; // 0 = 1 Meskerem 1
  const cycle = fdiv(n, 1461);
  const w = n - cycle * 1461; // 0..1460
  // El año bisiesto (year%4==3) ocupa la 3.ª posición del ciclo (366 días):
  // años del ciclo: pos 0 [0..364], pos 1 [365..729],
  // pos 2 [730..1095] (bisiesto, 366 días), pos 3 [1096..1460].
  let pos, doy;
  if (w <= 729) {
    pos = fdiv(w, 365);
    doy = w - pos * 365;
  } else if (w <= 1095) {
    pos = 2;
    doy = w - 730;
  } else {
    pos = 3;
    doy = w - 1096;
  }
  const year = cycle * 4 + pos + 1;
  if (pos === 2 && doy >= 360) {
    return { year, month: 13, day: doy - 359, pagume: true };
  }
  return { year, month: fdiv(doy, 30) + 1, day: emod(doy, 30) + 1 };
}

// ---------------------------------------------------------------------------
// Bahá'í (Badí'): 19 meses × 19 días + Ayyám-i-Há (4 o 5 días) antes de ʿAlá'.
// Época: 1 Bahá 1 BE = JDN 2394647 (Naw-Rúz, 21 mar 1844 e.c.).
// Naw-Rúz oficial: TABLA PUBLICADA (Universal House of Justice), BE 172–221
// (= 2015–2064), embebida abajo (transcrita de la tabla de 50 años de la
// UHJ; fuente: guidelines.bahai.org.nz GLSA-08). Fuera de la tabla se usa
// la convención «21 de marzo del año gregoriano Y+1843», marcada como
// aproximación (la regla oficial es astronómica: equinoccio en Teherán).
// ---------------------------------------------------------------------------

export const BAHAI_EPOCH_JDN = 2394647;

// Tabla UHJ de Naw-Rúz, BE 172–221: { BE: 'YYYY-MM-DD' (e.c.) }
export const BAHAI_NAWRUZ_TABLE = {
  172: '2015-03-21', 173: '2016-03-20', 174: '2017-03-20', 175: '2018-03-21',
  176: '2019-03-21', 177: '2020-03-20', 178: '2021-03-20', 179: '2022-03-21',
  180: '2023-03-21', 181: '2024-03-20', 182: '2025-03-20', 183: '2026-03-21',
  184: '2027-03-21', 185: '2028-03-20', 186: '2029-03-20', 187: '2030-03-20',
  188: '2031-03-21', 189: '2032-03-20', 190: '2033-03-20', 191: '2034-03-20',
  192: '2035-03-21', 193: '2036-03-20', 194: '2037-03-20', 195: '2038-03-20',
  196: '2039-03-21', 197: '2040-03-20', 198: '2041-03-20', 199: '2042-03-20',
  200: '2043-03-21', 201: '2044-03-20', 202: '2045-03-20', 203: '2046-03-20',
  204: '2047-03-21', 205: '2048-03-20', 206: '2049-03-20', 207: '2050-03-20',
  208: '2051-03-21', 209: '2052-03-20', 210: '2053-03-20', 211: '2054-03-20',
  212: '2055-03-21', 213: '2056-03-20', 214: '2057-03-20', 215: '2058-03-20',
  216: '2059-03-20', 217: '2060-03-20', 218: '2061-03-20', 219: '2062-03-20',
  220: '2063-03-20', 221: '2064-03-20',
};

const BAHAI_TABLE_MIN = 172;
const BAHAI_TABLE_MAX = 221;

function gregorianIsoToJdn(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return gregorianToJdn(y, m, d);
}

function gregorianIsLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** JDN del Naw-Rúz del año Badí' Y. Fuera de tabla: convención 21-mar. */
export function bahaiYearStartJdn(y) {
  const inTable = y >= BAHAI_TABLE_MIN && y <= BAHAI_TABLE_MAX;
  if (inTable) return gregorianIsoToJdn(BAHAI_NAWRUZ_TABLE[y]);
  return gregorianIsoToJdn(`${y + 1843}-03-21`);
}

/** True si el Naw-Rúz del año Y (y la longitud de su año) vienen de la tabla oficial. */
export function bahaiYearIsExact(y) {
  return y >= BAHAI_TABLE_MIN && y <= BAHAI_TABLE_MAX;
}

/** Días de Ayyám-i-Há del año Badí' Y (4 o 5) — 0 fuera de rango extrapolable. */
export function bahaiAyyamihaDays(y) {
  // longitud real del año: Naw-Rúz(Y+1) − Naw-Rúz(Y); para Y=221 (fuera de
  // tabla con Y+1) usa la convención 21-mar.
  const ny1 = bahaiYearStartJdn(y);
  const ny2 = y === BAHAI_TABLE_MAX
    ? gregorianIsoToJdn(`${y + 1 + 1843}-03-21`)
    : bahaiYearStartJdn(y + 1);
  return ny2 - ny1 - 361; // 18 meses (342) + ʿAláʼ (19) = 361
}

export const BAHAI_MONTHS = [
  'Ayyám-i-Há', 'Bahá', 'Jalál', 'Jamál', 'ʿAzamat', 'Núr', 'Rahmat',
  'Kalimát', 'Kamál', 'Asmáʼ', 'ʿIzzat', 'Mashíyyat', 'ʿIlm', 'Qudrat',
  'Qawl', 'Masáʼil', 'Sharaf', 'Sultán', 'Mulk', 'ʿAláʼ',
];

function bahaiToJdn(y, m, d) {
  const start = bahaiYearStartJdn(y);
  if (m === 0) return start + 342 + (d - 1); // Ayyám-i-Há
  if (m === 19) return start + 342 + bahaiAyyamihaDays(y) + (d - 1);
  return start + (m - 1) * 19 + (d - 1);
}

function jdnToBahai(j) {
  // año candidato por longitud media (~365.2422), corrección monotónica
  let y = Math.max(1, fdiv(j - BAHAI_EPOCH_JDN, 365) + 1);
  while (y > 1 && bahaiYearStartJdn(y) > j) y--;
  while (bahaiYearStartJdn(y + 1) <= j) y++;
  const start = bahaiYearStartJdn(y);
  const doy = j - start; // 0..
  const ayham = bahaiAyyamihaDays(y);
  if (doy < 342) {
    return { year: y, month: fdiv(doy, 19) + 1, day: emod(doy, 19) + 1, approx: y < BAHAI_TABLE_MIN || y + 1 > BAHAI_TABLE_MAX };
  }
  if (doy < 342 + ayham) {
    return { year: y, month: 0, day: doy - 341, ayyamiha: true, approx: y < BAHAI_TABLE_MIN || y + 1 > BAHAI_TABLE_MAX };
  }
  return { year: y, month: 19, day: doy - 342 - ayham + 1, approx: y < BAHAI_TABLE_MIN || y + 1 > BAHAI_TABLE_MAX };
}

export { bahaiToJdn, jdnToBahai };

// ---------------------------------------------------------------------------
// Cuenta Larga Maya — correlación GMT: 0.0.0.0.0 = JDN 584283
// (= 11 ago 3114 a.C. gregoriano proléptico). Baktún sin módulo 20 para
// poder contar hacia adelante; hacia atrás, módulos euclidianos.
// ---------------------------------------------------------------------------

export const MAYA_CORRELATION_JDN = 584283;

export function mayaToJdn(baktun, katun, tun, uinal, kin) {
  return MAYA_CORRELATION_JDN + baktun * 144000 + katun * 7200 + tun * 360 + uinal * 20 + kin;
}

export function jdnToMaya(j) {
  const days = j - MAYA_CORRELATION_JDN;
  return {
    baktun: fdiv(days, 144000),
    katun: emod(fdiv(days, 7200), 20),
    tun: emod(fdiv(days, 360), 20),
    uinal: emod(fdiv(days, 20), 18),
    kin: emod(days, 20),
    days,
  };
}

// ---------------------------------------------------------------------------
// Calendarios Intl: hebreo, islámico Umm al-Qura y civil, chino.
// Los componentes se normalizan y se permite la CONVERSIÓN INVERSA buscando
// en el motor Intl la fecha cuyos componentes coinciden exactamente.
//
// Codificación de meses para entrada/salida numérica:
//  - hebreo: 1..12 y, en años bisiestos hebreos ((7·Y+1) mod 19 < 7),
//    12 = Adar I, 13 = Adar II; ICU solo da el NOMBRE del mes (Adar I/II),
//    aquí se mapea a números.
//  - chino: 1..12 + bandera leapMonth (mes bisiesto, ICU lo marca "2bis").
//    El año es el relatedYear gregoriano (el cíclico es presentación).
//  - islámico (umalqura y civil): años AH 1..; antes de la Hégira, fuera
//    de rango (nota clara).
// ---------------------------------------------------------------------------

// Rango de Date en ms: ±8.64e15 → límites de JDN alcanzables por Intl
const JS_MIN_JDN = Math.round((-8.64e15) / 86400000) + 2440588;
const JS_MAX_JDN = Math.round(8.64e15 / 86400000) + 2440588;

export function jsDateRangeJdn() {
  return { min: JS_MIN_JDN, max: JS_MAX_JDN };
}

/** Date JS del mediodía UTC del día JDN. */
export function jdnToJsDate(j) {
  return new Date((j - 2440588) * 86400000 + 43200000);
}

/** True si el año hebreo Y es bisiesto (13 meses). */
export function isHebrewLeap(y) {
  return emod(7 * y + 1, 19) < 7;
}

const HEBREW_MONTH_NAMES = [
  null, 'Nisan', 'Iyar', 'Sivan', 'Tamuz', 'Av', 'Elul', 'Tishri',
  'Heshvan', 'Kislev', 'Tevet', 'Sh\'vat', 'Adar', // 12: Adar I (o Adar)
];
const HEBREW_MONTH_ALIASES = {
  'adari': 12, 'adar i': 12, 'adar1': 12,
  'adarii': 13, 'adar ii': 13, 'adar2': 13,
  'adar': 12,
  'shevat': 11, 'sh\'vat': 11, 'shvat': 11,
  'tishri': 7, 'tishrei': 7,
  'heshvan': 8, 'cheshvan': 8,
  'kislev': 9, 'teshvan': 9,
  'nisan': 1, 'iyar': 2, 'sivan': 3, 'tamuz': 4, 'tammuz': 4,
  'av': 5, 'elul': 6, 'tevet': 10,
};

function hebrewMonthNumberFromName(name) {
  const key = (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (HEBREW_MONTH_ALIASES[key] !== undefined) return HEBREW_MONTH_ALIASES[key];
  return null;
}

const INTL_CONFIG = {
  hebrew: { locale: 'en-u-ca-hebrew' },
  islamicUmalqura: { locale: 'en-u-ca-islamic-umalqura' },
  islamicCivil: { locale: 'en-u-ca-islamic-civil' },
  chinese: { locale: 'en-u-ca-chinese' },
};

/** Cache de formatters Intl: la construcción de DateTimeFormat es cara y
 *  el barrido denso de ida-y-vuelta llama a intlParts decenas de miles de veces. */
const FMT_CACHE = new Map();
function cachedDtFormat(locale, opts) {
  const key = locale + '|' + JSON.stringify(opts);
  let f = FMT_CACHE.get(key);
  if (f === undefined) {
    f = new Intl.DateTimeFormat(locale, opts);
    FMT_CACHE.set(key, f);
  }
  return f;
}

/** Componentes normalizados de un JDN en un calendario Intl.
 *  W5: SIEMPRE timeZone 'UTC' — el JDN es un día civil UTC y la conversión
 *  no depende de la zona del navegador/proceso. */
export function intlParts(j, which) {
  if (which === 'islamic') which = 'islamicCivil'; // alias cómodo
  const conf = INTL_CONFIG[which];
  const d = jdnToJsDate(j);
  const fmt = cachedDtFormat(conf.locale, {
    day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC',
    ...(which === 'islamicUmalqura' || which === 'islamicCivil' ? { era: 'short' } : {}),
  });
  const nameFmt = cachedDtFormat(conf.locale, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  // W3: conserva el signo — sin esto, años negativos prolépticos (p. ej. el
  // relatedYear "-262113" del chino) se leen como positivos enormes y la
  // secuencia (año, mes) deja de ser monótona.
  const num = (s) => {
    if (s === undefined || s === null) return null;
    const m = /(-)?\s*(\d+)/.exec(s);
    if (!m) return null;
    const v = parseInt(m[2], 10);
    return m[1] ? -v : v;
  };
  const base = {
    month: num(p.month),
    monthName: p.month || null,
    day: num(p.day),
    year: num(p.year),
    relatedYear: p.relatedYear !== undefined ? num(p.relatedYear) : null,
    era: p.era || null,
    text: which === 'hebrew' ? nameFmt.format(d) : fmt.format(d),
  };
  if (which === 'chinese') {
    // ICU: '2bis' → mes 2 bisiesto; relatedYear en lugar de year
    base.leapMonth = /bis|leap/i.test(p.month || '');
    base.month = num((p.month || '').replace(/bis|leap/i, ''));
    base.year = base.relatedYear;
  }
  if (which === 'hebrew') {
    base.month = hebrewMonthNumberFromName(p.month);
    if (base.month === 12 && isHebrewLeap(base.year)) {
      // ICU nombra "Adar" al 12.º mes solo si el año no es bisiesto; en
      // bisiesto el 12.º es Adar I y el 13.º Adar II — se marca abajo.
      base.month = 12; // Adar I
      base.monthNameIsAdarI = /adar ii/i.test(p.month || '');
      if (base.monthNameIsAdarI) base.month = 13;
    }
  }
  return base;
}

const INTL_NOTE = {
  hebrew: 'ICU: extrapolación matemática fuera de las fechas históricas',
  islamicUmalqura: 'tabla oficial Umm al-Qura (≈ 1900–2074 e.c.); fuera: aproximación de ICU',
  islamicCivil: 'aritmético (tabular),exacto para todo el rango Date',
  chinese: 'aproximación astronómica de ICU; tablas históricas fiables ≈ 1900–2100',
};

/** Vista principal (directa) de un JDN en un calendario Intl. */
export function intlCalendar(j, which) {
  if (j < JS_MIN_JDN || j > JS_MAX_JDN) {
    return { ok: false, note: 'fuera del rango representable de Date/Intl (±273.790 años)' };
  }
  try {
    const parts = intlParts(j, which);
    if (parts.year === null || parts.month === null || parts.day === null) {
      return { ok: false, note: 'no soportada por Intl para esta fecha' };
    }
    if ((which === 'hebrew' || which === 'islamicUmalqura' || which === 'islamicCivil') && parts.year <= 0) {
      return { ok: false, note: 'antes de la época del calendario: Intl no la cubre' };
    }
    return {
      ok: true,
      ...parts,
      note: INTL_NOTE[which],
    };
  } catch (e) {
    return { ok: false, note: 'no soportada por Intl para esta fecha' };
  }
}

/**
 * Rango monótono (año, mes, intercalar) como número comparable. Los pares
 * (year, month) avanzan sin retroceder día a día en todos los calendarios
 * Intl suportados, así que la búsqueda binaria sobre JDN es exacta.
 */
function intlRank(which, p) {
  if (p.year === null || p.month === null) return -Infinity;
  if (which === 'chinese') {
    const leap = p.leapMonth ? 1 : 0;
    return p.year * 24 + p.month * 2 + leap; // el mes intercalar sigue al regular
  }
  if (which === 'hebrew') {
    // orden civil hebreo: el año empieza en Tishri (7) y pasa por Adar
    // (12 ó 12+13 en bisiesto) antes de Nisan (1); se reindexa para que
    // rank sea monótono y sin colisiones:
    // Tishri→1 … Adar I→6, Adar II→7, Nisan→8 … Elul→13.
    const civilOrder = p.month >= 7 ? p.month - 6 : p.month + 7;
    return p.year * 13 + civilOrder;
  }
  return p.year * 12 + p.month; // islámico 1..12
}

/** Dominio real (JDN válido inclusivo) que ICU soporta para cada calendario
 *  en este entorno. ICU lanza "Icu error" en rangos extremos distintos por
 *  calendario: se mide por exponencial + bisección y se cachea. */
const DOMAIN_CACHE = new Map();
function intlDomain(which) {
  if (DOMAIN_CACHE.has(which)) return DOMAIN_CACHE.get(which);
  const safe = (j) => {
    try {
      const p = intlParts(j, which);
      return (p.year === null || p.month === null) ? null : p;
    } catch {
      return null;
    }
  };
  const anchor = gregorianToJdn(2000, 1, 1);
  let domain = null;
  if (safe(anchor) !== null) {
    // extremo superior
    let hi = anchor;
    let step = 4096;
    while (safe(hi + step) !== null) {
      hi += step;
      step *= 2;
    }
    let a = hi;
    let b = hi + step;
    while (b - a > 1) {
      const m = Math.floor((a + b) / 2);
      if (safe(m) !== null) a = m;
      else b = m;
    }
    const upper = a;
    // extremo inferior
    let lo = anchor;
    step = 4096;
    while (safe(lo - step) !== null) {
      lo -= step;
      step *= 2;
    }
    a = lo;
    b = lo - step;
    while (a - b > 1) {
      const m = Math.floor((a + b) / 2);
      if (safe(m) !== null) a = m;
      else b = m;
    }
    domain = { lo: b + 1, hi: upper };
  }
  DOMAIN_CACHE.set(which, domain);
  return domain;
}

/** Primer JDN con rank >= target (búsqueda binaria ICU completa), o null. */
function intlFirstJdnWithRank(which, targetRank) {
  const dom = intlDomain(which);
  if (dom === null) return null;
  let lo = dom.lo;
  let hi = dom.hi;
  let r;
  try {
    r = intlRank(which, intlParts(hi, which));
  } catch {
    return null;
  }
  if (r < targetRank) return null;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    let rm;
    try {
      rm = intlRank(which, intlParts(mid, which));
    } catch {
      rm = -Infinity; // fuera de lo soportado por ICU en este entorno
    }
    if (rm < targetRank) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Conversión inversa Intl: localiza el JDN en que el calendario Intl marca
 * exactamente los componentes pedidos (verificando con el mismo motor).
 * W3/W4: rango completo de ICU por búsqueda binaria — sin ventanas cortas
 * que rechacen fechas válidas (mes intercalar chino, Adar I/II, días tardíos).
 * components: { year, month, day, leapMonth? (solo chino) }
 * Devuelve { ok, jdn } o { ok:false, note }.
 */
export function intlToJdn(which, components) {
  const { year, month, day, leapMonth = false } = components;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return { ok: false, note: 'componentes inválidos (enteros esperados)' };
  }
  if (day < 1 || day > 33) {
    return { ok: false, note: `día fuera de rango calendárico: ${day}` };
  }
  if (which === 'chinese') {
    if (month < 1 || month > 12) return { ok: false, note: `mes chino inválido: ${month}` };
  } else if (which === 'hebrew') {
    if (month < 1 || month > 13) return { ok: false, note: `mes hebreo inválido: ${month} (1–13)` };
    if (month === 13 && !isHebrewLeap(year)) {
      return { ok: false, note: `año ${year} no es bisiesto hebreo: no existe Adar II` };
    }
  } else {
    if (month < 1 || month > 12) return { ok: false, note: `mes islámico inválido: ${month}` };
  }
  if (!Number.isInteger(year) || year <= 0) {
    return { ok: false, note: `año fuera de cobertura Intl: ${year} (la época de este calendario empieza en año 1)` };
  }
  const target = intlRank(which, { year, month, leapMonth: which === 'chinese' ? leapMonth : false });
  const start = intlFirstJdnWithRank(which, target);
  if (start === null) {
    const leapTxt = which === 'chinese' && leapMonth ? ' (mes intercalar)' : '';
    return { ok: false, note: `fuera de la cobertura de ICU: ${day}/${leapTxt} mes ${month} del año ${year}` };
  }
  const whichKey = which === 'islamic' ? 'islamicCivil' : which;
  // escanea los días del mes objetivo (≤ 33): day es monótono dentro del mes
  for (let j = start; j < start + 40; j++) {
    let p;
    try {
      p = intlParts(j, whichKey);
    } catch {
      break;
    }
    if (intlRank(which, p) !== target) break;
    const matchLeap = which === 'chinese' ? p.leapMonth === leapMonth : true;
    if (p.year === year && p.month === month) {
      // hebreo: el mes 12 en bisiesto ES Adar I (mes 13 = Adar II) — ya refleja el target
      if (p.day === day && matchLeap) {
        return { ok: true, jdn: j };
      }
    }
  }
  const leapTxt = which === 'chinese' && leapMonth ? ' (mes intercalar)' : '';
  const nameByWhich = { chinese: 'chino', hebrew: 'hebreo', islamicUmalqura: 'islámico (Umm al-Qura)', islamicCivil: 'islámico (civil)' };
  return {
    ok: false,
    note: `no existe ${day}/${leapTxt} mes ${month} del año ${year} según ICU (${nameByWhich[whichKey] || whichKey})`,
  };
}

// ---------------------------------------------------------------------------
// Gerarion: vista completa de un día (usa gerarion.mjs como fuente canónica)
// ---------------------------------------------------------------------------

const SACRED_DAYS = { '1-12': 'Cruxyphi', '1-15': 'Resinove', '1-30': 'Yeshuvid' };

export function gusView(dayIndex) {
  const d = toGerarion(dayIndex);
  const canon = canonicalOf(d);
  const monthName = d.month === 0 ? 'Tempalum' : MONTHS[d.month][0];
  const monthGloss = d.month === 0 ? 'cierre del año' : MONTHS[d.month][1];
  let special = tempalumName(d);
  if (!special) {
    special = SACRED_DAYS[`${d.month}-${d.day}`] || null;
  }
  const gt = d.isGranTempalumYear;
  return {
    canonical: canon,
    weekday: d.weekday,
    weekdayAbbr: d.abbr,
    monthName,
    monthGloss,
    special,
    granTempalum: gt,
    year: d.year,
    month: d.month,
    day: d.day,
    dayIndex,
  };
}

// ---------------------------------------------------------------------------
// Parser de entrada por modo de calendario (texto → JDN). Usado por la UI.
// ---------------------------------------------------------------------------

function parseTriplet(text, sep) {
  const parts = text.trim().split(sep).map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) {
    throw new Error('formato esperado: año mes día');
  }
  return parts;
}

export const INPUT_MODES = {
  gero: {
    id: 'gero',
    label: 'Gerarion',
    hint: 'marca canónica GUS (incl. hora) — años AY de 5–6 dígitos admitidos',
    placeholder: '2031DY-03-08-T-09:30:00-SC-TCJ+0 · 12000AY-01-01-S',
    toJdn(text) {
      return geroInputToJdn(text);
    },
  },
  greg: {
    id: 'greg',
    label: 'Gregoriano',
    hint: 'gregoriano proléptico AAAA-MM-DD (años negativos = a.C.)',
    placeholder: '2026-03-17',
    toJdn(text) {
      const m = /^(-?\d{1,6})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})$/.exec(text.trim());
      if (!m) throw new Error('formato esperado: AAAA-MM-DD (ej. 2026-03-17)');
      const j = gregorianToJdn(Number(m[1]), Number(m[2]), Number(m[3]));
      return { jdn: j, label: `gregoriano ${String(m[1]).padStart(4, '0')}-${m[2]}-${m[3]}` };
    },
  },
  julian: {
    id: 'julian',
    label: 'Juliano',
    hint: 'año mes día del calendario juliano (a.C. = años negativos)',
    placeholder: '2026 11 4',
    toJdn(text) {
      const [y, m, d] = parseTriplet(text, /[\s,.\/]+/);
      return { jdn: julianToJdn(y, m, d), label: `juliano ${y}-${pad(m)}-${pad(d)}` };
    },
  },
  egyptian: {
    id: 'egyptian',
    label: 'Egipcio',
    hint: 'año Nabonassar · mes 1–13 (13 = epagómenos) · día',
    placeholder: '2775 8 5',
    toJdn(text) {
      const [y, m, d] = parseTriplet(text, /[\s,.\/]+/);
      return { jdn: egyptianToJdn(y, m, d), label: `año ${y} Nabonassar` };
    },
  },
  ethiopic: {
    id: 'ethiopic',
    label: 'Etíope',
    hint: 'año EC · mes 1–13 (13 = Pagume) · día',
    placeholder: '2019 3 8',
    toJdn(text) {
      const [y, m, d] = parseTriplet(text, /[\s,.\/]+/);
      return { jdn: ethiopicToJdn(y, m, d), label: `año ${y} EC` };
    },
  },
  bahai: {
    id: 'bahai',
    label: "Bahá'í",
    hint: 'año BE · mes 0 = Ayyám-i-Há, 1–19 · día',
    placeholder: '183 13 14',
    toJdn(text) {
      const [y, m, d] = parseTriplet(text, /[\s,.\/]+/);
      return { jdn: bahaiToJdn(y, m, d), label: `año ${y} BE` };
    },
  },
  maya: {
    id: 'maya',
    label: 'Maya',
    hint: 'cuenta larga B.K.T.U.K (correlación GMT 584283)',
    placeholder: '13.0.14.1.19',
    toJdn(text) {
      const p = text.trim().split(/[.\s]+/).map(Number);
      if (p.length !== 5 || p.some((n) => !Number.isInteger(n))) {
        throw new Error('formato esperado: B.K.T.U.K (ej. 13.0.14.1.19)');
      }
      return { jdn: mayaToJdn(p[0], p[1], p[2], p[3], p[4]), label: `cuenta larga ${p.join('.')}` };
    },
  },
  hebrew: {
    id: 'hebrew',
    label: 'Hebreo',
    hint: 'año AM · mes 1–13 (13 = Adar II, bisiesto) · día — conversión inversa Intl',
    placeholder: '5787 9 7   (o: 5784 13 2 = 2 Adar II)',
    toJdn(text) {
      const [y, m, d] = parseTriplet(text, /[\s,.\/]+/);
      const r = intlToJdn('hebrew', { year: y, month: m, day: d });
      if (!r.ok) throw new Error(r.note);
      return { jdn: r.jdn, label: `año ${y} AM` };
    },
  },
  islamicUmalqura: {
    id: 'islamicUmalqura',
    label: 'Islámico (Umm al-Qura)',
    hint: 'año AH · mes 1–12 · día — conversión inversa Intl',
    placeholder: '1448 6 7',
    toJdn(text) {
      const [y, m, d] = parseTriplet(text, /[\s,.\/]+/);
      const r = intlToJdn('islamicUmalqura', { year: y, month: m, day: d });
      if (!r.ok) throw new Error(r.note);
      return { jdn: r.jdn, label: `año ${y} AH` };
    },
  },
  islamicCivil: {
    id: 'islamicCivil',
    label: 'Islámico (civil)',
    hint: 'año AH · mes 1–12 · día — tabular, conversión inversa Intl',
    placeholder: '1448 6 6',
    toJdn(text) {
      const [y, m, d] = parseTriplet(text, /[\s,.\/]+/);
      const r = intlToJdn('islamicCivil', { year: y, month: m, day: d });
      if (!r.ok) throw new Error(r.note);
      return { jdn: r.jdn, label: `año ${y} AH` };
    },
  },
  chinese: {
    id: 'chinese',
    label: 'Chino',
    hint: 'año relacionado · mes 1–12 · día · [opcional: "bis" = mes intercalar]',
    placeholder: '2023 2 1 bis   ·   2026 1 1',
    toJdn(text) {
      const raw = text.trim().split(/[\s,]+/);
      const leap = /bis/i.test(raw[raw.length - 1] || '');
      const nums = (leap ? raw.slice(0, -1) : raw).map(Number);
      if (nums.length !== 3 || nums.some((n) => !Number.isInteger(n))) {
        throw new Error('formato esperado: año mes día [bis]');
      }
      const r = intlToJdn('chinese', { year: nums[0], month: nums[1], day: nums[2], leapMonth: leap });
      if (!r.ok) throw new Error(r.note);
      return { jdn: r.jdn, label: `año chino relacionado ${nums[0]}` };
    },
  },
};

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Parseo de una marca GUS canónica completa (o de solo fecha) a JDN,
 * preservando la hora (UTC) como dato adjunto: { jdn, label, time? }.
 */
export function geroInputToJdn(text) {
  const ts = parse(text.trim());
  const j = ORIGIN_JDN + ts.dayIndex;
  const hasTime = ts.hour !== undefined && (ts.hour !== 0 || ts.minute !== 0 || ts.second !== 0);
  const cleanInput = text.trim().replace(/^(DY|AY)?/i, '');
  return {
    jdn: j,
    label: `marca GUS ${canonicalOf(ts)}`,
    time: hasTime ? `${pad(ts.hour)}:${pad(ts.minute)}:${pad(ts.second)} UTC (conservada al proyectar)` : null,
  };
}

/** Autodetección de formato para la calculadora de distancias. */
export function autodetectToJdn(text) {
  const t = text.trim();
  if (/(DY|AY)/i.test(t)) {
    const r = geroInputToJdn(t);
    return { jdn: r.jdn, label: r.label };
  }
  if (/^-?\d{1,6}\s*-\s*\d{1,2}\s*-\s*\d{1,2}$/.test(t)) {
    return INPUT_MODES.greg.toJdn(t);
  }
  if (/^-?\d+(\.\d+){4}$/.test(t)) {
    return INPUT_MODES.maya.toJdn(t);
  }
  if (/^[\s,./-]*-?\d+[\s,./]+-?\d+[\s,./]+-?\d+[\s,]*$/.test(t)) {
    return INPUT_MODES.julian.toJdn(t);
  }
  throw new Error('formato no reconocido: usa una marca GUS (…DY/…AY), AAAA-MM-DD, «año mes día» o B.K.T.U.K');
}
