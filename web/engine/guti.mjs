// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2026 verared contributors
// Motor multi-calendario determinista (fase GUTI-1).
//
// Espejo BIT A BIT del motor de referencia Python (src/gerarion/calendars.py)
// y de libgerarion C11 (impl-c/gerarion_calendars.c): misma aritmética
// entera exacta pivoteada sobre day_index / JDN 1719313. CERO dependencias
// de Intl, red o reloj del sistema: offline por construcción.
//
// Elección de dominio: las operaciones intermedias usan BigInt cuando el
// producto puede exceder 2^53-1 (hebreo, islámico, juliano, egipcio,
// etíope, maya); los resultados se entregan como Number comprobado con
// Number.isSafeInteger, o GERO_ERANGE (véase CALENDAR-ENGINE.md, "envolvente
// operativa por plataforma": JS Number = ±(2^53-1); Python = entero
// arbitrario; C11 = int64_t).

import { ORIGIN_JDN, dayIndexFromGregorian, gregorianFromDayIndex,
         toGerarion, fromGerarion, GeroError } from './core.mjs';
import { SHUO, ZHONGQI } from './china-table.mjs';

export { ORIGIN_JDN };

/** Dominio exacto JS: el wire format es Day index dentro de ±(2^53-1). */
const JS_SAFE = Number.MAX_SAFE_INTEGER; // 2^53 - 1

/** Errores con código GERO_* (paridad con Python lib). */
export class GutiError extends Error {
  constructor(msg) { super(msg); this.name = 'GutiError'; }
}
const einval = (msg) => { throw new GutiError(`GERO_EINVAL: ${msg}`); };
const eunsupported = (msg) => { throw new GutiError(`GERO_EUNSUPPORTED: ${msg}`); };
const erange = (msg) => { throw new GutiError(`GERO_ERANGE: ${msg}`); };

/** floor(a/b) para BigInt (división euclidiana). */
function bdiv(a, b) {
  let q = a / b;
  if (a % b !== 0n && ((a < 0n) !== (b < 0n))) q -= 1n;
  return q;
}
function bmod(a, b) { return a - bdiv(a, b) * b; }

/** Cierra un BigInt a Number comprobando el dominio exacto. */
function toSafe(x) {
  if (x > BigInt(JS_SAFE) || x < BigInt(-JS_SAFE)) {
    erange('resultado fuera del rango exacto de Number (±2^53-1); usa BigInt');
  }
  return Number(x);
}

/* ---------------------------------------------------------------------
 * 1. GUS (núcleo congelado v3.0.0, ORIGIN_JDN 1719313)
 * ------------------------------------------------------------------ */

function gusFromDi(di) {
  const g = toGerarion(di);   // núcleo congelado; lanza GeroError GERO_*
  return { fields: { year: g.year, month: g.month, day: g.day },
           canonical: `${p4(g.year, g)}-${p2(g.month, g)}-${p2(g.day, g)}-${g.weekday}` };
}
function p2(n) { return String(n).padStart(2, '0'); }
function p4(n) { return String(n).padStart(4, '0'); }
function gusToDi(f) {
  const g = fromGerarion(f.year, f.month, f.day); // valida 0..12/00.. etc.
  return g.dayIndex;
}

/* ---------------------------------------------------------------------
 * 2. Gregoriano proléptico (aritmética exacta, años negativos)
 * ------------------------------------------------------------------ */

const GREG_MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function gregFromDi(di) {
  // day_index 0 = JDN 1719313 = -0005-03-21 proléptico
  const [y, m, d] = gregorianFromDayIndex(di);
  return { fields: { year: y, month: m, day: d },
           canonical: `${p4(y)}-${p2(m)}-${p2(d)}` };
}
function gregToDi(f) {
  const { year: y, month: m, day: d } = f;
  if (!Number.isSafeInteger(y) || !Number.isSafeInteger(m) || !Number.isSafeInteger(d)) {
    einval('fecha gregoriana no entera');
  }
  if (!(m >= 1 && m <= 12)) einval('mes gregoriano fuera de 1..12');
  let maxd = GREG_MONTH_DAYS[m - 1];
  if (m === 2 && (y % 4 === 0) && (y % 100 !== 0 || y % 400 === 0)) maxd = 29;
  if (!(d >= 1 && d <= maxd)) einval('fecha gregoriana imposible');
  if (y > 24000000000000 || y < -24000000000000) {
    erange('año gregoriano fuera del dominio exacto de Number');
  }
  return toSafe(BigInt(dayIndexFromGregorian(y, m, d)));
}

