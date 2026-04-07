import { handleFreddyGetContact360 } from "../../functions/lib/freddy-memory-gateway.js";

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const request = new Request("http://local/api/freddy-get-contact-360", {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(req.body || {}),
  });

  const response = await handleFreddyGetContact360(request, process.env);
  const payload = await response.json().catch(() => ({ ok: false, error: "Invalid JSON response." }));
  return res.status(response.status).json(payload);
}
