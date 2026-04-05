def build_feature_flags(env=None):
    """
    Retorna um dicionário de feature flags para ativar/desativar recursos do sistema.
    """
    return {
        "chat": {
            "enabled": True,
            "pythonOrchestrator": True,  # Ativa o novo orchestrador Python
            "skillsDetection": True,
            "hybridOrchestrator": False
        }
    }
