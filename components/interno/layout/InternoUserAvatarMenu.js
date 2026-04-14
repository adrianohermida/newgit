import { getProfileInitials, normalizeDisplayName, resolveProfileAvatar } from "./sidebarConfig";

function getAvatarButtonClass({ isLightTheme, variant }) {
  if (variant === "sidebar") {
    return `flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition hover:border-[#C5A059] ${
      isLightTheme
        ? "border-[#D6E0EA] bg-[rgba(255,255,255,0.94)] text-[#22312F]"
        : "border-[#243732] bg-[rgba(255,255,255,0.02)] text-[#F4F1EA]"
    }`;
  }

  return `flex h-10 items-center gap-2 rounded-[14px] border px-2.5 transition hover:border-[#C5A059] ${
    isLightTheme
      ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.92)] text-[#22312F]"
      : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#D8DEDA]"
  }`;
}

function getAvatarClass({ isLightTheme, variant }) {
  return `flex shrink-0 items-center justify-center overflow-hidden rounded-full border ${
    variant === "sidebar" ? "h-10 w-10" : "h-8 w-8"
  } ${
    isLightTheme
      ? "border-[#D1DAE4] bg-[linear-gradient(180deg,#FDFEFE,#EDF3F8)] text-[#22312F]"
      : "border-[#2A3B36] bg-[linear-gradient(180deg,#15211E,#0C1311)] text-[#F4F1EA]"
  }`;
}

export default function InternoUserAvatarMenu({
  isLightTheme,
  menuItems,
  onClose,
  onToggle,
  open,
  profile,
  userMenuRef,
  variant = "header",
}) {
  const displayName = normalizeDisplayName(profile);
  const avatarSrc = resolveProfileAvatar(profile);
  const initials = getProfileInitials(profile);
  const email = profile?.email || "";

  return (
    <div ref={userMenuRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={getAvatarButtonClass({ isLightTheme, variant })}
        title="Menu do usuario"
      >
        <span className={getAvatarClass({ isLightTheme, variant })}>
          {avatarSrc ? (
            <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            <span className={`font-semibold uppercase ${variant === "sidebar" ? "text-xs" : "text-[11px]"}`}>
              {initials}
            </span>
          )}
        </span>
        {variant === "sidebar" ? (
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-sm font-medium ${isLightTheme ? "text-[#152421]" : "text-[#F8F4EB]"}`}>
              {displayName}
            </span>
            <span className={`block truncate text-[11px] ${isLightTheme ? "text-[#6A7A85]" : "text-[#91A49E]"}`}>
              {email || "Conta interna"}
            </span>
          </span>
        ) : null}
        <svg
          viewBox="0 0 24 24"
          className={`shrink-0 ${variant === "sidebar" ? "h-4 w-4" : "h-3.5 w-3.5"} ${open ? "rotate-180" : ""} transition-transform`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          className={`absolute z-40 overflow-hidden rounded-[18px] border shadow-[0_22px_44px_rgba(0,0,0,0.18)] ${
            variant === "sidebar" ? "bottom-[calc(100%+10px)] left-0 right-0" : "right-0 top-[calc(100%+8px)] w-64"
          } ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(10,12,11,0.98)]"}`}
        >
          <div className={`border-b px-4 py-3 ${isLightTheme ? "border-[#E4EBF2]" : "border-[#243732]"}`}>
            <p className={`truncate text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>
              {displayName}
            </p>
            <p className={`mt-1 truncate text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
              {email || "Conta interna"}
            </p>
          </div>
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onClose();
                item.action();
              }}
              className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition ${
                isLightTheme
                  ? "text-[#22312F] hover:bg-[#F7F9FC]"
                  : "text-[#D8DEDA] hover:bg-[rgba(255,255,255,0.03)]"
              }`}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
