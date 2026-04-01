import Link from "next/link";
import { useRouter } from "next/router";

const ITEMS = [
  { href: "/interno/agentlab", label: "Overview" },
  { href: "/interno/agentlab/agents", label: "Agents" },
  { href: "/interno/agentlab/conversations", label: "Conversations" },
  { href: "/interno/agentlab/training", label: "Training" },
  { href: "/interno/agentlab/knowledge", label: "Knowledge" },
  { href: "/interno/agentlab/workflows", label: "Workflows" },
  { href: "/interno/agentlab/evaluation", label: "Evaluation" },
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
