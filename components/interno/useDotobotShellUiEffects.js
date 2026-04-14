import { useEffect } from "react";

export default function useDotobotShellUiEffects({
  composerRef,
  conversationMenuId,
  conversationMenuRef,
  defaultCollapsed,
  setConversationMenuId,
  setIsCollapsed,
  setWorkspaceOpen,
}) {
  useEffect(() => {
    setIsCollapsed(defaultCollapsed);
  }, [defaultCollapsed, setIsCollapsed]);

  useEffect(() => {
    function handleGlobalShortcut(event) {
      if ((event.ctrlKey || event.metaKey) && event.key === ".") {
        event.preventDefault();
        setIsCollapsed(false);
      }
    }
    window.addEventListener("keydown", handleGlobalShortcut);
    return () => window.removeEventListener("keydown", handleGlobalShortcut);
  }, [setIsCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function handleFocusComposer() {
      setWorkspaceOpen(true);
      requestAnimationFrame(() => composerRef.current?.focus());
    }
    window.addEventListener("hmadv:copilot-focus-composer", handleFocusComposer);
    return () => window.removeEventListener("hmadv:copilot-focus-composer", handleFocusComposer);
  }, [composerRef, setWorkspaceOpen]);

  useEffect(() => {
    if (typeof window === "undefined" || !conversationMenuId) return undefined;
    const handlePointerDown = (event) => {
      if (conversationMenuRef.current && !conversationMenuRef.current.contains(event.target)) {
        setConversationMenuId(null);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") setConversationMenuId(null);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [conversationMenuId, conversationMenuRef, setConversationMenuId]);
}
