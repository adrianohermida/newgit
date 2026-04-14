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

function loadAutomation(id) {
  return safeRead(path.join(AUTOMATIONS_DIR, `${id}.json`));
}

function saveAutomation(id, automation) {
  automation.updatedAt = ts();
  automation.stepCount = Array.isArray(automation.steps) ? automation.steps.length : 0;
  safeWrite(path.join(AUTOMATIONS_DIR, `${id}.json`), automation);
  return automation;
}

function normalizeAutomationSteps(automation) {
  automation.steps = Array.isArray(automation.steps) ? automation.steps : [];
  return automation;
}

function patchAutomationStep(step, patch = {}) {
  const next = { ...step };
  if (typeof patch.label === "string") next.label = patch.label.trim();
  if (typeof patch.url === "string") next.url = patch.url.trim();
  if (typeof patch.value === "string") next.value = patch.value;
  if (typeof patch.selector === "string") {
    next.element = {
      ...(next.element || {}),
      selector: patch.selector.trim(),
    };
  }
  return next;
}

function createAutomationsRouter(commandQueue) {
  const router = express.Router();
  const replayRuns = new Map();

  function setReplayRun(automationId, tabId, patch) {
    const key = `${automationId}:${tabId}`;
    const previous = replayRuns.get(key) || {
      automationId,
      tabId,
      status: "idle",
      currentIndex: -1,
      completedSteps: [],
      totalSteps: 0,
      lastError: "",
      lastStepLabel: "",
      updatedAt: ts(),
    };
    const next = { ...previous, ...patch, updatedAt: ts() };
    replayRuns.set(key, next);
    return next;
  }

  function queueReplaySteps(tabId, automationId, steps, startIndex = 0) {
    if (!commandQueue.has(tabId)) commandQueue.set(tabId, []);
    const totalSteps = Array.isArray(steps) ? steps.length : 0;
    commandQueue.get(tabId).push(...(steps || []).map((step, offset) => ({
      type: "REPLAY_STEP",
      payload: {
        ...step,
        __meta: {
          automationId,
          tabId,
          stepIndex: startIndex + offset,
          totalSteps: startIndex + totalSteps,
          stepLabel: summarizeStep(step, startIndex + offset).label,
        },
      },
    })));
    setReplayRun(automationId, tabId, {
      status: totalSteps ? "running" : "idle",
      currentIndex: totalSteps ? startIndex : -1,
      completedSteps: [],
      totalSteps: startIndex + totalSteps,
      lastError: "",
      lastStepLabel: totalSteps ? summarizeStep(steps[0], startIndex).label : "",
    });
  }

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
    const automation = loadAutomation(req.params.id);
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
    const automation = loadAutomation(req.params.id);
    if (!automation) return res.status(404).json({ ok: false, error: "Automacao nao encontrada." });
    const title = String(req.body?.title || "").trim();
    automation.title = title || automation.title || automation.id;
    saveAutomation(req.params.id, automation);
    return res.json({ ok: true, automation });
  });
  router.patch("/automations/:id/steps/:index", (req, res) => {
    const automation = normalizeAutomationSteps(loadAutomation(req.params.id));
    if (!automation) return res.status(404).json({ ok: false, error: "Automacao nao encontrada." });
    const index = Math.max(0, Number.parseInt(req.params.index, 10) || 0);
    const step = automation.steps[index];
    if (!step) return res.status(404).json({ ok: false, error: "Passo nao encontrado." });
    const direction = String(req.body?.direction || "").trim();
    if (req.body && typeof req.body === "object" && (typeof req.body.selector === "string" || typeof req.body.value === "string" || typeof req.body.url === "string" || typeof req.body.label === "string")) {
      automation.steps[index] = patchAutomationStep(step, req.body);
      saveAutomation(req.params.id, automation);
      return res.json({ ok: true, automation });
    }
    if (direction === "up" && index > 0) {
      [automation.steps[index - 1], automation.steps[index]] = [automation.steps[index], automation.steps[index - 1]];
    }
    if (direction === "down" && index < automation.steps.length - 1) {
      [automation.steps[index + 1], automation.steps[index]] = [automation.steps[index], automation.steps[index + 1]];
    }
    saveAutomation(req.params.id, automation);
    return res.json({ ok: true, automation });
  });
  router.delete("/automations/:id/steps/:index", (req, res) => {
    const automation = normalizeAutomationSteps(loadAutomation(req.params.id));
    if (!automation) return res.status(404).json({ ok: false, error: "Automacao nao encontrada." });
    const index = Math.max(0, Number.parseInt(req.params.index, 10) || 0);
    if (!automation.steps[index]) return res.status(404).json({ ok: false, error: "Passo nao encontrado." });
    automation.steps.splice(index, 1);
    saveAutomation(req.params.id, automation);
    return res.json({ ok: true, automation });
  });
  router.delete("/automations/:id", (req, res) => {
    try { fs.unlinkSync(path.join(AUTOMATIONS_DIR, `${req.params.id}.json`)); } catch {}
    res.json({ ok: true });
  });

  router.post("/play/:id", (req, res) => {
    const automation = loadAutomation(req.params.id);
    if (!automation) return res.status(404).json({ ok: false, error: "Automacao nao encontrada." });
    const tabId = String(req.body?.tabId || "default");
    queueReplaySteps(tabId, req.params.id, automation.steps || [], 0);
    res.json({ ok: true, queued: Array.isArray(automation.steps) ? automation.steps.length : 0, tabId });
  });
  router.post("/play/:id/from/:index", (req, res) => {
    const automation = loadAutomation(req.params.id);
    if (!automation) return res.status(404).json({ ok: false, error: "Automacao nao encontrada." });
    const tabId = String(req.body?.tabId || "default");
    const index = Math.max(0, Number.parseInt(req.params.index, 10) || 0);
    const steps = Array.isArray(automation.steps) ? automation.steps.slice(index) : [];
    queueReplaySteps(tabId, req.params.id, steps, index);
    res.json({ ok: true, queued: steps.length, startIndex: index, tabId });
  });
  router.post("/play/:id/step/:index", (req, res) => {
    const automation = loadAutomation(req.params.id);
    if (!automation) return res.status(404).json({ ok: false, error: "Automacao nao encontrada." });
    const tabId = String(req.body?.tabId || "default");
    const index = Math.max(0, Number.parseInt(req.params.index, 10) || 0);
    const step = Array.isArray(automation.steps) ? automation.steps[index] : null;
    if (!step) return res.status(404).json({ ok: false, error: "Passo nao encontrado." });
    queueReplaySteps(tabId, req.params.id, [step], index);
    res.json({ ok: true, queued: 1, stepIndex: index, tabId });
  });
  router.post("/replay/status", (req, res) => {
    const automationId = String(req.body?.automationId || "").trim();
    const tabId = String(req.body?.tabId || "default").trim();
    if (!automationId) return res.status(400).json({ ok: false, error: "automationId obrigatorio." });
    const stepIndex = Number.parseInt(req.body?.stepIndex, 10);
    const event = String(req.body?.event || "").trim();
    const totalSteps = Number.parseInt(req.body?.totalSteps, 10);
    const lastStepLabel = String(req.body?.stepLabel || "").trim();
    if (event === "started") {
      setReplayRun(automationId, tabId, {
        status: "running",
        currentIndex: Number.isFinite(stepIndex) ? stepIndex : 0,
        totalSteps: Number.isFinite(totalSteps) ? totalSteps : 0,
        lastStepLabel,
        lastError: "",
      });
    }
    if (event === "completed") {
      const previous = setReplayRun(automationId, tabId, {
        status: "running",
        currentIndex: Number.isFinite(stepIndex) ? stepIndex : 0,
        totalSteps: Number.isFinite(totalSteps) ? totalSteps : 0,
        lastStepLabel,
      });
      const completed = Array.isArray(previous.completedSteps) ? previous.completedSteps : [];
      const current = Number.isFinite(stepIndex) ? stepIndex : 0;
      const nextCompleted = completed.includes(current) ? completed : [...completed, current];
      const isFinished = Number.isFinite(totalSteps) && nextCompleted.length >= totalSteps;
      setReplayRun(automationId, tabId, {
        status: isFinished ? "completed" : "running",
        currentIndex: current,
        totalSteps: Number.isFinite(totalSteps) ? totalSteps : nextCompleted.length,
        completedSteps: nextCompleted,
        lastStepLabel,
        lastError: "",
      });
    }
    if (event === "failed") {
      setReplayRun(automationId, tabId, {
        status: "error",
        currentIndex: Number.isFinite(stepIndex) ? stepIndex : 0,
        totalSteps: Number.isFinite(totalSteps) ? totalSteps : 0,
        lastStepLabel,
        lastError: String(req.body?.error || "Falha no replay."),
      });
    }
    return res.json({ ok: true });
  });
  router.get("/automations/:id/replay-status", (req, res) => {
    const tabId = String(req.query.tabId || "default");
    const payload = replayRuns.get(`${req.params.id}:${tabId}`) || {
      automationId: req.params.id,
      tabId,
      status: "idle",
      currentIndex: -1,
      completedSteps: [],
      totalSteps: 0,
      lastError: "",
      lastStepLabel: "",
      updatedAt: ts(),
    };
    res.json({ ok: true, replay: payload });
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
