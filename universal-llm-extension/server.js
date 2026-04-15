const { PORT } = require("./src/config");
const { ensureDataDirs } = require("./src/storage");
const { createApp } = require("./src/app");

ensureDataDirs();

createApp().listen(PORT, () => {
  console.log(`[universal-llm-extension] bridge v0.5.5 -> http://localhost:${PORT}`);
  console.log("  /health       status do bridge");
  console.log("  /settings     configuracao persistida");
  console.log("  /chat         proxy LLM");
});
