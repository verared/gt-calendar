/*
 * SPDX-License-Identifier: MIT OR Apache-2.0
 * SPDX-FileCopyrightText: 2026 verared contributors
 */

/*
 * gerarion_calendars.c — Motor multi-calendario determinista (GUTI-1).
 *
 * Aritmética entera pura (C11, sin UB): cada cociente usa división con
 * redondeo al piso (fdiv) para reproducir exactamente el comportamiento
 * de `//` en Python y de las fórmulas de web/calendars.mjs. La tabla china
 * es un dato entero tabulado (china_table.h); fuera de su rango validado
 * se devuelve GERARION_EUNSUPPORTED, jamás una extrapolación.
 */

#include "gerarion_calendars.h"
#include "china_table.h"

#include <string.h>

/* ---- división y módulo con redondeo al piso (paridad con Python) ------- */

static long long fdiv_ll(long long a, long long b) {
    long long q = a / b;
    long long r = a % b;
    if (r != 0 && ((r < 0) != (b < 0)))
        q -= 1;
    return q;
}

static long long fmod_ll(long long a, long long b) {
    return a - fdiv_ll(a, b) * b;
}

/* límites de seguridad: cualquier resultado intermedio debe caber en int64 */
#define GER_ABS_DI_LIMIT GUS_MAX_DAY_INDEX_SAFE

static int ger_range_fail(long long day_index) {
    if (day_index > GER_ABS_DI_LIMIT)
        return GUS_ERANGE;
    if (day_index < -GER_ABS_DI_LIMIT)
        return GUS_ERANGE;
    return GUS_OK;
}

/* ---- GUS (núcleo congelado) --------------------------------------------- */

static int ger_gus_from_di(long long di, GerarionCalDate *o) {
    GusDate d;
    int rc = gus_to_gerarion(di, &d);
    if (rc != GUS_OK)
        return rc;
    o->f[0] = d.year;
    o->f[1] = d.month;
    o->f[2] = d.day;
    o->count = 3;
    o->leap = 0;
    return GUS_OK;
}

static int ger_gus_to_di(int system, const GerarionCalDate *d, long long *o) {
    (void)system;
    GusDate out;
    GusError rc = gus_from_gerarion(d->f[0], (int)d->f[1], (int)d->f[2], &out);
    if (rc != GUS_OK)
        return rc;
    *o = out.day_index;
    return GUS_OK;
}

/* ---- Gregoriano proléptico ---------------------------------------------- */

static int ger_greg_from_di(long long di, GerarionCalDate *o) {
    long long y;
    int m, d;
    int rc = gus_gregorian_from_day_index(di, &y, &m, &d);
    if (rc != GUS_OK)
        return rc;
    o->f[0] = y;
    o->f[1] = m;
    o->f[2] = d;
    o->count = 3;
    o->leap = 0;
    return GUS_OK;
}

/* validación estricta de fechas gregorianas prolépticas (sin normalización
 * silenciosa; el núcleo GUS acepta fechas equivalentes tras corregirlas) */
static int ger_greg_is_leap(long long y);

static int ger_greg_validate(long long y, long long m, long long d) {
    if (m < 1 || m > 12)
        return GUS_EINVAL;
    long long md[12] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    if (m == 2 && ger_greg_is_leap(y))
        md[1] = 29;
    if (d < 1 || d > md[m - 1])
        return GUS_EINVAL;
    return GUS_OK;
}

static int ger_greg_to_di(int system, const GerarionCalDate *d, long long *o) {
    (void)system;
    int rc = ger_greg_validate(d->f[0], d->f[1], d->f[2]);
    if (rc != GUS_OK)
        return rc;
    return gus_day_index_from_gregorian(d->f[0], (int)d->f[1], (int)d->f[2], o);
}

/* ---- Juliano proléptico (época JDN 1721424 = 1-1-1 juliano) -------------- */

static int ger_jul_from_di(long long di, GerarionCalDate *o) {
    int rc = ger_range_fail(di);
    if (rc != GUS_OK)
        return rc;
    long long jdn = di + GUS_ORIGIN_JDN;
    long long c = jdn + 32082; /* c > 0; c×4 desbordaría: descomponer */
    long long q = fdiv_ll(c, 1461);
    long long r = fmod_ll(c, 1461);
    long long dd = q * 4 + (4 * r + 3) / 1461;      /* años julianos exactos */
    static const long long TAU[4] = {0, 365, 730, 1095};
    long long s = (4 * r + 3) / 1461;
    long long e = r - TAU[(s < 3) ? s : 3];          /* día del año 0..365 */
    long long m = (5 * e + 2) / 153;
    o->f[2] = e - (153 * m + 2) / 5 + 1;
    o->f[1] = m + 3 - 12 * fdiv_ll(m, 10);
    o->f[0] = dd - 4800 + fdiv_ll(m, 10);
    o->count = 3;
    o->leap = 0;
    return GUS_OK;
}

