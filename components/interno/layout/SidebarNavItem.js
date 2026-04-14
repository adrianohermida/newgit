import Link from "next/link";
import { useRouter } from "next/router";
import SidebarIcon from "./SidebarIcon";

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
      title={collapsed ? item.label : undefined}
      className={`group flex items-center gap-3 rounded-[14px] border px-3 py-2.5 text-sm transition-all duration-200 ${
        active
          ? "border-[#C5A059] bg-[rgba(197,160,89,0.12)] text-[#C5A059] shadow-[inset_0_0_0_1px_rgba(197,160,89,0.12)]"
          : isLightTheme
            ? "border-transparent bg-transparent text-[#22312F] hover:border-[#D8E1EB] hover:bg-white"
            : "border-transparent bg-transparent text-[#D8DED9] hover:border-[#2A3D37] hover:bg-[rgba(255,255,255,0.03)]"
      }`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-[12px] border ${
        active
          ? "border-[#C5A059] bg-[rgba(197,160,89,0.12)]"
          : isLightTheme
            ? "border-[#E1E8EF] bg-[#F7FAFC] group-hover:border-[#CDD7E2]"
            : "border-[#243732] bg-[rgba(255,255,255,0.02)] group-hover:border-[#35554B]"
      }`}>
        <SidebarIcon name={item.icon} />
      </span>
      {!collapsed ? <span className="min-w-0 truncate font-medium">{item.label}</span> : null}
    </Link>
  );
}
