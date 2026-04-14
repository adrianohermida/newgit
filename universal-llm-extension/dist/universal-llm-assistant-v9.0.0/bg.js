/**
 * Background Service Worker - Funcionalidade Real
 */

console.log('🚀 Background service worker iniciando...');

// ============= OPEN PANEL =============
chrome.action.onClicked.addListener(async (tab) => {
  console.log('📌 Abrindo painel...');
  if (tab.id) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
      console.log('✅ Painel aberto');
    } catch (error) {
      console.error('❌ Erro ao abrir painel:', error);
    }
  }
});

// ============= ON INSTALLED =============
chrome.runtime.onInstalled.addListener(() => {
  console.log('✅ Extensão instalada');

  // Configurações padrão
  chrome.storage.local.set({
    provider: 'ollama',
    model: 'llama2',
    settings: {
      ollama: { url: 'http://localhost:11434', model: 'llama2' },
      openai: { apiKey: '', model: 'gpt-3.5-turbo' },
      claude: { apiKey: '', model: 'claude-3-sonnet-20240229' },
      gemini: { apiKey: '', model: 'gemini-pro' }
    }
  });
});

console.log('✅ Background service worker carregado');
