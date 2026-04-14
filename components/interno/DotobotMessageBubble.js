import { useInternalTheme } from "./InternalThemeProvider";

function RichText({ text, isLightTheme }) {
  if (typeof text !== "string" || !text.trim()) return null;
  const blocks = text.split(/```/g);

  return blocks.map((block, index) => {
    if (index % 2 === 1) {
      return (
        <pre
          key={`code-${index}`}
          className={`mt-3 overflow-x-auto rounded-[16px] border px-4 py-3 text-xs ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#1F2A37]" : "border-[#22342F] bg-[rgba(255,255,255,0.03)] text-[#D8DEDA]"}`}
        >
          <code>{block.trim()}</code>
        </pre>
      );
    }

    const lines = block.split("\n").filter(Boolean);
    const bulletLines = lines.filter((line) => /^[-*•]\s+/.test(line.trim()));
    if (bulletLines.length >= 2 && bulletLines.length === lines.length) {
      return (
        <ul key={`list-${index}`} className="space-y-2 pl-5">
          {bulletLines.map((line, lineIndex) => (
            <li key={`line-${index}-${lineIndex}`} className="leading-7">
              {line.trim().replace(/^[-*•]\s+/, "")}
            </li>
          ))}
        </ul>
      );
    }

    return lines.map((line, lineIndex) => (
      <p key={`line-${index}-${lineIndex}`} className="leading-7">
        {line}
      </p>
    ));
  });
}

function renderMedia(items = []) {
  return items.map((item, index) => {
    if (!item?.url) return null;
    if (item.type === "image") {
      return <img key={index} src={item.url} alt={item.alt || "Anexo"} className="max-h-56 rounded-2xl object-cover" />;
    }
    if (item.type === "audio") {
      return <audio key={index} src={item.url} controls className="max-w-[220px]" />;
    }
    return null;
  });
}

export default function DotobotMessageBubble({ isTyping = false, message, onAction, onCopy, onOpenAiTask, onReuse }) {
  const { isLightTheme } = useInternalTheme();
  const isAssistant = message?.role === "assistant";
  const isSystem = message?.role === "system";
  const isUser = !isAssistant && !isSystem;
  const label = isAssistant ? "Agente IA" : isSystem ? "Sistema" : "Usuario";
  const bubbleWrapperClass = isUser ? "mr-auto max-w-[82%]" : "ml-auto max-w-[88%]";
  const bubbleTone = isUser
    ? isLightTheme ? "border-[#D7DEE8] bg-[#F1F4F7] text-[#1F2A37] shadow-[0_10px_28px_rgba(15,23,42,0.05)]" : "border-[#384843] bg-[rgba(207,214,220,0.08)] text-[#E7ECEA] shadow-[0_10px_28px_rgba(0,0,0,0.16)]"
    : isLightTheme ? "border-[#8DB8FF] bg-[#EAF3FF] text-[#12304F] shadow-[0_12px_30px_rgba(59,130,246,0.10)]" : "border-[#2E5B96] bg-[rgba(37,99,235,0.18)] text-[#E8F1FF] shadow-[0_10px_28px_rgba(0,0,0,0.20)]";
  const media = Array.isArray(message?.media) ? message.media : [];

  return (
    <article className={`${bubbleWrapperClass} rounded-[22px] border px-4 py-4 text-sm transition-all duration-200 ease-out hover:-translate-y-[1px] ${isLightTheme ? "hover:shadow-[0_18px_40px_rgba(148,163,184,0.14)]" : "hover:shadow-[0_18px_40px_rgba(0,0,0,0.24)]"} ${bubbleTone}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isUser ? (isLightTheme ? "text-[#6B7C88]" : "text-[#A9B8B3]") : (isLightTheme ? "text-[#2F6FDF]" : "text-[#8DB8FF]")}`}>{label}</p>
        {message?.createdAt ? (
          <span className={`text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>
            {new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {isTyping ? <p className={isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}>Digitando...</p> : <RichText text={message?.text || ""} isLightTheme={isLightTheme} />}
        {media.length ? <div className="flex flex-wrap gap-3">{renderMedia(media)}</div> : null}
      </div>

      {!isTyping && (isAssistant || isSystem) ? (
        <div className={`mt-4 flex flex-wrap gap-2 border-t pt-3 text-[11px] ${isLightTheme ? "border-[#E5EAF1]" : "border-[#22342F]"}`}>
          {Array.isArray(message?.actions) ? message.actions.map((action) => (
            <button
              key={action.id || `${action.kind}-${action.target}`}
              type="button"
              onClick={() => onAction?.(action, message)}
              className={`rounded-full border px-3 py-1.5 transition-all duration-200 active:scale-[0.98] ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62] hover:bg-[#F5FBF8]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:bg-[rgba(127,196,175,0.06)] hover:text-[#7FC4AF]"}`}
            >
              {action.label}
            </button>
          )) : null}
          <button type="button" onClick={() => onCopy?.(message)} className={`rounded-full border px-3 py-1.5 transition-all duration-200 active:scale-[0.98] ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] hover:border-[#9AA9B6] hover:bg-[#F7F9FC]" : "border-[#22342F] text-[#C6D1CC] hover:border-[#35554B] hover:bg-[rgba(255,255,255,0.03)]"}`}>Copiar</button>
          <button type="button" onClick={() => onReuse?.(message)} className={`rounded-full border px-3 py-1.5 transition-all duration-200 active:scale-[0.98] ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] hover:border-[#9AA9B6] hover:bg-[#F7F9FC]" : "border-[#22342F] text-[#C6D1CC] hover:border-[#35554B] hover:bg-[rgba(255,255,255,0.03)]"}`}>Usar no composer</button>
          <button type="button" onClick={() => onOpenAiTask?.(message)} className={`rounded-full border px-3 py-1.5 transition-all duration-200 active:scale-[0.98] ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62] hover:bg-[#F5FBF8]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:bg-[rgba(127,196,175,0.06)] hover:text-[#7FC4AF]"}`}>Abrir no AI Task</button>
        </div>
      ) : null}
    </article>
  );
}
