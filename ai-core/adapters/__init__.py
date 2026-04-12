from .common import AdapterResult
from .crm_adapter import get_lead
from .obsidian_adapter import (
    ObsidianMatch,
    ObsidianRagContext,
    can_use_obsidian,
    get_local_embedding_config,
    get_local_vector_index_config,
    get_obsidian_vault_path,
    search_obsidian_context,
    write_obsidian_memory_note,
)
from .financeiro_adapter import get_debts, get_dividas
from .process_adapter import get_process, get_processo
from .supabase_adapter import get_client, get_cliente

__all__ = [
    'AdapterResult',
    'ObsidianMatch',
    'ObsidianRagContext',
    'can_use_obsidian',
    'get_client',
    'get_cliente',
    'get_local_embedding_config',
    'get_local_vector_index_config',
    'get_obsidian_vault_path',
    'get_debts',
    'get_dividas',
    'get_lead',
    'get_process',
    'get_processo',
    'search_obsidian_context',
    'write_obsidian_memory_note',
]