static int ger_jul_to_di(int system, const GerarionCalDate *d, long long *o) {
    (void)system;
    long long y = d->f[0], m = d->f[1], day = d->f[2];
    int rc = ger_range_fail(y);
    if (rc != GUS_OK)
        return rc;
    if (m < 1 || m > 12 || day < 1)
        return GUS_EINVAL;
    static const long long month_days[12] = {31, 28, 31, 30, 31, 30,
                                             31, 31, 30, 31, 30, 31};
    long long maxd = month_days[m - 1];
    if (m == 2 && fmod_ll(y, 4) == 0)
        maxd = 29;
    if (day > maxd)
        return GUS_EINVAL;
    long long a = fdiv_ll(14 - m, 12);
    long long yy = y + 4800 - a;
    long long mm = m + 12 * a - 3;
    long long jdn = day + (153 * mm + 2) / 5 + 365 * yy + fdiv_ll(yy, 4) - 32083;
    *o = jdn - GUS_ORIGIN_JDN;
    return GUS_OK;
}

/* ---- Egipcio antiguo, año vago (época Nabonassar JDN 1448638) ------------ */

static int ger_egy_from_di(long long di, GerarionCalDate *o) {
    int rc = ger_range_fail(di);
    if (rc != GUS_OK)
        return rc;
    long long days = di + GUS_ORIGIN_JDN - 1448638LL;
    o->f[0] = fdiv_ll(days, 365) + 1;
    long long doy = fmod_ll(days, 365);
    if (doy < 360) {
        o->f[1] = doy / 30 + 1;
        o->f[2] = doy % 30 + 1;
    } else {
        o->f[1] = 13;
        o->f[2] = doy - 360 + 1; /* epagómenos como mes 13 */
    }
    o->count = 3;
    o->leap = 0;
    return GUS_OK;
}

static int ger_egy_to_di(int system, const GerarionCalDate *d, long long *o) {
    (void)system;
    long long y = d->f[0], m = d->f[1], day = d->f[2];
    long long maxd = (m == 13) ? 5 : 30;
    if (m < 1 || m > 13 || day < 1 || day > maxd)
        return GUS_EINVAL;
    *o = 1448638LL + (y - 1) * 365 + (m - 1) * 30 + (day - 1) - GUS_ORIGIN_JDN;
    return ger_range_fail(*o);
}

/* ---- Etíope, Amete Mihrêt (época JDN 1724221) ---------------------------- */

static long long ger_eth_jdn_1_1(long long year) {
    /* ciclo juliano de 1461 días; el +366 precede a los años múltiplos de 4 */
    return 1724221LL + 365 * (year - 1) + fdiv_ll(year, 4);
}

/* inversa exacta del ciclo juliano de 1461 días sin multiplicar N×4:
 * Y ≋ floor((4·N + 1463)/1461) descompuesto como 4q + s sobre (q, r,N) */
static long long ger_eth_year_of(long long jdn) {
    long long N = jdn - 1724221LL;
    long long q = fdiv_ll(N, 1461);
    long long r = fmod_ll(N, 1461);
    long long s = (4 * r + 1463) / 1461; /* 1..4 para r en el ciclo */
    return 4 * q + s;
}

static int ger_eth_from_di(long long di, GerarionCalDate *o) {
    int rc = ger_range_fail(di);
    if (rc != GUS_OK)
        return rc;
    long long jdn = di + GUS_ORIGIN_JDN;
    long long year = ger_eth_year_of(jdn);
    while (ger_eth_jdn_1_1(year) > jdn)
        year -= 1;
    while (ger_eth_jdn_1_1(year + 1) <= jdn)
        year += 1;
    long long doy = jdn - ger_eth_jdn_1_1(year);
    if (doy < 360) {
        o->f[1] = doy / 30 + 1;
        o->f[2] = doy % 30 + 1;
    } else {
        o->f[1] = 13;
        o->f[2] = doy - 360 + 1; /* Pagume */
    }
    o->f[0] = year;
    o->count = 3;
    o->leap = 0;
    return GUS_OK;
}

static int ger_eth_leap(long long year) {
    return fmod_ll(year, 4) == 3;
}

static int ger_eth_to_di(int system, const GerarionCalDate *d, long long *o) {
    (void)system;
    long long y = d->f[0], m = d->f[1], day = d->f[2];
    int rc = ger_range_fail(y);
    if (rc != GUS_OK)
        return rc;
    if (m < 1 || m > 13 || day < 1 || day > 30)
        return GUS_EINVAL;
    if (m == 13) {
        long long maxd = ger_eth_leap(y) ? 6 : 5;
        if (day > maxd)
            return GUS_EINVAL;
    }
    *o = ger_eth_jdn_1_1(y) + (m - 1) * 30 + (day - 1) - GUS_ORIGIN_JDN;
    return GUS_OK;
}

/* ---- Bahá'í (Badí' tabular, alineado al 21 de marzo gregoriano) ---------- */

