# SPDX-License-Identifier: MIT OR Apache-2.0
# SPDX-FileCopyrightText: 2026 verared contributors
"""Dominio CALENDAR — motor multi-calendario determinista (GUTI-1).

Módulos: ``gerarion.calendars.engine`` (los 10 sistemas) y
``gerarion.calendars.china_table`` (tabla lunisolar determinista).

Compatibilidad retroactiva: el antiguo módulo plano ``gerarion.calendars``
(ahora ``gerarion.calendars.engine``) reexporta aquí sus nombres públicos.
"""

from . import engine as _engine
from . import china_table as china_table  # noqa: F401

globals().update(
    {
        _k: _v
        for _k, _v in vars(_engine).items()
        if not _k.startswith("__")
    }
)
