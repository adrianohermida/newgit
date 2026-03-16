import React from "react";

const whatsappNumber = "555131810323";
const whatsappLink = `https://wa.me/${whatsappNumber}`;

export default function WhatsappWidgetCircle() {
  return (
    <a
      href={whatsappLink}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Fale conosco pelo WhatsApp"
      style={{
        width: 56,
        height: 56,
        bottom: 20,
        right: 20,
        borderRadius: "100%",
        position: "fixed",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#25D366",
        boxShadow: "0px 3px 16px #24af588a",
        cursor: "pointer",
      }}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="16" cy="16" r="16" fill="#25D366" />
        <path
          d="M23.5 17.5c-.3-.2-1.7-.8-2-1s-.5-.2-.7.1c-.2.2-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.4-2.3-1.3-.8-.7-1.3-1.5-1.5-1.8-.1-.2 0-.4.1-.5.1-.1.2-.2.3-.3.1-.1.2-.2.3-.4.1-.2.1-.3 0-.5-.1-.2-.7-1.7-.9-2.3-.2-.6-.4-.5-.6-.5-.2 0-.5 0-.7.1-.2.1-.5.2-.7.5-.2.3-.7.9-.7 2.1s.7 2.4 1.6 3.3c.9.9 2.1 1.6 3.3 1.6.7 0 1.3-.2 1.7-.4.4-.2.7-.4.9-.6.2-.2.3-.3.4-.5.1-.2.1-.3.1-.5 0-.2-.1-.3-.2-.4z"
          fill="#fff"
        />
      </svg>
    </a>
  );
}