static int ger_greg_is_leap(long long y) {
    return (fmod_ll(y, 4) == 0) && (fmod_ll(y, 100) != 0 || fmod_ll(y, 400) == 0);
}

static long long ger_greg_jdn(long long y, int m, int d) {
    long long a = (m <= 2) ? 1 : 0;
    long long yy = y + 4800 - a;
    long long mm = (long long)m + 12 * a - 3;
    long long jdn = (long long)d + (153 * mm + 2) / 5 + 365 * yy
                    + fdiv_ll(yy, 4) - fdiv_ll(yy, 100) + fdiv_ll(yy, 400)
                    - 32045;
    return jdn;
}

/* año gregoriano (numeración astronómica) de un JDN, con el núcleo GUS;
 * 0 = éxito, otro código = no representable (se propaga) */
static int ger_greg_jdn_year_of(long long jdn, long long *year) {
    long long y;
    int m, d;
    int rc = gus_gregorian_from_day_index(jdn - GUS_ORIGIN_JDN, &y, &m, &d);
    if (rc != GUS_OK)
        return rc;
    *year = y;
    return GUS_OK;
}

#define GER_BAHAI_Y0 1844LL

static long long ger_bahai_nawruz(long long year_be) {
    return ger_greg_jdn(GER_BAHAI_Y0 - 1 + year_be, 3, 21);
}

static int ger_bahai_from_di(long long di, GerarionCalDate *o) {
    int rc = ger_range_fail(di);
    if (rc != GUS_OK)
        return rc;
    long long jdn = di + GUS_ORIGIN_JDN;
    long long year;
    rc = ger_greg_jdn_year_of(jdn, &year); /* año gregoriano del JDN */
    if (rc != GUS_OK)
        return rc;
    year = year - GER_BAHAI_Y0 + 1;
    if (jdn < ger_bahai_nawruz(year))
        year -= 1;
    long long doy = jdn - ger_bahai_nawruz(year);
    long long ayyam = ger_greg_is_leap(GER_BAHAI_Y0 + year) ? 5 : 4;
    if (doy < 342) {
        o->f[1] = doy / 19 + 1;
        o->f[2] = doy % 19 + 1;
    } else if (doy < 342 + ayyam) {
        o->f[1] = 0; /* Ayyám-i-Há */
        o->f[2] = doy - 342 + 1;
    } else {
        o->f[1] = 19; /* 'Alá' */
        o->f[2] = doy - 342 - ayyam + 1;
    }
    o->f[0] = year;
    o->count = 3;
    o->leap = 0;
    return GUS_OK;
}

static int ger_bahai_to_di(int system, const GerarionCalDate *d, long long *o) {
    (void)system;
    long long y = d->f[0], m = d->f[1], day = d->f[2];
    int rc = ger_range_fail(y);
    if (rc != GUS_OK)
        return rc;
    long long ayyam = ger_greg_is_leap(GER_BAHAI_Y0 + y) ? 5 : 4;
    long long doy;
    if (m == 0) {
        if (day < 1 || day > ayyam)
            return GUS_EINVAL;
        doy = 342 + day - 1;
    } else if (m >= 1 && m <= 18) {
        if (day < 1 || day > 19)
            return GUS_EINVAL;
        doy = (m - 1) * 19 + day - 1;
    } else if (m == 19) {
        if (day < 1 || day > 19)
            return GUS_EINVAL;
        doy = 342 + ayyam + day - 1;
    } else {
        return GUS_EINVAL;
    }
    *o = ger_bahai_nawruz(y) + doy - GUS_ORIGIN_JDN;
    return GUS_OK;
}

/* ---- Cuenta Larga Maya (correlación GMT, época JDN 584283) --------------- */

static int ger_maya_from_di(long long di, GerarionCalDate *o) {
    int rc = ger_range_fail(di);
    if (rc != GUS_OK)
        return rc;
    long long days = di + GUS_ORIGIN_JDN - 584283LL;
    long long baktun = fdiv_ll(days, 144000);
    long long rest = fmod_ll(days, 144000);
    o->f[0] = baktun;
    o->f[1] = fdiv_ll(rest, 7200);
    rest = fmod_ll(rest, 7200);
    o->f[2] = fdiv_ll(rest, 360);
    rest = fmod_ll(rest, 360);
    o->f[3] = fdiv_ll(rest, 20);
    o->f[4] = fmod_ll(rest, 20);
    o->count = 5;
    o->leap = 0;
    return GUS_OK;
}

static int ger_maya_to_di(int system, const GerarionCalDate *d, long long *o) {
    (void)system;
    if (d->f[1] < 0 || d->f[1] > 19 || d->f[2] < 0 || d->f[2] > 19 ||
        d->f[3] < 0 || d->f[3] > 17 || d->f[4] < 0 || d->f[4] > 19)
        return GUS_EINVAL;
    /* guardia de producto: |b|*144000 debe caber en int64 antes de multiplicar */
    if (d->f[0] > GUS_INT64_MAX / 144000 || d->f[0] < GUS_INT64_MIN / 144000)
        return GUS_ERANGE;
    long long days = d->f[0] * 144000 + d->f[1] * 7200 + d->f[2] * 360
                     + d->f[3] * 20 + d->f[4];
    long long out = 584283LL + days - GUS_ORIGIN_JDN;
    int rc = ger_range_fail(out);
    if (rc != GUS_OK)
        return rc;
    *o = out;
    return GUS_OK;
}

