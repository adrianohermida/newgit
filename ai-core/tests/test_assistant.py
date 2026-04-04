import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.assistant import SessionHistory

def test_session_history():
    sh = SessionHistory()
    sh.add_message("Olá")
    sh.add_message("Mundo")
    assert sh.get_history() == ["Olá", "Mundo"]
    sh.clear()
    assert sh.get_history() == []
