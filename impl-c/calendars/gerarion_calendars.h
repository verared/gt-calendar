/*
 * SPDX-License-Identifier: MIT OR Apache-2.0
 * SPDX-FileCopyrightText: 2026 verared contributors
 */

/*
 * gerarion_calendars.h — Motor multi-calendario determinista (fase GUTI-1).
 *
 * Diez sistemas calendáricos que pivotan sobre el day_index GUS (días desde
 * GUS_ORIGIN_JDN), con aritmética ENTERA pura: sin punto flotante, sin
 * `Intl`, sin red y sin asignación dinámica. La paridad bit a bit con
 * src/gerarion/calendars.py y web/calendars.mjs se demuestra con los
 * vectores CC0 de vectors/guti-calendars-001.json.
 *
 * Separación estricta (Cap 13.1 GUS 3.0.0): `Instant` (segundos int64 +
 * nanos uint32) ↔ `CalendarDate` (esta capa) ↔ `LocalTime` (presentación
 * civil con offset TCJ±O).
 */

#ifndef GERARION_CALENDARS_H
#define GERARION_CALENDARS_H

#include <stdint.h>
#include <stddef.h>
#include "../core/gus_core.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Código extendido para fechas fuera del rango validado de un sistema
 * (p. ej. chino fuera de 1645..2650 d.C.): nunca se extrapola. */
#define GERARION_EUNSUPPORTED 5

/* Sistemas (orden estable, sincronizado con los metadatos de las tres
 * implementaciones y con vectors/guti-calendars-001.json). */
enum {
    GER_CAL_GUS = 0,
    GER_CAL_GREG = 1,
    GER_CAL_JULIAN = 2,
    GER_CAL_EGYPTIAN = 3,
    GER_CAL_ETHIOPIC = 4,
    GER_CAL_BAHAI = 5,
    GER_CAL_MAYA = 6,
    GER_CAL_ISLAMIC = 7,
    GER_CAL_HEBREW = 8,
    GER_CAL_CHINESE = 9,
    GER_CAL_COUNT = 10
};

/* Fecha proyectada: hasta 5 campos enteros (`count` activos) y una marca
 * `leap` (mes intercalar chino). Para 'maya':
 * f = {baktun, katun, tun, uinal, kin}. Para el resto: f = {year, month, day}
 * (más `leap` en chino). Sin asignación dinámica. */
typedef struct {
    long long f[5];
    int count;
    int leap;
} GerarionCalDate;

/* Identifica un sistema por su id canónico ("gus".."chinese"); -1 si es
 * desconocido. */
int gerarion_cal_system_from_id(const char *id);

/* id canónico, número de campos, época JDN y metadatos inmutables. */
const char *gerarion_cal_id(int system);
int gerarion_cal_field_count(int system);
long long gerarion_cal_epoch_jdn(int system);

/* day_index GUS -> fecha en `system`. Devuelve GUS_OK, GUS_EINVAL
 * (sistema/argumento inválido), GUS_ERANGE (fuera de los límites int64
 * seguros) o GERARION_EUNSUPPORTED (fuera del rango validado del sistema). */
int gerarion_cal_from_day_index(long long day_index, int system,
                                GerarionCalDate *out);

/* Fecha en `system` -> day_index GUS. Mismos códigos de retorno. */
int gerarion_cal_to_day_index(int system, const GerarionCalDate *date,
                              long long *out);

/* Autocomprobación compacta sin dependencias: devuelve el número de
 * comprobaciones fallidas (0 == todo correcto). */
int gerarion_cal_selfcheck(void);

#ifdef __cplusplus
}
#endif

#endif /* GERARION_CALENDARS_H */
