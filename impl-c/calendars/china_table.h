/*
 * SPDX-License-Identifier: CC0-1.0
 * SPDX-FileCopyrightText: 2026 verared contributors
 */

/* Tabla china generada (determinista, CC0): SHUO/ZHONGQI 1640..2655.
 * Regenerar con: python3 tools/generate_china_table.py
 * ZQ[k] = cruce de la longitud solar 270° + 30·(k−3) (k ≡ 3 (mod 12) ⇒ Dongzhi). */

#ifndef GUS_CHINA_TABLE_H
#define GUS_CHINA_TABLE_H

#include <stdint.h>

#define GUS_CHINA_SHUO_LEN 12572
#define GUS_CHINA_ZHONGQI_LEN 12288
#define GUS_CHINA_MIN_YEAR 1645
#define GUS_CHINA_MAX_YEAR 2650

extern const long long GUS_CHINA_SHUO[GUS_CHINA_SHUO_LEN];
extern const long long GUS_CHINA_ZHONGQI[GUS_CHINA_ZHONGQI_LEN];

#endif
