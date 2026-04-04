import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.agents import hello_agent

def test_hello_agent():
    assert hello_agent() == "Olá do agente!"
