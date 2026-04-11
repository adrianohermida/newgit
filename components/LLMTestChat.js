import { useState } from "react";
import { getAdminAccessToken } from "../lib/admin/api";

export default function LLMTestChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendMessage(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const accessToken = await getAdminAccessToken();
      const res = await fetch("/api/admin-lawdesk-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query: input }),
      });
      if (!res.ok) {
        const err = await res.text();
        setError(`Erro ${res.status}: ${err}`);
      } else {
        const data = await res.json();
        setMessages((msgs) => [
          ...msgs,
          { role: "user", text: input },
          { role: "assistant", text: data?.data?.result || JSON.stringify(data?.data || data) },
        ]);
        setInput("");
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 480, margin: "40px auto", padding: 24, border: "1px solid #ccc", borderRadius: 12, background: "#181B19", color: "#F5F1E8" }}>
      <h2 style={{ fontSize: 22, marginBottom: 16 }}>Teste LLM Conversação</h2>
      <div style={{ minHeight: 120, marginBottom: 16 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ margin: "8px 0", textAlign: msg.role === "user" ? "right" : "left" }}>
            <span style={{ fontWeight: msg.role === "user" ? 600 : 400 }}>{msg.role === "user" ? "Você" : "LLM"}:</span> {msg.text}
          </div>
        ))}
      </div>
      <form onSubmit={sendMessage} style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Digite sua mensagem..."
          style={{ flex: 1, padding: 8, borderRadius: 6, border: "1px solid #333", background: "#232823", color: "#F5F1E8" }}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()} style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: "#C5A059", color: "#181B19", fontWeight: 700 }}>
          Enviar
        </button>
      </form>
      {error && <div style={{ color: "#f2b2b2", marginTop: 12 }}>{error}</div>}
    </div>
  );
}
