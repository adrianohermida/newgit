import Link from "next/link";
import { useRouter } from "next/router";

export default function SidebarNavItem({ item, active, collapsed, isLightTheme, onNavigate }) {
  const router = useRouter();

  function handleNavigate(event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();

    const currentPath = router.asPath;
    let usedFallback = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!usedFallback && router.asPath === currentPath) {
        usedFallback = true;
        window.location.assign(item.href);
      }
    }, 1200);

    router.push(item.href).then((navigated) => {
      window.clearTimeout(fallbackTimer);
      if (!navigated && !usedFallback) {
        usedFallback = true;
        window.location.assign(item.href);
        return;
      }
      if (navigated) onNavigate?.();
    }).catch(() => {
      window.clearTimeout(fallbackTimer);
      if (!usedFallback) {
        usedFallback = true;
        window.location.assign(item.href);
      }
    });
  }

  return (
    <Link
      href={item.href}
      prefetch={false}
      onClick={handleNavigate}
      className={`group flex items-center gap-3 rounded-[16px] border px-3.5 py-3 text-sm transition-all duration-200 ${
        active
          ? "border-[#C5A059] bg-[linear-gradient(180deg,#C5A059,#B08B46)] text-[#07110E] shadow-[0_8px_22px_rgba(197,160,89,0.2)]"
          : isLightTheme
            ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.86)] text-[#22312F] hover:border-[#BAC8D6] hover:bg-[rgba(255,255,255,0.98)]"
            : "border-[#1F2A27] bg-[rgba(255,255,255,0.015)] text-[#D8DED9] hover:border-[#31433D] hover:bg-[rgba(255,255,255,0.03)]"
      }`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-[12px] border ${active ? "border-[rgba(7,17,14,0.12)] bg-[rgba(7,17,14,0.08)]" : isLightTheme ? "border-[#D4DEE8] bg-[rgba(238,242,247,0.92)] group-hover:border-[#BAC8D6]" : "border-[#233630] bg-[rgba(255,255,255,0.02)] group-hover:border-[#35554B]"}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-[#07110E]" : "bg-[#C5A059]"}`} />
      </span>
      {!collapsed ? <span className="font-medium">{item.label}</span> : null}
    </Link>
  );
}