/* ---- Islámico civil tabular (ciclo de 30 años, época JDN 1948440) --------- */

static int ger_islamic_is_leap_year(long long y) {
    long long r = fmod_ll(y, 30);
    switch (r) {
    case 2: case 5: case 7: case 10: case 13:
    case 16: case 18: case 21: case 24: case 26: case 29:
        return 1;
    default:
        return 0;
    }
}

static long long ger_islamic_start(long long year) {
    /* días desde 1 Muharram 1 AH hasta 1 Muharram del `year` dado */
    long long cycles = fdiv_ll(year - 1, 30);
    long long rem = fmod_ll(year - 1, 30);
    long long leaps = 0;
    for (long long k = 1; k <= rem; k++)
        if (ger_islamic_is_leap_year(k))
            leaps += 1;
    return cycles * 10631 + rem * 354 + leaps;
}

static int ger_isl_from_di(long long di, GerarionCalDate *o) {
    int rc = ger_range_fail(di);
    if (rc != GUS_OK)
        return rc;
    long long days = di + GUS_ORIGIN_JDN - 1948440LL;
    /* estimación exacta por ciclo de 10.631 días (30 años) sin days×30 */
    long long q = fdiv_ll(days, 10631);
    long long year = 30 * q + fdiv_ll(fmod_ll(days, 10631) * 30, 10631) + 1;
    while (ger_islamic_start(year) > days)
        year -= 1;
    while (ger_islamic_start(year + 1) <= days)
        year += 1;
    long long doy = days - ger_islamic_start(year);
    long long cum = 0, m = 1, day = 1;
    for (m = 1; m <= 12; m++) {
        long long len = (fmod_ll(m, 2) == 1) ? 30 : 29;
        if (m == 12 && ger_islamic_is_leap_year(year))
            len = 30;
        if (doy < cum + len) {
            day = doy - cum + 1;
            break;
        }
        cum += len;
    }
    o->f[0] = year;
    o->f[1] = m;
    o->f[2] = day;
    o->count = 3;
    o->leap = 0;
    return GUS_OK;
}

static int ger_isl_to_di(int system, const GerarionCalDate *d, long long *o) {
    (void)system;
    long long y = d->f[0], m = d->f[1], day = d->f[2];
    int rc = ger_range_fail(y);
    if (rc != GUS_OK)
        return rc;
    if (m < 1 || m > 12)
        return GUS_EINVAL;
    long long maxd = (fmod_ll(m, 2) == 1) ? 30 : 29;
    if (m == 12 && ger_islamic_is_leap_year(y))
        maxd = 30;
    if (day < 1 || day > maxd)
        return GUS_EINVAL;
    long long doy = 0;
    for (long long mm = 1; mm < m; mm++)
        doy += (fmod_ll(mm, 2) == 1) ? 30 : 29;
    *o = 1948440LL + ger_islamic_start(y) + doy + (day - 1) - GUS_ORIGIN_JDN;
    return GUS_OK;
}

/* ---- Hebreo aritmético (molad BaHaRaD + dehiyot; época JDN 347998) -------- */

#define GER_HEB_BASE 347996LL          /* BaHaRaD = día del molad 2 */
#define GER_HALAKIM_DAY 25920LL
#define GER_HALAKIM_HOUR 1080LL
#define GER_MOLAD_TOHU (2 * 25920 + 5 * 1080 + 204)
#define GER_MOLAD_PER_MONTH (29LL * 25920 + 12LL * 1080 + 793LL) /* 765.433 */

static long long ger_heb_molad_day(long long year, long long *parts) {
    long long months = fdiv_ll(235 * year - 234, 19);
    long long tot = GER_MOLAD_TOHU + months * GER_MOLAD_PER_MONTH;
    *parts = fmod_ll(tot, GER_HALAKIM_DAY);
    return fdiv_ll(tot, GER_HALAKIM_DAY);
}

static long long ger_heb_is_leap(long long year) {
    return fmod_ll(7 * year + 1, 19) < 7;
}

