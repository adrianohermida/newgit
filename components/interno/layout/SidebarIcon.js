const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" };

function IconPath({ name }) {
  if (name === "dashboard") return <><path d="M4 5h7v6H4z" {...STROKE} /><path d="M13 5h7v10h-7z" {...STROKE} /><path d="M4 13h7v6H4z" {...STROKE} /><path d="M13 17h7v2h-7z" {...STROKE} /></>;
  if (name === "copilot") return <><path d="M12 4a6 6 0 0 1 6 6v4a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4v-4a6 6 0 0 1 6-6Z" {...STROKE} /><path d="M9 10h.01" {...STROKE} /><path d="M15 10h.01" {...STROKE} /><path d="M9 14c1 .8 5 .8 6 0" {...STROKE} /></>;
  if (name === "labs") return <><path d="M9 4h6" {...STROKE} /><path d="M10 4v5l-4 7a2 2 0 0 0 1.74 3h8.52A2 2 0 0 0 18 16l-4-7V4" {...STROKE} /><path d="M8 15h8" {...STROKE} /></>;
  if (name === "spark") return <><path d="m12 3 1.7 4.8L18.5 9l-4.8 1.2L12 15l-1.7-4.8L5.5 9l4.8-1.2Z" {...STROKE} /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z" {...STROKE} /></>;
  if (name === "flask") return <><path d="M10 3h4" {...STROKE} /><path d="M10 3v5l-5 8a3 3 0 0 0 2.6 5h8.8A3 3 0 0 0 19 16l-5-8V3" {...STROKE} /><path d="M8 14h8" {...STROKE} /></>;
  if (name === "briefcase") return <><path d="M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" {...STROKE} /><path d="M4 8h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" {...STROKE} /><path d="M4 11h16" {...STROKE} /></>;
  if (name === "document") return <><path d="M8 3h6l4 4v14H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" {...STROKE} /><path d="M14 3v4h4" {...STROKE} /><path d="M10 12h6M10 16h6" {...STROKE} /></>;
  if (name === "layers") return <><path d="m12 4 8 4-8 4-8-4 8-4Z" {...STROKE} /><path d="m4 12 8 4 8-4" {...STROKE} /><path d="m4 16 8 4 8-4" {...STROKE} /></>;
  if (name === "shield") return <><path d="M12 3c2.4 1.6 4.8 2.4 7 2.5V11c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5.5C7.2 5.4 9.6 4.6 12 3Z" {...STROKE} /><path d="m9.5 12 1.7 1.7 3.3-3.4" {...STROKE} /></>;
  if (name === "users") return <><path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" {...STROKE} /><path d="M16 12a2.5 2.5 0 1 0 0-5" {...STROKE} /><path d="M4.5 19a4.5 4.5 0 0 1 9 0" {...STROKE} /><path d="M14 19a4 4 0 0 1 5-3.8" {...STROKE} /></>;
  if (name === "target") return <><circle cx="12" cy="12" r="7" {...STROKE} /><circle cx="12" cy="12" r="3" {...STROKE} /><path d="M19 5 14 10" {...STROKE} /></>;
  if (name === "calendar") return <><path d="M7 3v3M17 3v3M4 9h16" {...STROKE} /><rect x="4" y="5" width="16" height="16" rx="2" {...STROKE} /></>;
  if (name === "wallet") return <><path d="M4 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1H6a2 2 0 0 0 0 4h14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" {...STROKE} /><path d="M18 12h2" {...STROKE} /></>;
  if (name === "megaphone") return <><path d="M4 13V9l10-4v12L4 13Z" {...STROKE} /><path d="M14 9h3a3 3 0 0 1 0 6h-3" {...STROKE} /><path d="M7 14l1 5" {...STROKE} /></>;
  if (name === "chart") return <><path d="M5 19V9" {...STROKE} /><path d="M12 19V5" {...STROKE} /><path d="M19 19v-8" {...STROKE} /></>;
  if (name === "plug") return <><path d="M9 3v6M15 3v6M7 9h10v2a5 5 0 0 1-5 5 5 5 0 0 1-5-5Z" {...STROKE} /><path d="M12 16v5" {...STROKE} /></>;
  return <><circle cx="12" cy="12" r="8" {...STROKE} /><path d="M12 8v4l2 2" {...STROKE} /></>;
}

export default function SidebarIcon({ name }) {
  return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]"><IconPath name={name} /></svg>;
}
