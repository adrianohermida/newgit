
import { createContext, useContext, useState } from "react";

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  return (
    <ToastContext.Provider value={setToast}>
      {children}
      {toast && (
        <div
          role="alert"
          aria-live="assertive"
          className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 shadow-lg transition-all duration-300 ${toast.type === "error" ? "bg-red-700 text-white" : "bg-green-700 text-white"}`}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}