/* ---------------------------------------------------------------------
 * 3. Juliano proléptico (época JDN 1721424)
 * ------------------------------------------------------------------ */

function julianToJdnB(y, m, d) {
  const a = BigInt(Math.floor((14 - m) / 12));
  const yy = BigInt(y) + 4800n - a;
  const mm = BigInt(m) + 12n * a - 3n;
  return BigInt(d) + bdiv(153n * mm + 2n, 5n) + 365n * yy + bdiv(yy, 4n) - 32083n;
}
function julianFromJdnB(jdn) {
  const c = jdn + 32082n;
  const dd = bdiv(4n * c + 3n, 1461n);
  const e = c - bdiv(1461n * dd, 4n);
  const m = bdiv(5n * e + 2n, 153n);
  const day = e - bdiv(153n * m + 2n, 5n) + 1n;
  const month = m + 3n - 12n * bdiv(m, 10n);
  const year = dd - 4800n + bdiv(m, 10n);
  return { year: Number(year), month: Number(month), day: Number(day) };
}
function julianFromDi(di) {
  const p = julianFromJdnB(BigInt(ORIGIN_JDN) + BigInt(di));
  return { fields: p, canonical: `${p4(p.year)}-${p2(p.month)}-${p2(p.day)}` };
}
function julianToDi(f) {
  const { year: y, month: m, day: d } = f;
  if (!(m >= 1 && m <= 12)) einval('mes juliano fuera de 1..12');
  let maxd = GREG_MONTH_DAYS[m - 1];
  if (m === 2 && emod(y, 4) === 0) maxd = 29;   // bisiesto juliano
  if (!(d >= 1 && d <= maxd)) einval('día juliano inválido para el mes');
  return toSafe(julianToJdnB(y, m, d) - BigInt(ORIGIN_JDN));
}
/** módulo euclidiano (Python %) para Number. */
function emod(a, b) { return ((a % b) + b) % b; }

/* ---------------------------------------------------------------------
 * 4. Egipcio antiguo, año vago (Nabonassar, JDN 1448638)
 * ------------------------------------------------------------------ */

function egyptianFromDi(di) {
  const days = BigInt(di) + BigInt(ORIGIN_JDN) - 1448638n;
  const year = Number(bdiv(days, 365n)) + 1;
  const doy = Number(bmod(days, 365n));
  let m, d;
  if (doy < 360) { m = Math.floor(doy / 30) + 1; d = doy % 30 + 1; }
  else { m = 13; d = doy - 360 + 1; }   // epagómenos como mes 13
  return { fields: { year, month: m, day: d },
           canonical: `${p4(year)}-${p2(m)}-${p2(d)}` };
}
function egyptianToDi(f) {
  const { year: y, month: m, day: d } = f;
  if (!(m >= 1 && m <= 13)) einval('mes egipcio fuera de 1..13');
  if (!(d >= 1 && d <= (m === 13 ? 5 : 30))) einval('día egipcio inválido');
  return toSafe(1448638n + (BigInt(y) - 1n) * 365n + BigInt(m - 1) * 30n
                + BigInt(d - 1) - BigInt(ORIGIN_JDN));
}

/* ---------------------------------------------------------------------
 * 5. Etíope (Amete Mihrêt, época JDN 1724221)
 * ------------------------------------------------------------------ */

function ethiopicIsLeap(y) { return emod(y, 4) === 3; }
function ethiopicJdnOf11(y) {
  // ciclo juliano de 1461 días, exacto en años negativos (BigInt)
  return 1724221n + 365n * (BigInt(y) - 1n) + bdiv(BigInt(y), 4n);
}
function ethiopicFromDi(di) {
  const jdnB = BigInt(ORIGIN_JDN) + BigInt(di);
  const N = jdnB - 1724221n;
  const q = bdiv(N, 1461n);
  const r = bmod(N, 1461n);
  const year = Number(4n * q + bdiv(4n * r + 1463n, 1461n));
  const start = ethiopicJdnOf11(year);
  const doy = Number(jdnB - start);
  let m, d;
  if (doy < 360) { m = Math.floor(doy / 30) + 1; d = doy % 30 + 1; }
  else { m = 13; d = doy - 360 + 1; }   // Pagume
  return { fields: { year, month: m, day: d },
           canonical: `${p4(year)}-${p2(m)}-${p2(d)}` };
}
function ethiopicToDi(f) {
  const { year: y, month: m, day: d } = f;
  if (!(m >= 1 && m <= 13)) einval('mes etíope fuera de 1..13');
  if (m === 13) {
    const maxd = ethiopicIsLeap(y) ? 6 : 5;
    if (!(d >= 1 && d <= maxd)) einval('Pagume inválido');
  } else if (!(d >= 1 && d <= 30)) {
    einval('día etíope fuera de 1..30');
  }
  return toSafe(ethiopicJdnOf11(y) + BigInt((m - 1) * 30 + d - 1) - BigInt(ORIGIN_JDN));
}

