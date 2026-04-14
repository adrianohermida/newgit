import { HISTORY_STORAGE_KEY, UI_STATE_STORAGE_KEY, VALIDATION_STORAGE_KEY } from "./constants";

function readJsonStorage(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function parseCopilotContext(rawValue) {
  if (!rawValue) return null;
  try {
    return JSON.parse(String(rawValue));
  } catch {
    return null;
  }
}

export function loadHistoryEntries() {
  const parsed = readJsonStorage(HISTORY_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function persistHistoryEntries(entries) {
  writeJsonStorage(HISTORY_STORAGE_KEY, Array.isArray(entries) ? entries.slice(0, 40) : []);
}

export function loadUiState() {
  return readJsonStorage(UI_STATE_STORAGE_KEY, null);
}

export function persistUiState(nextState) {
  writeJsonStorage(UI_STATE_STORAGE_KEY, nextState || {});
}

export function loadValidationState() {
  const parsed = readJsonStorage(VALIDATION_STORAGE_KEY, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

export function persistValidationState(value) {
  writeJsonStorage(VALIDATION_STORAGE_KEY, value || {});
}
