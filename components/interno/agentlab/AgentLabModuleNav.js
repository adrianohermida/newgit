import Link from "next/link";
import { useRouter } from "next/router";

const MODULES = [
  { href: "/interno/agentlab", label: "Overview" },
  { href: "/interno/agentlab/agents", label: "Agents" },
  { href: "/interno/agentlab/evaluation", label: "Evaluation" },
  { href: "/interno/agentlab/knowledge", label: "Knowledge" },
  { href: "/interno/agentlab/workflows", label: "Workflows" },
  { href: "/interno/agentlab/training", label: "Training" },
  { href: "/interno/agentlab/conversations", label: "Conversations" },
];

export default function AgentLabModuleNav() {
  const router = useRouter();

  return (
    <div className="mb-8 flex flex-wrap gap-3">
      {MODULES.map((item) => {
        const active = router.pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`border px-4 py-3 text-sm transition-colors ${
              active ? "border-[#C5A059] bg-[#C5A059] text-[#050706]" : "border-[#2D2E2E] hover:border-[#C5A059] hover:text-[#C5A059]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
