const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./config");

const CHAT_DEBUG_PATH = path.join(DATA_DIR, "chat-debug.log");

function appendChatDebug(entry) {
  try {
    const record = {
      at: new Date().toISOString(),
      ...entry,
    };
    fs.appendFileSync(CHAT_DEBUG_PATH, `${JSON.stringify(record)}\n`, "utf8");
  } catch {}
}

function readChatDebug(limit = 120) {
  try {
    const raw = fs.readFileSync(CHAT_DEBUG_PATH, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    return lines.slice(-Math.max(1, limit)).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { at: new Date().toISOString(), parseError: true, raw: line };
      }
    });
  } catch {
    return [];
  }
}

module.exports = {
  appendChatDebug,
  readChatDebug,
};