static long long ger_heb_rh(long long year) {
    long long parts;
    long long d = ger_heb_molad_day(year, &parts);
    long long D = GER_HEB_BASE + d;
    /* 0=lunes..6=domingo (JDN 0 es lunes); prohibidos: domingo (6),
     * miércoles (2), viernes (4) — Lo ADU. */
    if (parts >= 19440) {
        /* molad zaken (18 h rituales): +1 y re-chequeo de Lo ADU;
         * tras zaken no se aplica BeTUTaKaPaT. */
        D += 1;
        long long w = fmod_ll(D, 7);
        if (w == 6 || w == 2 || w == 4)
            D += 1;
    } else {
        long long w = fmod_ll(D, 7);
        if (w == 6 || w == 2 || w == 4) {
            D += 1;
            if (fmod_ll(D, 7) == 0 && ger_heb_is_leap(year - 1) &&
                !ger_heb_is_leap(year) && parts >= 16789)
                D += 1; /* domingo -> lunes -> martes (BeTUTaKaPaT) */
        } else if (fmod_ll(D, 7) == 0 && ger_heb_is_leap(year - 1) &&
                   !ger_heb_is_leap(year) && parts >= 16789) {
            D += 1; /* BeTUTaKaPaT: molad lunes directo */
        } else if (!ger_heb_is_leap(year) && fmod_ll(D, 7) == 1 && parts >= 9924) {
            D += 2; /* GaTaRaD: martes -> jueves */
        }
    }
    return D;
}

/* Guardias de desbordamiento: en int64 el molad hebreo (tot = TOHU +
 * meses × 765.433) se satura con |AM| ≈ 9.7e11; se adopta el límite
 * común |AM| ≤ 9e11 (documentado en los metadatos de las tres
 * implementaciones). Fuera de ahí: GUS_ERANGE, sin UB. */
#define GER_HEB_YEAR_LIMIT 900000000000LL

static int ger_heb_from_di(long long di, GerarionCalDate *o) {
    static const long long tail_common[9] = {29, 30, 29, 30, 29, 30, 29, 30, 29};   /* m 4..12 */
    static const long long tail_leap[10]  = {29, 30, 30, 29, 30, 29, 30, 29, 30, 29}; /* m 4..13 */
    int rc = ger_range_fail(di);
    if (rc != GUS_OK)
        return rc;
    long long jdn = di + GUS_ORIGIN_JDN;
    /* descarte barato por división (sin productos) antes del estimador:
     * |jdn - 347998| / 365 ≈ años AM, horizonte GER_HEB_YEAR_LIMIT */
    long long span = jdn - 347998LL;
    if (span > GER_HEB_YEAR_LIMIT * 365LL + 2LL ||
        span < -(GER_HEB_YEAR_LIMIT * 365LL + 2LL))
        return GUS_ERANGE;
    /* estimación O(1) por molad (sin deriva lineal): el escaneo puro
     * acumula error ≈ año/48 días y se vuelve O(año); partiendo del
     * molad invertido el lazo corrige en ≤ 8 iteraciones. */
    long long months_est = fdiv_ll((jdn - GER_HEB_BASE) * GER_HALAKIM_DAY,
                                   GER_MOLAD_PER_MONTH);
    long long year = fdiv_ll(19LL * months_est - 19LL + 234LL, 235LL) + 1;
    if (year > GER_HEB_YEAR_LIMIT || year < -GER_HEB_YEAR_LIMIT)
        return GUS_ERANGE;
    {
        int guard;
        for (guard = 0; guard < 9; guard++) {
            if (ger_heb_rh(year) > jdn)
                year -= 1;
            else if (ger_heb_rh(year + 1) <= jdn)
                year += 1;
            else
                break;
        }
        if (guard == 9)
            return GUS_EINVAL;
    }
    long long doy = jdn - ger_heb_rh(year);
    long long L = ger_heb_rh(year + 1) - ger_heb_rh(year);
    long long h, k;
    if (L == 353 || L == 383) {
        h = 29;
        k = 29;
    } else if (L == 354 || L == 384) {
        h = 29;
        k = 30;
    } else {
        h = 30;
        k = 30;
    }
    int nmonths = ger_heb_is_leap(year) ? 13 : 12;
    const long long *tail = ger_heb_is_leap(year) ? tail_leap : tail_common;
    long long cum = 0, mc = 1, day = 1;
    for (mc = 1; mc <= nmonths; mc++) {
        long long len;
        if (mc == 1)
            len = 30;               /* Tishrei */
        else if (mc == 2)
            len = h;                /* Marheshvan */
        else if (mc == 3)
            len = k;                /* Kislev */
        else
            len = tail[mc - 4];     /* Tevet..Elul (Adar I = 30 en embolismal) */
        if (doy < cum + len) {
            day = doy - cum + 1;
            break;
        }
        cum += len;
    }
    /* numeración RABÍNICA (1 = Nisan ... 7 = Tishri; bisiesto:
     * 12 = Adar I y 13 = Adar II; común: 12 = Adar) */
    long long m;
    if (ger_heb_is_leap(year))
        m = (mc <= 7) ? mc + 6 : mc - 7;
    else
        m = (mc <= 6) ? mc + 6 : mc - 6;
    o->f[0] = year;
    o->f[1] = m;
    o->f[2] = day;
    o->count = 3;
    o->leap = 0;
    return GUS_OK;
}