/* ---------------------------------------------------------------------
 * 6. Bahá'í (Badí' tabular, Naw-Rúz = 21 de marzo gregoriano)
 * ------------------------------------------------------------------ */

function isGregLeap(y) { return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0); }
const BAHAI_GREG_Y0 = 1844;
function bahaiNawruz(yearBE) {
  return BigInt(dayIndexFromGregorian(BAHAI_GREG_Y0 - 1 + yearBE, 3, 21))
         + BigInt(ORIGIN_JDN);
}
function bahaiYearOf(jdnB) {
  const gy = gregorianFromDayIndex(Number(jdnB) - ORIGIN_JDN)[0];
  let y = gy - BAHAI_GREG_Y0 + 1;
  if (jdnB < bahaiNawruz(y)) y -= 1;
  return y;
}
function bahaiFromDi(di) {
  const jdnB = BigInt(ORIGIN_JDN) + BigInt(di);
  const year = bahaiYearOf(jdnB);
  const doy = Number(jdnB - bahaiNawruz(year));
  const ayyam = isGregLeap(BAHAI_GREG_Y0 + year) ? 5 : 4;
  let m, d;
  if (doy < 342) { m = Math.floor(doy / 19) + 1; d = doy % 19 + 1; }
  else if (doy < 342 + ayyam) { m = 0; d = doy - 342 + 1; }  // Ayyám-i-Há
  else { m = 19; d = doy - 342 - ayyam + 1; }
  return { fields: { year, month: m, day: d },
           canonical: `${p4(year)}-${p2(m)}-${p2(d)}` };
}
function bahaiToDi(f) {
  const { year: y, month: m, day: d } = f;
  const ayyam = isGregLeap(BAHAI_GREG_Y0 + y) ? 5 : 4;
  let doy;
  if (m === 0) {
    if (!(d >= 1 && d <= ayyam)) {
      einval(`Ayyám-i-Há tiene ${ayyam} días en ${y} B.E.`);
    }
    doy = 342 + d - 1;
  } else if (m >= 1 && m <= 18) {
    if (!(d >= 1 && d <= 19)) einval("día Badí' fuera de 1..19");
    doy = (m - 1) * 19 + d - 1;
  } else if (m === 19) {
    if (!(d >= 1 && d <= 19)) einval("día Badí' fuera de 1..19");
    doy = 342 + ayyam + d - 1;
  } else {
    einval("mes Badí' fuera de 0..19 (0 = Ayyám-i-Há)");
  }
  return toSafe(bahaiNawruz(y) + BigInt(doy) - BigInt(ORIGIN_JDN));
}

/* ---------------------------------------------------------------------
 * 7. Cuenta Larga Maya (correlación GMT, JDN 584283)
 * ------------------------------------------------------------------ */

function mayaFromDi(di) {
  const days = BigInt(di) + BigInt(ORIGIN_JDN) - 584283n;
  const b = bdiv(days, 144000n);          // sigue contando (no reinicia en 13)
  const r0 = bmod(days, 144000n);
  const k = bdiv(r0, 7200n);
  const t = bdiv(bmod(r0, 7200n), 360n);
  const u = bdiv(bmod(r0, 360n), 20n);
  const n = bmod(r0, 20n);
  const fields = { baktun: Number(b), katun: Number(k), tun: Number(t),
                   uinal: Number(u), kin: Number(n) };
  return { fields,
           canonical: `${b}.${k}.${t}.${u}.${n}` };
}
function mayaToDi(f) {
  const b = f.baktun, k = f.katun, t = f.tun, u = f.uinal, n = f.kin;
  for (const v of [b, k, t, u, n]) {
    if (!Number.isSafeInteger(v)) einval('cuenta larga: campos enteros requeridos');
  }
  if (k > 19 || t > 19 || u > 17 || n > 19 || k < 0 || t < 0 || u < 0 || n < 0) {
    einval('cuenta larga fuera de rango (uinal < 18)');
  }
  // guardia de producto: |b|*144000 debe caber en int64 (paridad con C)
  if (b > 63999999999999n || b < -63999999999999n) {
    erange('baktun fuera del horizonte int64');
  }
  return toSafe(584283n + BigInt(b) * 144000n + BigInt(k) * 7200n + BigInt(t) * 360n
                + BigInt(u) * 20n + BigInt(n) - BigInt(ORIGIN_JDN));
}

