import os
from datetime import datetime

class ObsidianSync:
    BASE_PATH = "D:/ObsidianVault"

    def save(self, query, response):
        filename = datetime.now().strftime("%Y-%m-%d_%H-%M-%S") + ".md"
        content = f"""
# Interação Dotobot

## Pergunta
{query}

## Resposta
{response}
"""
        with open(os.path.join(self.BASE_PATH, filename), "w", encoding="utf-8") as f:
            f.write(content)
