from __future__ import annotations

from .common import AdapterResult


def get_lead(lead_id: str) -> AdapterResult:
    if not lead_id:
        return AdapterResult(success=False, error='lead_id is required')
    return AdapterResult(
        success=True,
        data={
            'lead_id': lead_id,
            'source': 'crm',
            'status': 'placeholder',
        },
    )