/* ---------------------------------------------------------------------
 * 8. Islámico civil tabular (ciclo de 30 años, época JDN 1948440)
 * ------------------------------------------------------------------ */

const ISLAMIC_LEAP = new Set([2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29]);
function islamicIsLeap(y) { return ISLAMIC_LEAP.has(emod(y, 30)); }
/** Días desde la época (BigInt) del 1 Muharram 1..(y). */
function islamicStartB(year) {
  const cycles = bdiv(BigInt(year) - 1n, 30n);
  const rem = Number(bmod(BigInt(year) - 1n, 30n));
  let leaps = 0;
  for (let yy = 1; yy < rem + 1; yy++) if (ISLAMIC_LEAP.has(yy % 30)) leaps++;
  return cycles * 10631n + BigInt(rem * 354 + leaps + 1 - 1);
}
function islamicFromDi(di) {
  const days = BigInt(di) + BigInt(ORIGIN_JDN) - 1948440n;
  let year = Number(bdiv(days * 30n, 10631n)) + 1;
  for (let i = 0; i < 3; i++) {
    if (islamicStartB(year) > days) year -= 1;
    else if (islamicStartB(year + 1) <= days) year += 1;
    else break;
  }
  const doy = Number(days - islamicStartB(year));
  const leap = islamicIsLeap(year);
  let m = 1, d = 1, found = false, cum = 0;
  for (; m <= 12; m++) {
    let L = (m % 2 === 1) ? 30 : 29;
    if (m === 12 && leap) L = 30;
    if (doy < cum + L) { d = doy - cum + 1; found = true; break; }
    cum += L;
  }
  if (!found) einval('día islámico fuera de rango');
  return { fields: { year, month: m, day: d },
           canonical: `${p4(year)}-${p2(m)}-${p2(d)}` };
}
function islamicToDi(f) {
  const { year: y, month: m, day: d } = f;
  if (!(m >= 1 && m <= 12)) einval('mes islámico fuera de 1..12');
  const leap = ISLAMIC_LEAP.has(emod(y, 30));
  let maxd = (m % 2 === 1) ? 30 : 29;
  if (m === 12 && leap) maxd = 30;
  if (!(d >= 1 && d <= maxd)) einval('día islámico inválido');
  // acumulado de meses previos (paridad con Python: meses impares 30)
  let doy = 0;
  for (let mm = 1; mm < m; mm++) {
    doy += (mm % 2 === 1) ? 30 : 29;
  }
  return toSafe(1948440n + islamicStartB(y) + BigInt(doy) + BigInt(d - 1)
                - BigInt(ORIGIN_JDN));
}

/* ---------------------------------------------------------------------
 * 9. Hebreo aritmético (molad BaHaRaD + dehiyot; época JDN 347998)
 * ------------------------------------------------------------------ */

const HEB_BASE = 347996n;
const HEB_HALAKIM_DAY = 25920n;
const HEB_HALAKIM_HOUR = 1080n;
const HEB_TOHU = 2n * 25920n + 5n * 1080n + 204n;
const HEB_MONTH_HALAKIM = 29n * 25920n + 12n * 1080n + 793n;   // 765.433
// Horizonte del molad en int64 (paridad con C y Python)
export const HEB_YEAR_LIMIT = 900000000000;

function hebIsLeapB(y) { return Number(bmod(7n * y + 1n, 19n)) < 7; }
function hebMonthsElapsedB(y) { return bdiv(235n * y - 234n, 19n); }
function hebMoladPartsB(y) {
  const parts = HEB_TOHU + hebMonthsElapsedB(y) * HEB_MONTH_HALAKIM;
  return [bdiv(parts, HEB_HALAKIM_DAY), bmod(parts, HEB_HALAKIM_DAY)];
}
function hebIsLeapNum(y) { return hebIsLeapB(BigInt(y)); }
function hebRH(y) {
  const yB = BigInt(y);
  if (yB > BigInt(HEB_YEAR_LIMIT) || yB < BigInt(-HEB_YEAR_LIMIT)) {
    erange('año hebreo fuera del horizonte del molad int64');
  }
  const [period, parts] = hebMoladPartsB(yB);
  let D = HEB_BASE + period;
  const adu = (d) => {
    const w = Number(bmod(d, 7n));
    return w === 6 || w === 2 || w === 4;  // 0 = lunes: prohibidos dom, mié, vie
  };
  const yLe = hebIsLeapB(yB - 1n);
  const yL = hebIsLeapB(yB);
  // Cascada de dehiyot — ELIF estricto (paridad con Python y C)
  if (parts >= 19440n) {           // molad zaken
    D += 1n;
    if (adu(D)) D += 1n;
  } else if (adu(D)) {             // Lo ADU Rosh
    D += 1n;
    if (Number(bmod(D, 7n)) === 0 && yLe && !yL && parts >= 16789n) D += 1n;
  } else if (Number(bmod(D, 7n)) === 0 && yLe && !yL && parts >= 16789n) {
    D += 1n;                       // BeTUTaKaPaT
  } else if (!yL && Number(bmod(D, 7n)) === 1 && parts >= 9924n) {
    D += 2n;                       // GaTaRaD
  }
  return D;
}
const HEB_MONTH_NAMES_COMMON = ['Nisan', 'Iyar', 'Sivan', 'Tamuz', 'Av', 'Elul',
  'Tishri', 'Heshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar'];
