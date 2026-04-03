from __future__ import annotations

from .common import AdapterResult


def get_process(process_number: str) -> AdapterResult:
    if not process_number:
        return AdapterResult(success=False, error='process_number is required')
    return AdapterResult(
        success=True,
        data={
            'process_number': process_number,
            'source': 'process',
            'status': 'placeholder',
        },
    )


def get_processo(numero: str) -> AdapterResult:
    # Compatibility alias for existing callers.
    return get_process(numero)

