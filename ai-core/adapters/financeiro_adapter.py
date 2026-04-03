from __future__ import annotations

from .common import AdapterResult


def get_debts(client_id: str) -> AdapterResult:
    if not client_id:
        return AdapterResult(success=False, error='client_id is required')
    return AdapterResult(
        success=True,
        data={
            'client_id': client_id,
            'source': 'financial',
            'status': 'placeholder',
            'debts': [],
        },
    )


def get_dividas(cliente_id: str) -> AdapterResult:
    # Compatibility alias for existing callers.
    return get_debts(cliente_id)