const HEB_MONTH_NAMES_LEAP = ['Nisan', 'Iyar', 'Sivan', 'Tamuz', 'Av', 'Elul',
  'Tishri', 'Heshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar I', 'Adar II'];
function hebMonthName(y, m) {
  return hebIsLeapNum(y) ? HEB_MONTH_NAMES_LEAP[m - 1] : HEB_MONTH_NAMES_COMMON[m - 1];
}
function hebMonthLengths(y) {
  const R = hebRH(y), Rn = hebRH(y + 1);
  const L = Rn - R;
  let h, k;
  if (L === 353n || L === 383n) { h = 29n; k = 29n; }
  else if (L === 354n || L === 384n) { h = 29n; k = 30n; }
  else { h = 30n; k = 30n; }
  const months = hebIsLeapNum(y)
    ? [30n, h, k, 29n, 30n, 30n, 29n]
    : [30n, h, k, 29n, 30n, 29n];
  months.push(30n, 29n, 30n, 29n, 30n, 29n);   // Nisan..Elul
  return months;
}
function hebFromDi(di) {
  const jdn = BigInt(ORIGIN_JDN) + BigInt(di);
  const span = jdn - 347998n;
  if (span > BigInt(HEB_YEAR_LIMIT) * 365n + 2n ||
      span < -(BigInt(HEB_YEAR_LIMIT) * 365n + 2n)) {
    erange('año hebreo fuera del horizonte del molad int64');
  }
  // estimación O(1) por molad (paridad con Python y C; sin deriva lineal)
  const monthsEst = bdiv((jdn - HEB_BASE) * HEB_HALAKIM_DAY, HEB_MONTH_HALAKIM);
  let year = Number(bdiv(19n * monthsEst - 19n + 234n, 235n) + 1n);
  let guard = 0;
  for (; guard < 9; guard++) {
    if (hebRH(year) > jdn) year -= 1;
    else if (hebRH(year + 1) <= jdn) year += 1;
    else break;
  }
  if (guard === 9) einval('día hebreo fuera de año');
  const doy = jdn - hebRH(year);   // BigInt
  const months = hebMonthLengths(year);
  const leap = hebIsLeapNum(year);
  let mc = 1, day = 1, found = false;
  let cum = 0n;
  for (; mc <= months.length; mc++) {
    const L = months[mc - 1];
    if (doy < cum + L) { day = Number(doy - cum + 1n); found = true; break; }
    cum += L;
  }
  if (!found) einval('día hebreo fuera de año');
  // civil → rabínico: 1 = Nisan ... 7 = Tishri; 12/13 = Adar I/II
  const m = leap
    ? (mc <= 7 ? mc + 6 : mc - 7)
    : (mc <= 6 ? mc + 6 : mc - 6);
  return { fields: { year, month: m, day },
           canonical: `${p4(year)}-${p2(m)}-${p2(day)} (${hebMonthName(year, m)})` };
}
function hebToDi(f) {
  const y = f.year, m = f.month, d = f.day;
  if (y > HEB_YEAR_LIMIT || y < -HEB_YEAR_LIMIT) {
    erange('año hebreo fuera del horizonte del molad int64');
  }
  const leap = hebIsLeapNum(y);
  if (!(m >= 1 && m <= (leap ? 13 : 12))) {
    einval(`mes hebreo inválido: ${m} (numeración rabínica: 1 = Nisan ... `
           + '12 = Adar I/Adar, 13 = Adar II)');
  }
  const months = hebMonthLengths(y);
  const mc = (m <= 6) ? (leap ? m + 7 : m + 6) : (m - 6);
  if (!(mc >= 1 && mc <= months.length)) einval('mes hebreo inválido');
  const len = Number(months[mc - 1]);
  if (!(d >= 1 && d <= len)) {
    einval(`día hebreo inválido (mes ${m} tiene ${len})`);
  }
  let cum = 0n;
  for (let i = 1; i < mc; i++) cum += months[i - 1];
  return toSafe(hebRH(y) + cum + BigInt(d - 1) - BigInt(ORIGIN_JDN));
}

