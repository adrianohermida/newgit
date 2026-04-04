import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.bridge import bridge_status

def test_bridge_status():
    assert bridge_status() == "bridge subsystem ativo"
