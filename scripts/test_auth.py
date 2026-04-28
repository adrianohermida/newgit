# test_auth.py
"""
Script de diagnóstico para autenticação nas páginas de login (portal e interno).
- Testa endpoints de configuração pública e autenticação.
- Valida resposta e traz detalhes de erro para troubleshooting.

Requisitos: requests
pip install requests
"""
import requests

BASE_URL = "http://localhost:8788"  # Altere para a URL do seu ambiente

# 1. Testar endpoint de configuração pública do Supabase
print("Testando /api/admin-auth-config...")
resp = requests.get(f"{BASE_URL}/api/admin-auth-config")
print("Status:", resp.status_code)
try:
    data = resp.json()
    print("Resposta:", data)
    if not data.get("ok"):
        print("[ERRO] Configuração pública do Supabase ausente ou inválida.")
        exit(1)
except Exception as e:
    print("[ERRO] Falha ao decodificar resposta JSON:", e)
    print(resp.text)
    exit(1)

# 2. Testar endpoint de configuração pública do Freshchat (se usado no login)
print("\nTestando /api/public-chat-config...")
resp = requests.get(f"{BASE_URL}/api/public-chat-config")
print("Status:", resp.status_code)
try:
    data = resp.json()
    print("Resposta:", data)
    if not data.get("ok"):
        print("[ERRO] Configuração pública do Freshchat ausente ou inválida.")
except Exception as e:
    print("[ERRO] Falha ao decodificar resposta JSON:", e)
    print(resp.text)

# 3. (Opcional) Testar login Supabase direto (se credenciais de teste disponíveis)
# Exemplo:
# from supabase import create_client, Client
# url = data['url']
# anon_key = data['anonKey']
# supabase: Client = create_client(url, anon_key)
# user = supabase.auth.sign_in_with_password({"email": "teste@exemplo.com", "password": "senha"})

print("\nDiagnóstico concluído. Se algum endpoint retornou erro, revise variáveis de ambiente e deploy.")
