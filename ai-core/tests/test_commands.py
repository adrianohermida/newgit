import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.commands.add_dir import add_dir
from core.commands.advisor import advisor

def test_add_dir():
    result = add_dir("/tmp/testdir")
    assert "criado com sucesso" in result

def test_advisor():
    tip = "Use funções puras."
    result = advisor(tip)
    assert tip in result
    assert result.startswith("Dica do advisor")