static int ger_heb_to_di(int system, const GerarionCalDate *d, long long *o) {
    (void)system;
    static const long long tail_common[9] = {29, 30, 29, 30, 29, 30, 29, 30, 29};
    static const long long tail_leap[10]  = {29, 30, 30, 29, 30, 29, 30, 29, 30, 29};
    long long y = d->f[0], m = d->f[1], day = d->f[2];
    int rc = ger_range_fail(y);
    if (rc != GUS_OK)
        return rc;
    /* horizonte del molad en int64: idéntico a la guardia de from_di */
    if (y > GER_HEB_YEAR_LIMIT || y < -GER_HEB_YEAR_LIMIT)
        return GUS_ERANGE;
    long long rh = ger_heb_rh(y);
    long long L = ger_heb_rh(y + 1) - rh;
    long long h, k;
    if (L == 353 || L == 383) {
        h = 29;
        k = 29;
    } else if (L == 354 || L == 384) {
        h = 29;
        k = 30;
    } else {
        h = 30;
        k = 30;
    }
    int nmonths = ger_heb_is_leap(y) ? 13 : 12;
    const long long *tail = ger_heb_is_leap(y) ? tail_leap : tail_common;
    /* rabínico -> civil (Tishri primero): 1..6 = Nisan..Elul -> 8..13/
     * 7..12; 7..12/13 = Tishri..Adar(I/II) -> 1..6/7 */
    long long mc = (m <= 6) ? (ger_heb_is_leap(y) ? m + 7 : m + 6) : (m - 6);
    if (m < 1 || m > nmonths || mc < 1 || mc > nmonths)
        return GUS_EINVAL;
    long long len = (mc == 1) ? 30 : (mc == 2) ? h : (mc == 3) ? k : tail[mc - 4];
    if (day < 1 || day > len)
        return GUS_EINVAL;
    long long cum = 0;
    for (long long mm = 1; mm < mc; mm++) {
        long long lm;
        if (mm == 1)
            lm = 30;
        else if (mm == 2)
            lm = h;
        else if (mm == 3)
            lm = k;
        else
            lm = tail[mm - 4];
        cum += lm;
    }
    *o = rh + cum + (day - 1) - GUS_ORIGIN_JDN;
    return GUS_OK;
}

/* ---- Chino lunisolar computacional (tabla entera, 1645..2650) ------------- */

#define GER_CHINA_MIN 1645LL
#define GER_CHINA_MAX 2650LL

static long long china_bisect(const long long *arr, int len, long long x) {
    int lo = 0, hi = len;
    while (lo < hi) {
        int mid = (lo + hi) / 2;
        if (arr[mid] <= x)
            lo = mid + 1;
        else
            hi = mid;
    }
    return lo - 1;
}

static long long china_contains_zq(long long i) {
    /* ¿cae algún zhongqi en la lunación i ([SHUO[i], SHUO[i+1]))? */
    if (GUS_CHINA_SHUO[i + 1] > GUS_CHINA_ZHONGQI[GUS_CHINA_ZHONGQI_LEN - 1])
        return 1;
    long long a = china_bisect(GUS_CHINA_ZHONGQI, GUS_CHINA_ZHONGQI_LEN, GUS_CHINA_SHUO[i + 1] - 1);
    long long b = china_bisect(GUS_CHINA_ZHONGQI, GUS_CHINA_ZHONGQI_LEN, GUS_CHINA_SHUO[i] - 1);
    return a != b;
}

static long long china_last_dongzhi(long long before) {
    /* ZQ[k] = cruce 270° + 30·(k−3): Dongzhi <=> k ≡ 3 (mod 12) */
    long long k = china_bisect(GUS_CHINA_ZHONGQI, GUS_CHINA_ZHONGQI_LEN, before);
    long long d = fmod_ll(k - 3, 12);
    return k - d;
}

static long long china_dongzhi_lunation(long long k) {
    return china_bisect(GUS_CHINA_SHUO, GUS_CHINA_SHUO_LEN, GUS_CHINA_ZHONGQI[k]);
}

static long long china_greg_jdn(long long y, long long m, long long d) {
    return ger_greg_jdn(y, (int)m, (int)d);
}

static long long china_month_index(long long year, long long month, long long leap,
                                   long long *err) {
    /* ancla: Dongzhi de diciembre del propio año (meses 11..12) o del
     * anterior (meses 1..10) */
    long long gyear = (month >= 11) ? year : year - 1;
    long long kd = china_last_dongzhi(china_greg_jdn(gyear, 12, 31));
    long long s11 = china_dongzhi_lunation(kd);
    long long s11n = china_dongzhi_lunation(kd + 12);
    long long leap_i = -1;
    if (s11n - s11 == 13) {
        for (long long j = s11 + 1; j < s11n; j++) {
            if (!china_contains_zq(j)) {
                leap_i = j;
                break;
            }
        }
    }
    long long mm = 0;
    long long ll = 0;
    for (long long j = s11; j < s11n; j++) {
        if (j == s11) {
            mm = 11;
            ll = 0;
        } else if (j == leap_i) {
            ll = 1; /* intercalar: repite el número del mes anterior */
        } else {
            mm = (mm < 12) ? mm + 1 : 1;
            ll = 0;
        }
        if (mm == month && ll == leap) {
            *err = GUS_OK;
            return j;
        }
    }
    *err = GUS_EINVAL;
    return -1;
}

