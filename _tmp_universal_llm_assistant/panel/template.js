export function buildPanelMarkup() {
  return `
    <div class="header">
      <div class="header-left">
        <div class="brand-mark">AI</div>
        <div class="brand-copy">
          <div class="brand-title">Universal LLM Assistant</div>
          <div class="brand-sub">Copiloto operacional do navegador</div>
        </div>
      </div>
      <div class="header-right">
        <div class="provider-pill">
          <span id="status-dot" class="status-dot"></span>
          <select id="provider-select" title="Selecionar provider LLM">
            <option value="local">Ai-Core Local</option>
            <option value="cloud">LLM Customizado</option>
            <option value="cloudflare">Cloudflare Workers AI</option>
          </select>
          <span id="provider-badge"></span>
        </div>
        <button id="btn-errors" class="icon-btn" title="Ver logs">LOG</button>
        <button id="btn-settings" class="icon-btn" title="Configuracoes">CFG</button>
      </div>
    </div>
    <div class="tabs">
      <button id="tab-chat" class="tab-btn active">Chat</button>
      <button id="tab-sessions" class="tab-btn">Sessoes</button>
      <button id="tab-tasks" class="tab-btn">Tasks</button>
      <button id="tab-automations" class="tab-btn">Automacoes</button>
    </div>
    <section id="pane-chat" class="pane active-pane">
      <div class="chat-shell">
        <div class="chat-hero">
          <div class="chat-hero-top">
            <div>
              <div class="chat-hero-title">Assistente operacional</div>
              <div class="chat-hero-sub">Memoria local, contexto de pagina, tasks auditaveis e automacoes em um fluxo unico.</div>
            </div>
            <div class="chat-hero-badges">
              <span class="hero-pill">Navegador</span>
              <span class="hero-pill">Ai-Tasks</span>
              <span class="hero-pill">Memoria</span>
            </div>
          </div>
          <div id="memory-strip" class="memory-strip hidden">
            <span id="memory-strip-badge" class="memory-badge">Memoria local</span>
            <span id="memory-strip-text" class="memory-strip-text"></span>
          </div>
          <div id="asset-group-strip" class="asset-group-strip hidden">
            <div class="asset-group-strip-main">
              <span id="asset-group-badge" class="asset-group-badge">Pacote ativo</span>
              <span id="asset-group-text" class="asset-group-text"></span>
            </div>
            <div class="asset-group-strip-actions">
              <span id="asset-group-meta" class="asset-group-meta"></span>
              <button id="btn-clear-asset-group" class="btn-list-action" type="button">Limpar</button>
            </div>
          </div>
          <div id="runtime-strip" class="runtime-strip hidden">
            <div class="runtime-strip-main">
              <span id="runtime-strip-badge" class="runtime-badge">Pronto</span>
              <span id="runtime-strip-text" class="runtime-strip-text"></span>
            </div>
            <span id="runtime-strip-queue" class="runtime-strip-queue"></span>
          </div>
          <div id="workspace-strip" class="asset-group-strip hidden">
            <div class="asset-group-strip-main">
              <span class="asset-group-badge">Workspace</span>
              <span id="workspace-strip-text" class="asset-group-text"></span>
            </div>
            <div class="asset-group-strip-actions">
              <span id="workspace-strip-meta" class="asset-group-meta"></span>
              <button id="btn-refresh-workspace" class="btn-list-action" type="button">Atualizar</button>
            </div>
          </div>
        </div>
        <div id="chat-area" class="chat-area">
          <div class="empty-state">
            <div class="empty-title">Pronto para operar</div>
            <div class="empty-sub">Leia pagina, envie arquivos, capture tela e transforme o contexto real em acoes e respostas.</div>
          </div>
        </div>
      </div>
      <div class="input-area">
        <div class="actions-row">
          <div class="action-group">
            <button id="btn-agent-tab" class="act-btn compact-btn" title="Nova guia do agente">+ Guia</button>
            <button id="btn-page-text" class="act-btn">Ler pagina</button>
            <button id="btn-selection" class="act-btn">Selecao</button>
            <button id="btn-screenshot" class="act-btn">Tela</button>
            <button id="btn-upload" class="act-btn">Anexar</button>
          </div>
          <div class="action-group action-group-secondary">
            <button id="btn-record" class="act-btn">Gravar</button>
            <button id="btn-replay" class="act-btn ghost-btn">Replay</button>
            <button id="btn-camera" class="act-btn compact-btn ghost-btn" title="Ativar camera">Cam</button>
            <button id="btn-voice" class="act-btn compact-btn ghost-btn" title="Audio ligado ou desligado">Som</button>
            <button id="btn-lang" class="act-btn compact-btn ghost-btn" title="Idioma">PT</button>
            <button id="btn-mic" class="act-btn compact-btn ghost-btn" title="Falar com o assistente">Mic</button>
          </div>
          <span id="recorder-status" class="inline-status">Parado</span>
        </div>
        <div class="input-row">
          <div class="textarea-wrap"><textarea id="msg-input" placeholder="Escreva a meta, pergunta ou instrucao..."></textarea></div>
          <button id="btn-send" class="btn-send">Enviar</button>
        </div>
        <input id="file-input" type="file" multiple />
      </div>
    </section>
    <section id="pane-sessions" class="pane list-pane"></section>
    <section id="pane-tasks" class="pane list-pane"></section>
    <section id="pane-automations" class="pane list-pane"></section>
    <section id="pane-settings" class="overlay-pane">
      <div class="overlay-card">
        <div class="view-toolbar">
          <div class="view-title-wrap">
            <div class="view-title">Configuracoes</div>
            <div class="view-subtitle">Providers, modelos e conectividade do ambiente local.</div>
          </div>
          <div class="view-actions">
            <button id="btn-close-settings" class="btn-list-action">Fechar</button>
          </div>
        </div>
        <div class="settings-pane">
          <div class="setting-section"><h4>Local</h4><label>URL do ai-core<input id="input-runtime-url" /></label><label>Modelo local<input id="input-runtime-model" /></label><label class="checkbox-row"><input id="input-always-allow-tabs" type="checkbox" /> Permitir acesso recorrente do assistente as guias sem pedir toda vez</label><label>Pastas locais permitidas<textarea id="input-local-roots" rows="4" placeholder="Uma pasta por linha"></textarea></label><label>Aplicativos locais permitidos<textarea id="input-local-apps" rows="5" placeholder='JSON por linha: {"name":"Obsidian","path":"C:\\\\Users\\\\...\\\\Obsidian.exe","args":[]}'></textarea></label><div class="test-row"><button id="btn-test-local" class="btn-test">Testar conexao</button><span id="test-local-result" class="test-result"></span></div><div id="test-local-detail" class="test-detail"></div></div>
          <div class="setting-section"><h4>Cloud</h4><label>URL da aplicacao/proxy<input id="input-app-url" /></label><label>URL direta da API cloud<input id="input-cloud-base-url" placeholder="Opcional: https://..."/></label><label>Token cloud/admin<input id="input-cloud-auth-token" type="password" placeholder="Bearer admin ou token direto"/></label><label>Modelo cloud<input id="input-cloud-model" /></label><div class="test-row"><button id="btn-test-cloud" class="btn-test">Testar conexao</button><span id="test-cloud-result" class="test-result"></span></div><div id="test-cloud-detail" class="test-detail"></div></div>
          <div class="setting-section"><h4>Cloudflare</h4><label>Modelo Workers AI<input id="input-cf-model" /></label><label>Account ID<input id="input-cf-account-id" placeholder="Opcional"/></label><label>API Token<input id="input-cf-api-token" type="password" placeholder="Opcional"/></label><div class="test-row"><button id="btn-test-cf" class="btn-test">Testar conexao</button><span id="test-cf-result" class="test-result"></span></div><div id="test-cf-detail" class="test-detail"></div></div>
          <button id="btn-save-settings" class="btn-save">Salvar configuracoes</button>
        </div>
      </div>
    </section>
    <section id="pane-camera" class="overlay-pane">
      <div class="overlay-card camera-card">
        <div class="view-toolbar">
          <div class="view-title-wrap">
            <div class="view-title">Camera</div>
            <div class="view-subtitle">Preview local para captura de contexto visual.</div>
          </div>
          <div class="view-actions">
            <button id="btn-close-camera" class="btn-list-action">Fechar</button>
          </div>
        </div>
        <div class="camera-wrap">
          <video id="camera-preview" autoplay playsinline muted></video>
          <canvas id="camera-canvas" class="hidden"></canvas>
        </div>
        <div class="list-item-actions" style="margin-top:10px">
          <button id="btn-capture-camera" class="btn-list-action">Capturar frame</button>
        </div>
      </div>
    </section>
    <section id="pane-errors" class="overlay-pane"></section>
  `;
}
