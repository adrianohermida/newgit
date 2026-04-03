from .common import AdapterResult
from .crm_adapter import get_lead
from .financeiro_adapter import get_debts, get_dividas
from .process_adapter import get_process, get_processo
from .supabase_adapter import get_client, get_cliente

__all__ = [
    'AdapterResult',
    'get_client',
    'get_cliente',
    'get_debts',
    'get_dividas',
    'get_lead',
    'get_process',
    'get_processo',
]