static int ger_chi_from_di(long long di, GerarionCalDate *o) {
    long long jdn = di + GUS_ORIGIN_JDN;
    long long y, mm;
    int m, dd;
    int rc = gus_gregorian_from_day_index(di, &y, &m, &dd);
    if (rc != GUS_OK)
        return rc;
    (void)m;
    (void)mm;
    (void)dd;
    if (y < GER_CHINA_MIN || y > GER_CHINA_MAX)
        return GERARION_EUNSUPPORTED;
    long long i = china_bisect(GUS_CHINA_SHUO, GUS_CHINA_SHUO_LEN, jdn);
    if (i < 0 || i >= GUS_CHINA_SHUO_LEN - 1)
        return GERARION_EUNSUPPORTED;
    long long kd = china_last_dongzhi(GUS_CHINA_SHUO[i + 1] - 1);
    long long s11 = china_dongzhi_lunation(kd);
    if (i < s11) {
        kd -= 12;
        s11 = china_dongzhi_lunation(kd);
    }
    long long s11n = china_dongzhi_lunation(kd + 12);
    long long leap_i = -1;
    if (s11n - s11 == 13) {
        for (long long j = s11 + 1; j < s11n; j++) {
            if (!china_contains_zq(j)) {
                leap_i = j;
                break;
            }
        }
    }
    long long gyy0;
    int gm, gd;
    rc = gus_gregorian_from_day_index(GUS_CHINA_SHUO[s11] - GUS_ORIGIN_JDN, &gyy0, &gm, &gd);
    if (rc != GUS_OK)
        return rc;
    long long year = gyy0, month = 0, day = jdn - GUS_CHINA_SHUO[i] + 1, ll = 0;
    if (i == s11) {
        month = 11;
    } else {
        long long cm = 11;
        for (long long j = s11 + 1; j < s11n; j++) {
            if (j == leap_i) {
                month = cm;
                ll = 1;
            } else {
                cm = (cm == 11) ? 12 : (cm == 12 ? 1 : cm + 1);
                month = cm;
                ll = 0;
            }
            if (j == i)
                break;
        }
    }
    if (month >= 1 && month <= 10)
        year = gyy0 + 1;
    o->f[0] = year;
    o->f[1] = month;
    o->f[2] = day;
    o->count = 3;
    o->leap = (int)ll;
    return GUS_OK;
}

static int ger_chi_to_di(int system, const GerarionCalDate *d, long long *o) {
    (void)system;
    long long year = d->f[0], month = d->f[1], day = d->f[2], leap = d->leap;
    if (month < 1 || month > 12)
        return GUS_EINVAL;
    if (year < GER_CHINA_MIN || year > GER_CHINA_MAX)
        return GERARION_EUNSUPPORTED;
    long long err;
    long long j = china_month_index(year, month, leap, &err);
    if (err != GUS_OK)
        return err;
    long long L = GUS_CHINA_SHUO[j + 1] - GUS_CHINA_SHUO[j];
    if (day < 1 || day > L)
        return GUS_EINVAL;
    *o = GUS_CHINA_SHUO[j] + day - 1 - GUS_ORIGIN_JDN;
    return GUS_OK;
}

/* ---- despacho ------------------------------------------------------------ */

static const char *const GER_IDS[GER_CAL_COUNT] = {
    "gus", "greg", "julian", "egyptian", "ethiopic",
    "bahai", "maya", "islamic", "hebrew", "chinese",
};

static const int GER_FIELDS[GER_CAL_COUNT] = {3, 3, 3, 3, 3, 3, 5, 3, 3, 3};

static const long long GER_EPOCH[GER_CAL_COUNT] = {
    1719313LL, 1721060LL, 1721424LL, 1448638LL, 1724221LL,
    2394647LL, 584283LL, 1948440LL, 347998LL, 0LL,
};

int gerarion_cal_system_from_id(const char *id) {
    if (!id)
        return -1;
    for (int i = 0; i < GER_CAL_COUNT; i++) {
        const char *a = GER_IDS[i];
        const char *b = id;
        while (*a && *b && *a == *b) {
            a++;
            b++;
        }
        if (*a == '\0' && *b == '\0')
            return i;
    }
    return -1;
}

const char *gerarion_cal_id(int system) {
    if (system < 0 || system >= GER_CAL_COUNT)
        return NULL;
    return GER_IDS[system];
}

int gerarion_cal_field_count(int system) {
    if (system < 0 || system >= GER_CAL_COUNT)
        return -1;
    return GER_FIELDS[system];
}

long long gerarion_cal_epoch_jdn(int system) {
    if (system < 0 || system >= GER_CAL_COUNT)
        return 0;
    return GER_EPOCH[system];
}

