from __future__ import annotations

from functools import lru_cache
from typing import Any

from fastapi import APIRouter

from core.docs import CloudflareDocsCatalog

router = APIRouter(prefix='/v1/docs/cloudflare', tags=['docs'])


@lru_cache(maxsize=1)
def docs_catalog() -> CloudflareDocsCatalog:
    return CloudflareDocsCatalog.from_env()


@router.get('/catalog')
async def get_catalog() -> dict[str, Any]:
    items = docs_catalog().catalog()
    return {'items': items, 'count': len(items)}


@router.post('/search')
async def search_catalog(body: dict[str, Any]) -> dict[str, Any]:
    query = str(body.get('query') or '').strip()
    limit = int(body.get('limit') or 5)
    items = docs_catalog().search(query, limit=limit)
    return {'items': items, 'count': len(items), 'query': query}
