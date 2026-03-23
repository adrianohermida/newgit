export function useToast() {
  const emit = (type, message) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("hm:toast", {
        detail: { type, message },
      })
    );
  };

  return {
    show: (msg, type = "info") => emit(type, msg),
    hide: () => {},
  };
}
