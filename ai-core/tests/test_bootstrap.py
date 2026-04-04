from core.bootstrap import bootstrap_status

def test_bootstrap_status():
    assert bootstrap_status() == "bootstrap subsystem ativo"