/* ---------------------------------------------------------------------
 * 10. Chino lunisolar computacional (tabla SHUO/ZHONGQI 1645..2650)
 * ------------------------------------------------------------------ */

const CHINA_MIN_YEAR = 1645;
const CHINA_MAX_YEAR = 2650;
const ZQ_DONGZHI_RESIDUE = 3;   // k ≡ 3 (mod 12) ⇒ Dongzhi
const _SHUO = SHUO;
const _ZQ = ZHONGQI;

function chinaBisect(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid + 1; else hi = mid;
  }
  return lo - 1;
}
function chinaCheck(jdn) {
  const y = jdnToGreg(jdn)[0];
  if (y < CHINA_MIN_YEAR || y > CHINA_MAX_YEAR) {
    eunsupported(`fecha china fuera del rango validado ` +
      `${CHINA_MIN_YEAR}..${CHINA_MAX_YEAR} d.C.`);
  }
}
function jdnToGreg(j) { return gregorianFromDayIndex(j - ORIGIN_JDN); }
function chinaContainsZQ(i) {
  if (_SHUO[i + 1] > _ZQ[_ZQ.length - 1]) return true;
  return chinaBisect(_ZQ, _SHUO[i + 1] - 1) !== chinaBisect(_ZQ, _SHUO[i] - 1);
}
function chinaDongzhiLunation(k) { return chinaBisect(_SHUO, _ZQ[k]); }
function chinaLastDongzhi(before) {
  const k = chinaBisect(_ZQ, before);
  return k - emod(k - ZQ_DONGZHI_RESIDUE, 12);
}
function chinaFromDi(di) {
  const jdn = di + ORIGIN_JDN;
  chinaCheck(jdn);
  const i = chinaBisect(_SHUO, jdn);
  if (i < 0 || i >= _SHUO.length - 1) {
    eunsupported('fecha china fuera de la tabla');
  }
  let kd = chinaLastDongzhi(_SHUO[i + 1] - 1);
  let s11 = chinaDongzhiLunation(kd);
  if (i < s11) { kd -= 12; s11 = chinaDongzhiLunation(kd); }
  const s11n = chinaDongzhiLunation(kd + 12);
  let leapI = null;
  if (s11n - s11 > 12) {
    for (let j = s11 + 1; j < s11n; j++) {
      if (!chinaContainsZQ(j)) { leapI = j; break; }
    }
    if (leapI === null) einval('año chino de 13 lunaciones sin mes intercalar');
  }
  const y0 = jdnToGreg(_SHUO[s11])[0];
  if (i === s11) {
    const day = jdn - _SHUO[s11] + 1;
    return { fields: { year: y0, month: 11, day, leap: false },
             canonical: `${y0}M11D${p2(day)}` };
  }
  let cm = 11;
  for (let j = s11 + 1; j < s11n; j++) {
    let month, leap, mm;
    if (j === leapI) { month = cm; leap = true; mm = cm; }
    else {
      cm = (cm === 11) ? 12 : (cm === 12 ? 1 : cm + 1);
      month = cm; leap = false; mm = cm;
    }
    const year = (month >= 1 && mm >= 1) ? (month === 11 || month === 12 ? y0 : y0 + 1) : y0;
    if (j === i) {
      const day = jdn - _SHUO[j] + 1;
      return { fields: { year, month, day, leap },
               canonical: `${year}M${month}${leap ? 'l' : ''}D${p2(day)}` };
    }
  }
  einval('lunación china no numerable');
}
function chinaMonthIndex(year, month, leap) {
  const kd = chinaLastDongzhi(gregJdn(month >= 11 ? year : year - 1, 12, 31));
  const s11 = chinaDongzhiLunation(kd);
  const s11n = chinaDongzhiLunation(kd + 12);
  let leapI = null;
  if (s11n - s11 === 13) {
    for (let j = s11 + 1; j < s11n; j++) {
      if (!chinaContainsZQ(j)) { leapI = j; break; }
    }
  }
  let mm = 0, ll = false;
  for (let j = s11; j < s11n; j++) {
    if (j === s11) { mm = 11; ll = false; }
    else if (j === leapI) { ll = true; }
    else { mm = mm < 12 ? mm + 1 : 1; ll = false; }
    if (mm === month && ll === leap) return j;
  }
  einval(`no existe ${leap ? 'el mes intercalar ' : 'el mes '}${month} en el año lunar ${year}`);
}
function gregJdn(y, m, d) {
  return dayIndexFromGregorian(y, m, d) + ORIGIN_JDN;
}
function chinaToDi(f) {
  const year = f.year, month = f.month, day = f.day;
  const leap = Boolean(f.leap);
  if (!(month >= 1 && month <= 12)) einval('mes chino fuera de 1..12');
  if (!(year >= CHINA_MIN_YEAR && year <= CHINA_MAX_YEAR)) {
    eunsupported(`año chino ${year} fuera de ` +
      `${CHINA_MIN_YEAR}..${CHINA_MAX_YEAR}`);
  }
  const j = chinaMonthIndex(year, month, leap);
  const L = _SHUO[j + 1] - _SHUO[j];
  if (!(day >= 1 && day <= L)) {
    einval(`el mes ${month} de ${year} tiene ${L} días`);
  }
  return _SHUO[j] + day - 1 - ORIGIN_JDN;
}

