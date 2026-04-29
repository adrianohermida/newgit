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
import sys
from requests.exceptions import RequestException


BASE_URL = "http://api.hermidamaia.adv.br"  # Altere para a URL do seu ambiente
API_AGENDAR = f"{BASE_URL}/api/agendar"

erros = []

# Dados de teste
nome = "Teste Agendamento Bot"
email = f"bot+{random.randint(1000,9999)}@exemplo.com"
telefone = f"1199{random.randint(1000000,9999999)}"
area = "Cível"
data = time.strftime("%Y-%m-%d", time.localtime(time.time() + 5*24*3600))  # 5 dias à frente
hora = "09:00"


def print_divisor():
    print("\n" + ("-"*60))

def log_erro(msg):
    print(f"[ERRO] {msg}")
    erros.append(msg)

def testar_endpoint():
    print_divisor()
    print(f"[CHECK] Testando disponibilidade do endpoint: {API_AGENDAR}")
    try:
        inicio = time.time()
        resp = requests.options(API_AGENDAR, timeout=10)
        dur = time.time() - inicio
        print(f"[CHECK] Status: {resp.status_code} | Tempo: {dur:.2f}s | Headers: {dict(resp.headers)}")
        if resp.status_code >= 500:
            log_erro(f"Endpoint retornou status {resp.status_code} na checagem inicial.")
            return False
        return True
    except RequestException as e:
        log_erro(f"Falha ao conectar no endpoint: {e}")
        return False

print(f"Testando agendamento para {nome}, {email}, {data} {hora}")

if not testar_endpoint():
    print("[FIM] Endpoint indisponível. Corrija antes de prosseguir.")
    sys.exit(2)


# 1. Criar agendamento
print_divisor()
print("[1] Criando agendamento...")
try:
    inicio = time.time()
    resp = requests.post(API_AGENDAR, json={
        "nome": nome,
        "email": email,
        "telefone": telefone,
        "area": area,
        "data": data,
        "hora": hora,
        "observacoes": "Teste automatizado."
    }, timeout=15)
    dur = time.time() - inicio
    print(f"[1] Status: {resp.status_code} | Tempo: {dur:.2f}s | Headers: {dict(resp.headers)}")
except RequestException as e:
    log_erro(f"Falha de conexão ao criar agendamento: {e}")
    sys.exit(1)

if resp.status_code != 200:
    log_erro(f"Falha ao criar agendamento: {resp.status_code} {resp.text}")
    sys.exit(1)
try:
    result = resp.json()
except Exception as e:
    log_erro(f"Resposta não é JSON válido: {resp.status_code} {resp.text}")
    sys.exit(1)
if not result.get("ok"):
    log_erro(f"API retornou erro: {result}")
    sys.exit(1)
print("[OK] Agendamento criado:", result)


# 2. Extrair links de ação (confirmação, remarcação, cancelamento)
links = result.get("actionLinks") or {}
if not links:
    log_erro("Links de ação não retornados pela API. Verifique implementação.")
    sys.exit(1)


# 3. Testar confirmação
print_divisor()
print("[3] Testando confirmação...")
conf_url = links.get("cliente", {}).get("confirmar")
if conf_url:
    try:
        inicio = time.time()
        conf_resp = requests.get(conf_url, timeout=10)
        dur = time.time() - inicio
        print(f"[CONFIRMAÇÃO] Status: {conf_resp.status_code} | Tempo: {dur:.2f}s | Headers: {dict(conf_resp.headers)}")
        if conf_resp.status_code != 200:
            log_erro(f"Falha na confirmação: {conf_resp.status_code} {conf_resp.text}")
    except RequestException as e:
        log_erro(f"Erro de conexão ao confirmar: {e}")
else:
    log_erro("Link de confirmação não encontrado.")


# 4. Testar remarcação (simula acesso ao link)
print_divisor()
print("[4] Testando remarcação...")
remarcar_url = links.get("cliente", {}).get("remarcar")
if remarcar_url:
    try:
        inicio = time.time()
        remarcar_resp = requests.get(remarcar_url, timeout=10)
        dur = time.time() - inicio
        print(f"[REMARCAÇÃO] Status: {remarcar_resp.status_code} | Tempo: {dur:.2f}s | Headers: {dict(remarcar_resp.headers)}")
        if remarcar_resp.status_code != 200:
            log_erro(f"Falha na remarcação: {remarcar_resp.status_code} {remarcar_resp.text}")
    except RequestException as e:
        log_erro(f"Erro de conexão ao remarcar: {e}")
else:
    log_erro("Link de remarcação não encontrado.")


# 5. Testar cancelamento
print_divisor()
print("[5] Testando cancelamento...")
cancelar_url = links.get("cliente", {}).get("cancelar")
if cancelar_url:
    try:
        inicio = time.time()
        cancelar_resp = requests.get(cancelar_url, timeout=10)
        dur = time.time() - inicio
        print(f"[CANCELAMENTO] Status: {cancelar_resp.status_code} | Tempo: {dur:.2f}s | Headers: {dict(cancelar_resp.headers)}")
        if cancelar_resp.status_code != 200:
            log_erro(f"Falha no cancelamento: {cancelar_resp.status_code} {cancelar_resp.text}")
    except RequestException as e:
        log_erro(f"Erro de conexão ao cancelar: {e}")
else:
    log_erro("Link de cancelamento não encontrado.")


print_divisor()
print("\nResumo final do teste:")
if erros:
    print(f"Foram encontrados {len(erros)} erro(s):")
    for i, erro in enumerate(erros, 1):
        print(f"  {i}. {erro}")
    print("\n[ATENÇÃO] Corrija os pontos acima para prosseguir.")
else:
    print("Nenhum erro crítico detectado no fluxo automatizado.")
print("\nTeste concluído. Verifique os e-mails recebidos e logs do backend para detalhes.")
