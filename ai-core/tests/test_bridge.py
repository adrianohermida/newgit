from core.bridge import bridge_status

def test_bridge_status():
    assert bridge_status() == "bridge subsystem ativo"