/* ---------------------------------------------------------------------
 * Despacho y metadatos (paridad con los 10 sistemas)
 * ------------------------------------------------------------------ */

const SYSTEMS = {
  gus: {
    from: gusFromDi, to: gusToDi,
    field_names: ['year', 'month', 'day'],
  },
  greg: { from: gregFromDi, to: gregToDi, field_names: ['year', 'month', 'day'] },
  julian: { from: julianFromDi, to: julianToDi, field_names: ['year', 'month', 'day'] },
  egyptian: { from: egyptianFromDi, to: egyptianToDi, field_names: ['year', 'month', 'day'] },
  ethiopic: { from: ethiopicFromDi, to: ethiopicToDi, field_names: ['year', 'month', 'day'] },
  bahai: { from: bahaiFromDi, to: bahaiToDi, field_names: ['year', 'month', 'day'] },
  maya: { from: mayaFromDi, to: mayaToDi,
          field_names: ['baktun', 'katun', 'tun', 'uinal', 'kin'] },
  islamic: { from: islamicFromDi, to: islamicToDi, field_names: ['year', 'month', 'day'] },
  hebrew: { from: hebFromDi, to: hebToDi, field_names: ['year', 'month', 'day'] },
  chinese: { from: chinaFromDi, to: chinaToDi, field_names: ['year', 'month', 'day', 'leap'] },
};
export const GUTI_SYSTEM_IDS = Object.keys(SYSTEMS);