typedef int (*GerFromFn)(long long, GerarionCalDate *);
typedef int (*GerToFn)(int, const GerarionCalDate *, long long *);

static const GerFromFn GER_FROM[GER_CAL_COUNT] = {
    ger_gus_from_di, ger_greg_from_di, ger_jul_from_di, ger_egy_from_di,
    ger_eth_from_di, ger_bahai_from_di, ger_maya_from_di, ger_isl_from_di,
    ger_heb_from_di, ger_chi_from_di,
};

static const GerToFn GER_TO[GER_CAL_COUNT] = {
    ger_gus_to_di, ger_greg_to_di, ger_jul_to_di, ger_egy_to_di,
    ger_eth_to_di, ger_bahai_to_di, ger_maya_to_di, ger_isl_to_di,
    ger_heb_to_di, ger_chi_to_di,
};

int gerarion_cal_from_day_index(long long day_index, int system,
                                GerarionCalDate *out) {
    if (system < 0 || system >= GER_CAL_COUNT || !out)
        return GUS_EINVAL;
    int rc = ger_range_fail(day_index);
    if (rc != GUS_OK)
        return rc;
    return GER_FROM[system](day_index, out);
}

int gerarion_cal_to_day_index(int system, const GerarionCalDate *date,
                              long long *out) {
    if (system < 0 || system >= GER_CAL_COUNT || !date || !out)
        return GUS_EINVAL;
    if (date->count != GER_FIELDS[system])
        return GUS_EINVAL;
    return GER_TO[system](system, date, out);
}

/* ---- autocomprobación (equivalente a selfcheck() en Python/JS) ----------- */

static int ger_one(const char *from_id, const GerarionCalDate *f, int to,
                   const GerarionCalDate *want) {
    int src = gerarion_cal_system_from_id(from_id);
    long long di;
    if (gerarion_cal_to_day_index(src, f, &di) != GUS_OK)
        return 1;
    GerarionCalDate got;
    if (gerarion_cal_from_day_index(di, to, &got) != GUS_OK)
        return 1;
    if (got.count != want->count)
        return 1;
    for (int i = 0; i < got.count; i++)
        if (got.f[i] != want->f[i])
            return 1;
    if (got.leap != want->leap)
        return 1;
    return 0;
}

int gerarion_cal_selfcheck(void) {
    int bad = 0;
    GerarionCalDate f, w;

    /* 2012-12-21 greg == 13.0.0.0.0 maya */
    f.f[0] = 2012; f.f[1] = 12; f.f[2] = 21; f.count = 3; f.leap = 0;
    w.f[0] = 13; w.f[1] = 0; w.f[2] = 0; w.f[3] = 0; w.f[4] = 0; w.count = 5; w.leap = 0;
    bad += ger_one("greg", &f, GER_CAL_MAYA, &w);

    /* 1948-05-14 greg == 5 Iyar 5708 (año embolismal: mes 9) */
    f.f[0] = 2012; f.f[1] = 12; f.f[2] = 21; f.count = 3; f.leap = 0;
    f.f[0] = 1948; f.f[1] = 5; f.f[2] = 14;
    w.f[0] = 5708; w.f[1] = 2; w.f[2] = 5; w.count = 3; w.leap = 0;
    bad += ger_one("greg", &f, GER_CAL_HEBREW, &w);

    /* 1844-03-21 greg == Naw-Rúz 1 B.E. */
    f.f[0] = 1844; f.f[1] = 3; f.f[2] = 21;
    w.f[0] = 1; w.f[1] = 1; w.f[2] = 1;
    bad += ger_one("greg", &f, GER_CAL_BAHAI, &w);

    /* 2023-07-19 greg == 1 Muharram 1445 (tabular) */
    f.f[0] = 2023; f.f[1] = 7; f.f[2] = 19;
    w.f[0] = 1445; w.f[1] = 1; w.f[2] = 1;
    bad += ger_one("greg", &f, GER_CAL_ISLAMIC, &w);

    /* 2024-02-10 greg == M1 D1 lunar 2024 */
    f.f[0] = 2024; f.f[1] = 2; f.f[2] = 10;
    w.f[0] = 2024; w.f[1] = 1; w.f[2] = 1; w.leap = 0;
    bad += ger_one("greg", &f, GER_CAL_CHINESE, &w);

    /* Enkutatash: 2025-09-11 greg == Mäskäräm 1, 2018 EC */
    f.f[0] = 2025; f.f[1] = 9; f.f[2] = 11;
    w.f[0] = 2018; w.f[1] = 1; w.f[2] = 1;
    bad += ger_one("greg", &f, GER_CAL_ETHIOPIC, &w);

    /* Duanwu 2024: 2024-06-10 greg == M5 D5 lunar 2024 */
    f.f[0] = 2024; f.f[1] = 6; f.f[2] = 10;
    w.f[0] = 2024; w.f[1] = 5; w.f[2] = 5; w.leap = 0;
    bad += ger_one("greg", &f, GER_CAL_CHINESE, &w);

    return bad;
}
