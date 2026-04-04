import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.bootstrap import bootstrap_status

def test_bootstrap_status():
    assert bootstrap_status() == "bootstrap subsystem ativo"
