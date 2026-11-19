# Calendario Gerarion y motor multi-calendario

Parte de la suite de referencia **Gerarion** (verared/gerarion `v3.2.2`,
Gerarion Universal Standard). Este directorio es un **paquete de
exportación** listo para publicarse (o consumirse) como repositorio
satélite `verared/gt-calendar`; conserva las rutas relativas del repositorio
base para componer módulos.

## El problema único que resuelve

El año regular AY/DY con Gran Tempalum simétrico y el motor determinista de conversión con 10 sistemas calendáricos externos (GUTI-1), todo pivotando sobre day_index/JDN con aritmética entera pura.

## Estado normativo

- **Estable** (`maturity: stable`) — línea base `v3.2.2` (aritmética y vectores
  congelados: GUS v3.0.0).
- Especificación(es) incluida(s): `docs/specs/CALENDAR.es.md`, `docs/specs/CALENDAR.en.md`
- Manifiesto de integridad verificable: [`EXPORT-MANIFEST.json`](EXPORT-MANIFEST.json)
- Matriz oficial de compatibilidad: [`COMPATIBILITY.md`](https://github.com/verared/gerarion/blob/v3.2.2/COMPATIBILITY.md)

## Dependencias

- `gt-core` (*verared/gt-core*): tipos base y servicios del núcleo.
Base común: `verared/gerarion` `v3.2.2`.

## Contenido

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

## Uso offline

No requiere red, cuentas, registro de paquetes ni frameworks:

```bash
python3 -c 'import sys; sys.path.insert(0, "src"); import gerarion'
```

## Verificación

Con Python ≥ 3.9 y `reuse` instalado:

```bash
reuse lint                                    # licencias al 100 %
# (las pruebas viven en la suite de verared/gerarion)
```

Desde `verared/gerarion`, la integridad completa contra `EXPORT-MANIFEST.json` se verifica con:

```bash
python3 tools/export_module.py --verify-existing /ruta/a/gt-calendar
```

## Contrato de sincronización con `verared/gerarion`

Este paquete es **generado, no editado a mano**: se regenera byte a
byte desde `verared/gerarion v3.2.2` con
`python3 tools/export_module.py --module gt-calendar --out <dir>`. La fuente
de verdad normativa (especificaciones, vectores CC0, núcleos de
referencia de las tres plataformas y la batería completa) permanece en
`verared/gerarion`; los satélites `verared/gt-calendar` la consumen y no forkean la
aritmética. Las actualizaciones fluyen regenerando la exportación desde
un tag del repositorio base; nunca editando los archivos exportados.
