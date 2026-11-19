# CALENDAR Specification — Gerarion Calendar and Multi-Calendar Engine

- **Status:** Stable (normative, frozen math) · **Version:** 1.0.0 · **Baseline:** GUS v3.1.1
- **Consolidated edition:** [`../en/gus-3.0.0.md`](../en/gus-3.0.0.md) (§3–§4, Appendix A) ·
  Consolidates here: [`../en/CALENDAR-ENGINE.md`](../en/CALENDAR-ENGINE.md)
- **License:** CC-BY-4.0 · Maintained by: verared contributors

## 1. Scope

The regular Gerarion calendar (months, Tempalum, `DY`/`AY` eras, invariant
week) and the deterministic conversion engine with **10 external calendar
systems** (phase GUTI-1). Everything pivots on `day_index`/JDN with pure
integer arithmetic.

## 2. Normative rules

1. **Structure:** 12 months × 30 days (360) + Tempalum (month 00) of 4 or
   11 days. Common year 364 = 52 weeks; Great Tempalum 371 = 53 weeks.
2. **Origin:** `0000DY-01-01-S` ≡ **JDN 1,719,313** (21 March of −5
   proleptic, astronomical year −5). It is a **fixed, deterministic and
   reproducible mathematical epoch**, decoupled from historiography
   (Appendix A.4: a fork changes the base JDN, never the algorithm).
3. **Symmetric Great Tempalum (closed O(1) form):** with `S = 1,242,190`
   µd and `U = 7,000,000` µd, for every integer `year`:
   `r_y = ((year mod U)+U) mod U`; `r = (r_y × S) mod U`;
   `GT(year) ⟺ r + S ≥ U`. **Euclidean** modulo, valid in both AY and DY;
   `year_start_day_index(year) = year×364 + 7×(q×S + floor(r_y×S/U))`.
4. **Exact mean length:** `364 + 7·(1,242,190/7,000,000) = 365.24219`
   days (exact rational, five exact decimals, no floating point).
5. **Solar drift:** `|ysi(n) − n·L| < 7 days` for all `n ∈ ℤ`
   (Euclidean-remainder invariant `R_n ∈ [0, U)`; proof in Appendix A.2
   and `docs/papers/drift-acotado.md`).
6. **Perpetual weekly invariance:** `364 ≡ 371 ≡ 0 (mod 7)`; 1-1 of every
   year falls on Soludyia; `weekday(d) = ((d mod 7)+7) mod 7`.
7. **Multi-calendar engine (10 systems):** proleptic Gregorian, proleptic
   Julian, Egyptian wandering, Ethiopian, Bahá'í (Badí'), Maya Long
   Count, tabular civil Islamic, arithmetic Hebrew (cascading dehiyot,
   Adar I/II months with rabbinic numbering), computational Chinese
   lunisolar (deterministic SHUO/ZHONGQI table, Beijing meridian UTC+8,
   validated range 1645–2650, `runyue` leap months), plus the Gerarion
   core. Every adapter exposes structured metadata (`id`, `name`,
   `version`, `epoch_jdn`, `supported_range`, `astronomical_dependency`,
   `reference_meridian`, `known_limitations`) and bidirectional
   operations (`from/to_day_index`, `from/to_instant`, `validate_date`).
8. **Primitive separation:** `Instant` (int64 seconds + `nanos`),
   `CalendarDate` (projected date) and `LocalTime` (civil presentation
   with offset `TCJ±O`) are never merged.
9. **Out of range:** a date outside a calendar's declared range returns
   an explicit error (`GERO_EUNSUPPORTED`), never a silent approximation.

## 3. Sources of truth

| Platform | Implementation |
|---|---|
| Python | `src/gerarion/calendars/` (`engine.py` + `china_table.py`) |
| C11 | `impl-c/calendars/gerarion_calendars.c` + `china_table.c` |
| JavaScript | `web/engine/guti.mjs` + `web/engine/china-table.mjs` |

## 4. Applicable vectors

- `vectors/guti-calendars-001.json` — 63,545 cases: cross-conversions
  A→GUS→B and B→GUS→A, range edges, invalid inputs.
- `vectors/gus-normative-003.json` and `gus-regression-001.json` — AY/DY
  core and Great Tempalum.

## 5. Maturity and limits

- Core math **frozen** since v3.0.0; the common vector domain is bounded
  to |di| ≤ 2⁴⁸−1 (web core precision limit); platform extremes are
  exercised in native suites.
- Chinese calendar: documented divergence ≤ 1 day at limit nights
  (1700/1751/1851/2050) versus full ephemerides; tolerance declared in
  `CALENDAR-ENGINE.md`.
- Civil Islamic: tabular nature declared; it does not replace local
  lunar observation. Maya: proleptic negative baktun accepted with an
  int64 overflow guard.

## 6. References

- `docs/en/CALENDAR-ENGINE.md` (EN/ES) and `docs/papers/drift-acotado.md`
- GUTI-1 section of `docs/en/audit/AUDIT-REPORT-v3.0.0.md`.
