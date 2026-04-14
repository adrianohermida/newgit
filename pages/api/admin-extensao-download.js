import { requireAdminNode } from "../../lib/admin/node-auth";
import fs from "fs";
import path from "path";

const DIST_DIR = path.resolve(process.cwd(), "universal-llm-extension/dist");
const ZIP_NAME = "universal-llm-assistant-v9.0.0.zip";

export default async function handler(req, res) {
  const auth = await requireAdminNode(req);
  if (!auth?.ok) {
    return res.status(auth?.status || 401).json({ ok: false, error: "Não autorizado." });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Método não permitido." });
  }

  const zipPath = path.join(DIST_DIR, ZIP_NAME);

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({
      ok: false,
      error: "Arquivo .zip não encontrado. Execute: npm run build:extension",
    });
  }

  const stat = fs.statSync(zipPath);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${ZIP_NAME}"`);
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Cache-Control", "no-cache");

  fs.createReadStream(zipPath).pipe(res);
}
