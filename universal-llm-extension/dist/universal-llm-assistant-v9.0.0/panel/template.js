export function buildPanelMarkup() {
  return `
    <div class="header">
      <div class="header-left">
        <span class="logo">LLM</span>
        <div class="provider-row">
          <select id="provider-select" title="Selecionar provider LLM">
            <option value="local">AetherLab Local</option>
            <option value="cloud">LLM Customizado</option>
            <option value="cloudflare">Cloudflare Workers AI</option>
          </select>
        </div>
      </div>
      <div class="header-right">
        <span id="provider-badge"></span>
        <span id="status-dot" class="status-dot"></span>
        <button id="btn-settings" class="icon-btn" title="Configuracoes">⚙</button>
      </div>
    </div>
    <div class="tabs">
      <button id="tab-chat" class="tab-btn active">Chat</button>
      <button id="tab-sessions" class="tab-btn">Sessoes</button>
      <button id="tab-tasks" class="tab-btn">Tasks</button>
      <button id="tab-automations" class="tab-btn">Automacoes</button>
      <button id="tab-settings" class="tab-btn">Config</button>
    </div>
    <section id="pane-chat" class="pane active-pane">
      <div id="chat-area" class="chat-area"><div class="empty-state"><div class="empty-icon">🧠</div><div class="empty-title">LLM Assistant</div><div class="empty-sub">Converse com o bridge local, capture tela, envie arquivos e acompanhe sessoes.</div></div></div>
      <div class="input-area">
        <div class="actions-row">
          <button id="btn-page-text" class="act-btn">Pagina</button>
          <button id="btn-selection" class="act-btn">Selecao</button>
          <button id="btn-screenshot" class="act-btn">Print</button>
          <button id="btn-upload" class="act-btn">Arquivo</button>
          <button id="btn-record" class="act-btn">Gravar</button>
          <button id="btn-replay" class="act-btn">Replay</button>
          <span id="recorder-status" class="inline-status">Parado</span>
        </div>
        <div class="input-row">
          <div class="textarea-wrap"><textarea id="msg-input" placeholder="Escreva sua mensagem..."></textarea></div>
          <button id="btn-send" class="btn-send">Enviar</button>
        </div>
        <input id="file-input" type="file" />
      </div>
    </section>
    <section id="pane-sessions" class="pane list-pane"></section>
    <section id="pane-tasks" class="pane list-pane"></section>
    <section id="pane-automations" class="pane list-pane"></section>
    <section id="pane-settings" class="pane settings-pane">
      <div class="setting-section"><h4>Local</h4><label>URL do ai-core<input id="input-runtime-url" /></label><label>Modelo local<input id="input-runtime-model" /></label><div class="test-row"><button id="btn-test-local" class="btn-test">Testar conexao</button><span id="test-local-result" class="test-result"></span></div><div id="test-local-detail" class="test-detail"></div></div>
      <div class="setting-section"><h4>Cloud</h4><label>URL da aplicacao/proxy<input id="input-app-url" /></label><label>URL direta da API cloud<input id="input-cloud-base-url" placeholder="Opcional: https://..."/></label><label>Token cloud/admin<input id="input-cloud-auth-token" type="password" placeholder="Bearer admin ou token direto"/></label><label>Modelo cloud<input id="input-cloud-model" /></label><div class="test-row"><button id="btn-test-cloud" class="btn-test">Testar conexao</button><span id="test-cloud-result" class="test-result"></span></div><div id="test-cloud-detail" class="test-detail"></div></div>
      <div class="setting-section"><h4>Cloudflare</h4><label>Modelo Workers AI<input id="input-cf-model" /></label><label>Account ID<input id="input-cf-account-id" placeholder="Opcional"/></label><label>API Token<input id="input-cf-api-token" type="password" placeholder="Opcional"/></label><div class="test-row"><button id="btn-test-cf" class="btn-test">Testar conexao</button><span id="test-cf-result" class="test-result"></span></div><div id="test-cf-detail" class="test-detail"></div></div>
      <button id="btn-save-settings" class="btn-save">Salvar configuracoes</button>
    </section>
  `;
}
