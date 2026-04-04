from __future__ import annotations

import os
import shutil
import sys
import unittest
from pathlib import Path
from uuid import uuid4

AI_CORE_ROOT = Path(__file__).resolve().parents[1]
if str(AI_CORE_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_CORE_ROOT))


class TempPathsMixin(unittest.TestCase):
    def make_temp_dir(self, root_name: str) -> Path:
        root = Path(root_name)
        root.mkdir(parents=True, exist_ok=True)
        target = root / uuid4().hex
        target.mkdir(parents=True, exist_ok=True)
        self.addCleanup(lambda: shutil.rmtree(target.parent, ignore_errors=True))
        return target

    def make_temp_vault(self) -> Path:
        return self.make_temp_dir('.test_tmp_obsidian')

    def make_temp_memory_dir(self) -> Path:
        return self.make_temp_dir('.test_tmp_memory')

    def make_temp_session_dir(self) -> Path:
        return self.make_temp_dir('.test_tmp_sessions')

    def set_env(self, key: str, value: str) -> None:
        original = os.environ.get(key)

        def restore() -> None:
            if original is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = original

        os.environ[key] = value
        self.addCleanup(restore)
