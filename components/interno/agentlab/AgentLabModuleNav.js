import Link from "next/link";
import { useRouter } from "next/router";

const ITEMS = [
  { href: "/interno/agentlab", label: "Visao geral" },
  { href: "/interno/agentlab/environment", label: "Ambiente" },
  { href: "/interno/agentlab/agents", label: "Agentes" },
  { href: "/interno/agentlab/conversations", label: "Conversas" },
  { href: "/interno/agentlab/training", label: "Treinamento" },
  { href: "/interno/agentlab/knowledge", label: "Conhecimento" },
  { href: "/interno/agentlab/workflows", label: "Workflows" },
  { href: "/interno/agentlab/evaluation", label: "Avaliacao" },
];

export default function AgentLabModuleNav() {
  const router = useRouter();

  return (
    <div className="flex flex-wrap gap-3 mb-8">
      {ITEMS.map((item) => {
        const active = router.pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={`px-4 py-2 text-sm border ${active ? "text-[#050706]" : "text-[#F4F1EA]"}`}
            style={{
              background: active ? "#C5A059" : "transparent",
              borderColor: active ? "#C5A059" : "#2D2E2E",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
