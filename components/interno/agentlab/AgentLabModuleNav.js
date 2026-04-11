import Link from "next/link";
import { useRouter } from "next/router";

<<<<<<< HEAD
const ITEMS = [
  { href: "/interno/agentlab", label: "Visao geral" },
  { href: "/interno/agentlab/environment", label: "Ambiente" },
  { href: "/interno/agentlab/agents", label: "Agentes" },
  { href: "/interno/agentlab/conversations", label: "Conversas" },
  { href: "/interno/agentlab/training", label: "Treinamento" },
  { href: "/interno/agentlab/orquestracao", label: "Experimentos" },
  { href: "/interno/agentlab/knowledge", label: "Conhecimento" },
  { href: "/interno/agentlab/workflows", label: "Workflows" },
  { href: "/interno/agentlab/evaluation", label: "Avaliacao" },
=======
const MODULES = [
  { href: "/interno/agentlab", label: "Overview" },
  { href: "/interno/agentlab/agents", label: "Agents" },
  { href: "/interno/agentlab/evaluation", label: "Evaluation" },
  { href: "/interno/agentlab/knowledge", label: "Knowledge" },
  { href: "/interno/agentlab/workflows", label: "Workflows" },
  { href: "/interno/agentlab/training", label: "Training" },
  { href: "/interno/agentlab/conversations", label: "Conversations" },
>>>>>>> codex/hmadv-tpu-fase53
];

export default function AgentLabModuleNav() {
  const router = useRouter();

  return (
<<<<<<< HEAD
    <div className="flex flex-wrap gap-3 mb-8">
      {ITEMS.map((item) => {
=======
    <div className="mb-8 flex flex-wrap gap-3">
      {MODULES.map((item) => {
>>>>>>> codex/hmadv-tpu-fase53
        const active = router.pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
<<<<<<< HEAD
            prefetch={false}
            className={`px-4 py-2 text-sm border ${active ? "text-[#050706]" : "text-[#F4F1EA]"}`}
            style={{
              background: active ? "#C5A059" : "transparent",
              borderColor: active ? "#C5A059" : "#2D2E2E",
            }}
=======
            className={`border px-4 py-3 text-sm transition-colors ${
              active ? "border-[#C5A059] bg-[#C5A059] text-[#050706]" : "border-[#2D2E2E] hover:border-[#C5A059] hover:text-[#C5A059]"
            }`}
>>>>>>> codex/hmadv-tpu-fase53
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
