from __future__ import annotations

import json
from pathlib import Path

from .models import OrchestrationError, OrchestrationResult, OrchestrationState
from .orchestrator import Coordinator
from .services import DefaultRagService, NullMemoryNoteSink, ObsidianMemoryNoteSink

SNAPSHOT_PATH = Path(__file__).resolve().parent.parent / 'reference_data' / 'subsystems' / 'coordinator.json'
_SNAPSHOT = json.loads(SNAPSHOT_PATH.read_text())

ARCHIVE_NAME = _SNAPSHOT['archive_name']
MODULE_COUNT = _SNAPSHOT['module_count']
SAMPLE_FILES = tuple(_SNAPSHOT['sample_files'])
PORTING_NOTE = f"Python placeholder package for '{ARCHIVE_NAME}' with {MODULE_COUNT} archived module references."

__all__ = [
    'ARCHIVE_NAME',
    'Coordinator',
    'DefaultRagService',
    'MODULE_COUNT',
    'NullMemoryNoteSink',
    'ObsidianMemoryNoteSink',
    'OrchestrationError',
    'OrchestrationResult',
    'OrchestrationState',
    'PORTING_NOTE',
    'SAMPLE_FILES',
]