export const GUTI_METADATA = {
  gus: {
    id: 'gus', name: 'Gerarion (DY/AY)', version: '3.0.0',
    type: 'integrado-aritmetico', epoch_jdn: ORIGIN_JDN,
    supported_range: ['0000DY-01-01 (JDN 1719313)', 'dominio ±2^53-1 días'],
    astronomical_dependency: 'ninguna',
    reference_meridian: 'escala TCJ (TAI + 8.400 s)',
    known_limitations: ['núcleo congelado GUS v3.0.0'],
  },
  greg: {
    id: 'greg', name: 'Gregoriano proléptico', version: '1.0.0',
    type: 'solar-arithmetical', epoch_jdn: dayIndexFromGregorian(1, 1, 1) + ORIGIN_JDN,
    supported_range: ['años proleptics negativos', '±2^53-1 días'],
    astronomical_dependency: 'ninguna',
    reference_meridian: 'sin hora (cuenta de días)',
    known_limitations: ['sin cambio de fecha por hora local'],
  },
  julian: {
    id: 'julian', name: 'Juliano proléptico', version: '1.0.0',
    type: 'solar-arithmetical', epoch_jdn: 1721424,
    supported_range: ['años prolépticos negativos', '±2^53-1 días'],
    astronomical_dependency: 'ninguna',
    reference_meridian: 'sin hora (cuenta de días)',
    known_limitations: ['bisiesto cada 4 años sin excepción centesimal'],
  },
  egyptian: {
    id: 'egyptian', name: 'Egipcio antiguo (vago)', version: '1.0.0',
    type: 'solar-fijo', epoch_jdn: 1448638,
    supported_range: ['época Nabonassar', '±2^53-1 días'],
    astronomical_dependency: 'ninguna',
    reference_meridian: 'sin hora (cuenta de días)',
    known_limitations: ['el año vago se desplaza frente a las estaciones'],
  },
  ethiopic: {
    id: 'ethiopic', name: 'Etíope (Amete Mihrêt)', version: '1.0.0',
    type: 'solar-arithmetical', epoch_jdn: 1724221,
    supported_range: ['época Amete Mihrêt', '±2^53-1 días'],
    astronomical_dependency: 'ninguna',
    reference_meridian: 'sin hora (cuenta de días)',
    known_limitations: [],
  },
  bahai: {
    id: 'bahai', name: "Bahá'í (Badí' tabular)", version: '1.0.0',
    type: 'solar-tabular', epoch_jdn: 2394647,
    supported_range: ['Naw-Rúz 1 B.E. = 21-03-1844 greg.', '±2^53-1 días'],
    astronomical_dependency: 'ninguna (Naw-Rúz fijo el 21 de marzo gregoriano)',
    reference_meridian: 'sin hora (cuenta de días)',
    known_limitations: [
      "variante tabular; el Naw-Rúz observacional (Teherán) puede diferir un día",
    ],
  },
  maya: {
    id: 'maya', name: 'Cuenta Larga Maya', version: '1.0.0',
    type: 'proleptico-arithmetical', epoch_jdn: 584283,
    supported_range: ['baktun continuo (negativo incl.)', '±2^53-1 días'],
    astronomical_dependency: 'ninguna (correlación GMT 584283)',
    reference_meridian: 'sin hora (cuenta de días)',
    known_limitations: ['correlación GMT/584283'],
  },
  islamic: {
    id: 'islamic', name: 'Islámico civil (tabular)', version: '1.0.0',
    type: 'lunar-tabular', epoch_jdn: 1948440,
    supported_range: ['época Hégira tabular', '±2^53-1 días'],
    astronomical_dependency: 'ninguna en tiempo de ejecución',
    reference_meridian: 'sin hora (cuenta de días)',
    known_limitations: [
      'TABULAR: el inicio del mes observado localmente puede diferir ±1 día',
      'los meses 30 solo existen en los meses impares y el mes 12 de años bisiestos',
    ],
  },
  hebrew: {
    id: 'hebrew', name: 'Hebreo (aritmético)', version: '1.0.0',
    type: 'lunisolar-arithmetical', epoch_jdn: 347998,
    supported_range: ['AM 1 (−3761 d.C. proléptico)', 'AM 900.000.000.000'],
    astronomical_dependency: 'ninguna en tiempo de ejecución (molad BaHaRaD + dehiyot)',
    reference_meridian: 'Jerusalén (histórico)',
    known_limitations: ['numeración rabínica: 1 = Nisan, 7 = Tishri, 12/13 = Adar I/II'],
  },
  chinese: {
    id: 'chinese', name: 'Chino lunisolar (computacional)', version: '1.0.0',
    type: 'lunisolar-astronomical', epoch_jdn: 2319912,
    supported_range: ['1645 d.C.', '2650 d.C. tras la reforma Shixian'],
    astronomical_dependency: 'tabla SHUO/ZHONGQI generada (meridiano de Pekín UTC+8)',
    reference_meridian: 'Pekín: UTC+8 / 120°E',
    known_limitations: [
      'rango validado estricto 1645–2650 (fuera: GERO_EUNSUPPORTED)',
    ],
  },
};

/** metadatos estructurados del sistema pedido. */
export function gutiMetadata(sys) {
  const s = SYSTEMS[sys];
  if (!s) return null;
  return { ...GUTI_METADATA[sys], field_names: s.field_names };
}

/** Fecha de un day_index en el sistema pedido (lanza GutiError GERO_*). */
export function gutiFromDayIndex(dayIndex, sys) {
  if (!Number.isSafeInteger(dayIndex)) {
    erange(`day_index fuera del rango exacto de Number (±2^53-1): ${dayIndex}`);
  }
  const s = SYSTEMS[sys];
  if (!s) einval(`sistema desconocido: ${sys}`);
  if (dayIndex > JS_SAFE - ORIGIN_JDN || dayIndex < -JS_SAFE - ORIGIN_JDN) {
    erange('day_index fuera del dominio exacto de Number');
  }
  return s.from(dayIndex);
}

/** day_index de los campos pedidos (lanza GutiError GERO_*). */
export function gutiToDayIndex(sys, fields) {
  const s = SYSTEMS[sys];
  if (!s) einval(`sistema desconocido: ${sys}`);
  return s.to(fields);
}

/** ¿Es una fecha válida? (sin lanzar) */
export function gutiValidate(sys, fields) {
  try { SYSTEMS[sys].to(fields); return true; } catch { return false; }
}

export default { GUTI_SYSTEM_IDS, GUTI_METADATA, gutiMetadata,
                 gutiFromDayIndex, gutiToDayIndex, gutiValidate, GutiError };
