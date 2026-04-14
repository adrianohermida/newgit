const express = require("express");
const fs = require("fs");
const path = require("path");
const { AUTOMATIONS_DIR } = require("../config");
const { listJsonDir, safeRead, safeWrite } = require("../storage");
const { ts } = require("../utils");

function summarizeStep(step, index) {
  const type = String(step?.type || step?.action?.type || "passo");
  const target = step?.element?.label || step?.element?.selector || step?.href || step?.url || step?.action || "";
  const value = step?.value ? ` = ${String(step.value).slice(0, 40)}` : "";
  return {
    index,
    type,
    label: [type, target].filter(Boolean).join(" -> ") + value,
    pageTitle: step?.pageTitle || step?.title || "",
    pageUrl: step?.pageUrl || step?.url || "",
    selector: step?.element?.selector || "",
    pointer: step?.pointer || null,
    recordedAt: step?.recordedAt || null,
  };
}

function createAutomationsRouter(commandQueue) {
  const router = express.Router();

  router.post("/record", (req, res) => {
    try {
      const { automationId, step, tabUrl, tabTitle } = req.body || {};
      if (!automationId || !step) return res.status(400).json({ ok: false, error: "automationId e step obrigatorios." });
      const filePath = path.join(AUTOMATIONS_DIR, `${automationId}.json`);
      const existing = safeRead(filePath) || { id: automationId, title: tabTitle || tabUrl || "Automacao sem titulo", startUrl: tabUrl || "", steps: [], createdAt: ts() };
      existing.steps.push({ ...step, recordedAt: ts() });
      existing.updatedAt = ts();
      existing.stepCount = existing.steps.length;
      safeWrite(filePath, existing);
      res.json({ ok: true, automationId, stepCount: existing.stepCount });
    } catch (error) { res.status(500).json({ ok: false, error: error?.message }); }
  });

  router.get("/automations", (_req, res) => res.json({
    ok: true,
    automations: listJsonDir(AUTOMATIONS_DIR).map((item) => ({
      id: item.id,
      title: item.title,
      startUrl: item.startUrl,
      stepCount: item.stepCount || (Array.isArray(item.steps) ? item.steps.length : 0),
      previewSteps: Array.isArray(item.steps)
        ? item.steps.slice(0, 4).map((step, index) => summarizeStep(step, index).label)
        : [],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  }));
  router.get("/automations/:id", (req, res) => {
    const automation = safeRead(path.join(AUTOMATIONS_DIR, `${req.params.id}.json`));
    if (!automation) return res.status(404).json({ ok: false, error: "Automacao nao encontrada." });
    return res.json({
      ok: true,
      automation: {
        ...automation,
        steps: Array.isArray(automation.steps) ? automation.steps : [],
        summarizedSteps: Array.isArray(automation.steps) ? automation.steps.map((step, index) => summarizeStep(step, index)) : [],
      },
    });
  });
  router.patch("/automations/:id", (req, res) => {
    const filePath = path.join(AUTOMATIONS_DIR, `${req.params.id}.json`);
    const automation = safeRead(filePath);
    if (!automation) return res.status(404).json({ ok: false, error: "Automacao nao encontrada." });
    const title = String(req.body?.title || "").trim();
    automation.title = title || automation.title || automation.id;
    automation.updatedAt = ts();
    safeWrite(filePath, automation);
    return res.json({ ok: true, automation });
  });
  router.delete("/automations/:id", (req, res) => {
    try { fs.unlinkSync(path.join(AUTOMATIONS_DIR, `${req.params.id}.json`)); } catch {}
    res.json({ ok: true });
  });

  router.post("/play/:id", (req, res) => {
    const automation = safeRead(path.join(AUTOMATIONS_DIR, `${req.params.id}.json`));
    if (!automation) return res.status(404).json({ ok: false, error: "Automacao nao encontrada." });
    const tabId = String(req.body?.tabId || "default");
    if (!commandQueue.has(tabId)) commandQueue.set(tabId, []);
    commandQueue.get(tabId).push(...(automation.steps || []).map((step) => ({ type: "REPLAY_STEP", payload: step })));
    res.json({ ok: true, queued: Array.isArray(automation.steps) ? automation.steps.length : 0, tabId });
  });
  router.post("/play/:id/from/:index", (req, res) => {
    const automation = safeRead(path.join(AUTOMATIONS_DIR, `${req.params.id}.json`));
    if (!automation) return res.status(404).json({ ok: false, error: "Automacao nao encontrada." });
    const tabId = String(req.body?.tabId || "default");
    const index = Math.max(0, Number.parseInt(req.params.index, 10) || 0);
    const steps = Array.isArray(automation.steps) ? automation.steps.slice(index) : [];
    if (!commandQueue.has(tabId)) commandQueue.set(tabId, []);
    commandQueue.get(tabId).push(...steps.map((step) => ({ type: "REPLAY_STEP", payload: step })));
    res.json({ ok: true, queued: steps.length, startIndex: index, tabId });
  });

  router.get("/commands", (req, res) => {
    const tabId = String(req.query.tabId || "default");
    const commands = commandQueue.get(tabId) || [];
    commandQueue.set(tabId, []);
    res.json({ ok: true, commands });
  });

  return router;
}

module.exports = {
  createAutomationsRouter,
};
