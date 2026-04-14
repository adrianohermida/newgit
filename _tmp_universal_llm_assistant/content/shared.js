function buildDomPath(element) {
  if (!element || element === document.body) return "body";
  const parts = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
    const tag = current.tagName.toLowerCase();
    const index = current.parentElement
      ? Array.from(current.parentElement.children).filter((item) => item.tagName === current.tagName).indexOf(current) + 1
      : 1;
    parts.unshift(`${tag}:nth-of-type(${index})`);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

function buildSelector(element) {
  if (!element || element === document.body) return "body";
  if (element.id) return `#${CSS.escape(element.id)}`;
  const tag = element.tagName.toLowerCase();
  const label = [
    element.getAttribute("aria-label"),
    element.getAttribute("name"),
    element.getAttribute("placeholder"),
    element.getAttribute("data-testid"),
  ].find(Boolean);
  if (label) return `${tag}[aria-label="${label}"], ${tag}[name="${label}"], ${tag}[placeholder="${label}"], ${tag}[data-testid="${label}"]`;
  const className = typeof element.className === "string"
    ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((token) => `.${CSS.escape(token)}`).join("")
    : "";
  return className ? `${tag}${className}` : buildDomPath(element);
}

function buildElementSnapshot(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;
  const rect = element.getBoundingClientRect();
  const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160);
  return {
    selector: buildSelector(element),
    domPath: buildDomPath(element),
    tagName: element.tagName,
    id: element.id || null,
    name: element.getAttribute("name") || null,
    role: element.getAttribute("role") || null,
    type: element.getAttribute("type") || null,
    placeholder: element.getAttribute("placeholder") || null,
    ariaLabel: element.getAttribute("aria-label") || null,
    href: element.getAttribute("href") || null,
    text,
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  };
}

function collectPageScan() {
  const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
  const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
    .map((node) => node.textContent?.trim())
    .filter(Boolean)
    .slice(0, 15);
  const buttons = Array.from(document.querySelectorAll("button,[role='button'],input[type='submit'],input[type='button']"))
    .map(buildElementSnapshot)
    .filter(Boolean)
    .slice(0, 20);
  const fields = Array.from(document.querySelectorAll("input,textarea,select"))
    .map(buildElementSnapshot)
    .filter(Boolean)
    .slice(0, 20);
  const links = Array.from(document.querySelectorAll("a[href]"))
    .map(buildElementSnapshot)
    .filter(Boolean)
    .slice(0, 20);
  return {
    title: document.title || "",
    url: location.href || "",
    description: document.querySelector('meta[name="description"]')?.content || "",
    text: text.slice(0, 12000),
    headings,
    buttons,
    fields,
    links,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
  };
}

function resolveDomPath(domPath) {
  if (!domPath || typeof domPath !== "string") return null;
  try {
    return document.querySelector(domPath);
  } catch {
    return null;
  }
}

function findByText(candidates, text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return null;
  return candidates.find((item) => {
    const current = String(item.innerText || item.textContent || item.value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return current && (current === normalized || current.includes(normalized));
  }) || null;
}

function resolveElement(target) {
  if (!target) return null;
  if (target.selector) {
    try {
      const bySelector = document.querySelector(target.selector);
      if (bySelector) return bySelector;
    } catch {}
  }
  const snapshot = target.element || {};
  if (snapshot.id) {
    const byId = document.getElementById(snapshot.id);
    if (byId) return byId;
  }
  if (snapshot.name) {
    const byName = document.querySelector(`[name="${CSS.escape(snapshot.name)}"]`);
    if (byName) return byName;
  }
  if (snapshot.placeholder) {
    const byPlaceholder = document.querySelector(`[placeholder="${CSS.escape(snapshot.placeholder)}"]`);
    if (byPlaceholder) return byPlaceholder;
  }
  if (snapshot.ariaLabel) {
    const byAria = document.querySelector(`[aria-label="${CSS.escape(snapshot.ariaLabel)}"]`);
    if (byAria) return byAria;
  }
  if (snapshot.domPath) {
    const byPath = resolveDomPath(snapshot.domPath);
    if (byPath) return byPath;
  }
  const tagName = String(snapshot.tagName || "").toLowerCase();
  if (tagName) {
    const pool = Array.from(document.querySelectorAll(tagName));
    const byText = findByText(pool, snapshot.text);
    if (byText) return byText;
  }
  const genericPool = Array.from(document.querySelectorAll("button,a,input,textarea,select,[role='button']"));
  return findByText(genericPool, snapshot.text);
}

function ensureAgentBadge(reason = "Em uso pelo agente") {
  let badge = document.getElementById("llm-assistant-agent-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "llm-assistant-agent-badge";
    badge.style.position = "fixed";
    badge.style.right = "14px";
    badge.style.bottom = "14px";
    badge.style.zIndex = "2147483647";
    badge.style.padding = "8px 12px";
    badge.style.borderRadius = "999px";
    badge.style.background = "rgba(17,24,39,.92)";
    badge.style.color = "#fff";
    badge.style.font = "12px Segoe UI, sans-serif";
    badge.style.boxShadow = "0 10px 30px rgba(0,0,0,.25)";
    badge.style.pointerEvents = "none";
    document.documentElement.appendChild(badge);
  }
  badge.textContent = `IA ativa: ${reason}`;
}

window.LLMAssistantContent = {
  bridgeUrl: "http://127.0.0.1:32123",
  pollInterval: 2000,
  recordingState: { active: false, automationId: null, lastScrollAt: 0 },
  replayPollTimer: null,
  sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); },
  buildSelector,
  buildDomPath,
  buildElementSnapshot,
  collectPageScan,
  resolveElement,
  ensureAgentBadge,
};
