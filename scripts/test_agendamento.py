# test_agendamento.py
"""
Script de teste automatizado para o fluxo de agendamento:
- Cria agendamento
- Testa confirmação, remarcação e cancelamento
- Valida disparo de e-mails (verifica resposta da API)
- Exibe detalhes de falha para troubleshooting

Requisitos: requests
pip install requests
"""
import requests
import random
import string
import time

BASE_URL = "http://localhost:8788"  # Altere para a URL do seu ambiente
API_AGENDAR = f"{BASE_URL}/api/agendar"

# Dados de teste
nome = "Teste Agendamento Bot"
email = f"bot+{random.randint(1000,9999)}@exemplo.com"
telefone = f"1199{random.randint(1000000,9999999)}"
area = "Cível"
data = time.strftime("%Y-%m-%d", time.localtime(time.time() + 5*24*3600))  # 5 dias à frente
hora = "09:00"

print(f"Testando agendamento para {nome}, {email}, {data} {hora}")

# 1. Criar agendamento
resp = requests.post(API_AGENDAR, json={
    "nome": nome,
    "email": email,
    "telefone": telefone,
    "area": area,
    "data": data,
    "hora": hora,
    "observacoes": "Teste automatizado."
})
if resp.status_code != 200:
    print("[ERRO] Falha ao criar agendamento:", resp.text)
    exit(1)
result = resp.json()
if not result.get("ok"):
    print("[ERRO] API retornou erro:", result)
    exit(1)
print("[OK] Agendamento criado:", result)

# 2. Extrair links de ação (confirmação, remarcação, cancelamento)
links = result.get("actionLinks") or {}
if not links:
    print("[ERRO] Links de ação não retornados pela API. Verifique implementação.")
    exit(1)

# 3. Testar confirmação
print("Testando confirmação...")
conf_url = links.get("cliente", {}).get("confirmar")
if conf_url:
    conf_resp = requests.get(conf_url)
    print("[CONFIRMAÇÃO] Status:", conf_resp.status_code, conf_resp.text)
else:
    print("[ERRO] Link de confirmação não encontrado.")

# 4. Testar remarcação (simula acesso ao link)
print("Testando remarcação...")
remarcar_url = links.get("cliente", {}).get("remarcar")
if remarcar_url:
    remarcar_resp = requests.get(remarcar_url)
    print("[REMARCAÇÃO] Status:", remarcar_resp.status_code, remarcar_resp.text)
else:
    print("[ERRO] Link de remarcação não encontrado.")

# 5. Testar cancelamento
print("Testando cancelamento...")
cancelar_url = links.get("cliente", {}).get("cancelar")
if cancelar_url:
    cancelar_resp = requests.get(cancelar_url)
    print("[CANCELAMENTO] Status:", cancelar_resp.status_code, cancelar_resp.text)
else:
    print("[ERRO] Link de cancelamento não encontrado.")

print("\nTeste concluído. Verifique os e-mails recebidos e logs do backend para detalhes.")
