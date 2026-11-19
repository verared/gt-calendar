# Gerarion calendar and multi-calendar engine

Part of the **Gerarion** reference suite (verared/gerarion `v3.3.0`,
Gerarion Universal Standard). This directory is an **export package**
ready to be published (or consumed) as the `verared/gt-calendar` satellite
repository; it keeps the base repository's relative layout so modules
compose cleanly.

## The unique problem it solves

The regular AY/DY year with symmetric Great Tempalum and the deterministic conversion engine for 10 external calendar systems (GUTI-1), all pivoting on day_index/JDN with pure integer arithmetic.

## Normative status

- **Estable** (`maturity: stable`) — baseline `v3.3.0` (frozen arithmetic and vectors:
  GUS v3.0.0).
- Included specification(s): `docs/specs/CALENDAR.es.md`, `docs/specs/CALENDAR.en.md`
- Verifiable integrity manifest: [`EXPORT-MANIFEST.json`](EXPORT-MANIFEST.json)
- Official compatibility matrix: [`COMPATIBILITY.md`](https://github.com/verared/gerarion/blob/v3.3.0/COMPATIBILITY.md)

## The 5 Distribution Guarantees

| # | Guarantee | Verifiable mechanism |
|---|---|---|
| 1 | **SHA-256 Integrity** | `files` map in [`EXPORT-MANIFEST.json`](EXPORT-MANIFEST.json) checked via `--verify-existing`. |
| 2 | **Declared Provenance** | `source_repo`, `source_tag` (`v3.3.0`), and 40-char `source_commit` fields. |
| 3 | **Publication Authenticity** | Detached Ed25519 signature `EXPORT-MANIFEST.json.sig` verified via `--trusted-pub-key` (zero self-reference). |
| 4 | **Reproducibility** | Bit-for-bit deterministic re-export from the same `--source-commit`. |
| 5 | **Functional Conformance** | Shared CC0 normative vectors and cross-satellite integration tests in C11, Python, and JavaScript. |

## Dependencies

- `gt-core` (*verared/gt-core*): base types and core services.
Common base: `verared/gerarion` `v3.3.0`.

## Contents

- `EXPORT-MANIFEST.json`
- `LICENSE`
- `NOTICE`
- `docs/specs/CALENDAR.en.md`
- `docs/specs/CALENDAR.es.md`
- `impl-c/calendars/china_table.c`
- `impl-c/calendars/china_table.h`
- `impl-c/calendars/gerarion_calendars.c`
- `impl-c/calendars/gerarion_calendars.h`
- `src/gerarion/calendars/__init__.py`
- `src/gerarion/calendars/china_table.py`
- `src/gerarion/calendars/engine.py`
- `vectors/guti-calendars-001.json`
- `web/engine/calendars.mjs`
- `web/engine/china-table.mjs`
- `web/engine/guti.mjs`

## Offline usage

No network, accounts, package registries, or frameworks required:

```bash
python3 -c 'import sys; sys.path.insert(0, "src"); import gerarion'
```

## Verification

With Python ≥ 3.9 and `reuse` installed:

```bash
reuse lint                                    # licensing 100 %
# (las pruebas viven en la suite de verared/gerarion)
```

From `verared/gerarion`, full integrity and (optionally) detached-signature authenticity are verified with:

```bash
python3 tools/export_module.py --verify-existing /path/to/gt-calendar
# With cryptographic verification of EXPORT-MANIFEST.json.sig:
python3 tools/export_module.py --verify-existing /path/to/gt-calendar --trusted-pub-key /path/to/release-pub.pem
```

## Synchronisation contract with `verared/gerarion`

This package is **generated, never hand-edited**: it is regenerated
byte for byte from `verared/gerarion v3.3.0` with
`python3 tools/export_module.py --module gt-calendar --out <dir>`. The
normative source of truth (specifications, CC0 vectors, reference
cores for the three platforms, and the full test suite) stays in
`verared/gerarion`; `verared/gt-calendar` satellites consume it and never fork the
arithmetic. Updates flow by regenerating the export from a tag of the
base repository — never by editing exported files.
