const express = require("express");
const { runCommand, searchFiles } = require("../commands");
const { buildHealthPayload } = require("../health");

function createSystemRouter() {
  const router = express.Router();

  router.get("/health", (_req, res) => {
    res.json(buildHealthPayload());
  });

  router.post("/execute", async (req, res) => {
    try {
      const command = String(req.body?.command || "").trim();
      const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
      if (!command) return res.status(400).json({ ok: false, error: "command obrigatorio" });
      res.json(await runCommand(command, payload));
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message });
    }
  });

  router.post("/search-files", (req, res) => {
    try { res.json(searchFiles(req.body || {})); } catch (error) { res.status(500).json({ ok: false, error: error?.message }); }
  });
  router.post("/web-search", async (req, res) => {
    try { res.json(await runCommand("web_search", req.body || {})); } catch (error) { res.status(500).json({ ok: false, error: error?.message }); }
  });
  router.post("/open-url", async (req, res) => {
    try { res.json(await runCommand("open_url", req.body || {})); } catch (error) { res.status(500).json({ ok: false, error: error?.message }); }
  });

  router.get("/demo/task-lab", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Task Lab | Universal LLM Assistant</title>
  <style>
    :root{
      --bg:#f5f7fb;--card:#fff;--line:#dbe2ea;--text:#111827;--soft:#5b6473;--accent:#111827;--ok:#067647;--warn:#b54708;
      font-family:Arial,"Segoe UI",system-ui,sans-serif;
    }
    *{box-sizing:border-box} body{margin:0;background:linear-gradient(180deg,#f8fafc 0%,#eef2f7 100%);color:var(--text)}
    .wrap{max-width:980px;margin:0 auto;padding:24px}
    .hero,.card{background:var(--card);border:1px solid var(--line);border-radius:20px;box-shadow:0 12px 40px rgba(15,23,42,.06)}
    .hero{padding:20px 22px;margin-bottom:16px}
    .hero h1{margin:0 0 6px;font-size:24px}.hero p{margin:0;color:var(--soft);line-height:1.6}
    .grid{display:grid;grid-template-columns:1.2fr .8fr;gap:16px}
    .card{padding:18px}
    .section-title{margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--soft)}
    .stack{display:grid;gap:12px}
    label{display:grid;gap:6px;font-size:12px;color:var(--soft)}
    input,textarea,select,button{font:inherit}
    input,textarea,select{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:14px;background:#fff;color:var(--text)}
    textarea{min-height:110px;resize:vertical}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .actions{display:flex;gap:10px;flex-wrap:wrap}
    button{border:none;border-radius:14px;padding:11px 14px;background:var(--accent);color:#fff;cursor:pointer}
    button.secondary{background:#fff;color:var(--text);border:1px solid var(--line)}
    button.warn{background:#9a3412}
    .pill-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .pill{padding:6px 10px;border-radius:999px;background:#eef2f7;border:1px solid var(--line);font-size:11px;color:var(--soft)}
    .status{padding:10px 12px;border-radius:14px;background:#f8fafc;border:1px solid var(--line);font-size:12px;color:var(--soft)}
    .status strong{color:var(--text)}
    .selection-zone{padding:14px;border-radius:16px;border:1px dashed var(--line);background:#fafbfd;line-height:1.7}
    .list{margin:0;padding-left:18px;color:var(--soft);line-height:1.7}
    .toast{margin-top:10px;padding:10px 12px;border-radius:14px;background:rgba(6,118,71,.08);border:1px solid rgba(6,118,71,.16);color:var(--ok);display:none}
    @media (max-width:780px){.grid,.row{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>Task Lab</h1>
      <p>Pagina de validacao local para o LLM Assistente. Use este ambiente para testar leitura da pagina, selecao, screenshot, gravacao, replay e fluxo de aprovacao com click e input.</p>
      <div class="pill-row">
        <span class="pill">click</span>
        <span class="pill">input</span>
        <span class="pill">extract</span>
        <span class="pill">selection</span>
        <span class="pill">replay</span>
      </div>
    </section>
    <div class="grid">
      <section class="card">
        <h2 class="section-title">Formulario reativo</h2>
        <div class="stack">
          <div class="row">
            <label>Nome completo
              <input id="full-name" name="fullName" placeholder="Ex.: Hermida Maia" />
            </label>
            <label>E-mail
              <input id="email" name="email" type="email" placeholder="voce@dominio.com" />
            </label>
          </div>
          <div class="row">
            <label>Area
              <select id="area-select" name="area">
                <option value="">Selecione</option>
                <option value="civel">Civel</option>
                <option value="trabalhista">Trabalhista</option>
                <option value="empresarial">Empresarial</option>
              </select>
            </label>
            <label>Prioridade
              <select id="priority-select" name="priority">
                <option value="baixa">Baixa</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </label>
          </div>
          <label>Resumo do caso
            <textarea id="case-summary" name="summary" placeholder="Descreva o contexto para o agente analisar.">Cliente relata inconsistencias em contrato, prazo curto e necessidade de triagem operacional.</textarea>
          </label>
          <div class="actions">
            <button id="save-draft" type="button">Salvar rascunho</button>
            <button id="simulate-submit" type="button" class="warn">Enviar para analise</button>
            <button id="toggle-panel" type="button" class="secondary">Mostrar detalhes</button>
          </div>
          <div id="lab-toast" class="toast">Rascunho salvo localmente.</div>
        </div>
      </section>
      <aside class="card">
        <h2 class="section-title">Blocos para leitura</h2>
        <div class="status"><strong>Status do fluxo:</strong> <span id="lab-status">Aguardando interacao</span></div>
        <div class="stack" style="margin-top:12px">
          <div class="selection-zone" id="selection-zone">
            Selecione este texto para testar o recurso <strong>Usar selecao</strong>. O agente deve receber o trecho atual como contexto imediato da conversa, sem precisar colar manualmente.
          </div>
          <div id="details-panel">
            <p><strong>Checklist de teste:</strong></p>
            <ol class="list">
              <li>Leia a pagina e verifique se o agente identifica campos, botoes e resumo.</li>
              <li>Preencha o nome completo com "Adriano Hermida".</li>
              <li>Clique em "Salvar rascunho".</li>
              <li>Grave um trecho curto e rode o replay passo a passo.</li>
            </ol>
          </div>
        </div>
      </aside>
    </div>
  </div>
  <script>
    const toast = document.getElementById('lab-toast');
    const status = document.getElementById('lab-status');
    const panel = document.getElementById('details-panel');
    const setStatus = (text) => { status.textContent = text; };
    document.getElementById('save-draft').addEventListener('click', () => {
      localStorage.setItem('task-lab-draft', JSON.stringify({
        name: document.getElementById('full-name').value,
        email: document.getElementById('email').value,
        area: document.getElementById('area-select').value,
        priority: document.getElementById('priority-select').value,
      }));
      toast.style.display = 'block';
      setStatus('Rascunho salvo localmente');
      setTimeout(() => { toast.style.display = 'none'; }, 1800);
    });
    document.getElementById('simulate-submit').addEventListener('click', () => {
      const name = document.getElementById('full-name').value || 'sem nome';
      setStatus('Formulario enviado para analise de ' + name);
      document.body.dataset.submitted = 'true';
    });
    document.getElementById('toggle-panel').addEventListener('click', () => {
      const hidden = panel.style.display === 'none';
      panel.style.display = hidden ? 'block' : 'none';
      setStatus(hidden ? 'Detalhes reexibidos' : 'Detalhes ocultados');
    });
  </script>
</body>
</html>`);
  });

  return router;
}

module.exports = {
  createSystemRouter,
};
