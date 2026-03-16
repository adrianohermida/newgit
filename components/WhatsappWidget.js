import React, { useEffect, useState, useRef } from "react";

const whatsappNumber = "555131810323";
const whatsappLink = `https://wa.me/${whatsappNumber}?text=Olá,%20gostaria%20de%20mais%20informações%20sobre%20seus%20serviços.`;

export default function WhatsappWidget() {
  const [showPrimary, setShowPrimary] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);
  const timerRef = useRef();

  useEffect(() => {
    const cookieKey = "wc_whatsapp_primary";
    const cookieValue = localStorage.getItem(cookieKey);

    if (cookieValue !== "1") {
      localStorage.setItem(cookieKey, "1");
      timerRef.current = setTimeout(() => setShowPrimary(true), 4000);
    } else if (window.innerWidth > 550) {
      timerRef.current = setTimeout(() => setShowSecondary(true), 4000);
    }

    return () => clearTimeout(timerRef.current);
  }, []);

  return (
    <div className="wc_whatsapp_app right">
      <a
        href={whatsappLink}
        target="_blank"
        rel="noopener noreferrer"
        className="wc_whatsapp"
        aria-label="Fale conosco pelo WhatsApp"
        onMouseEnter={() => setShowSecondary(false)}
      />

      {showPrimary && (
        <div
          className="wc_whatsapp_primary"
          onClick={() => {
            setShowPrimary(false);
            if (window.innerWidth > 550) setShowSecondary(true);
          }}
        >
          <button
            className="close"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowPrimary(false);
              if (window.innerWidth > 550) setShowSecondary(true);
            }}
          >
            ×
          </button>
          <img
            src="https://cdn.bitrix24.com.br/b23634997/landing/d51/d516162b010bb22939b5d55377931b8a/444x110_1x.png"
            alt="Logo"
          />
          <p>👋 Olá! Tudo bem? Fale conosco pelo WhatsApp!</p>
        </div>
      )}

      {showSecondary && (
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="wc_whatsapp_secondary"
          onClick={() => setShowSecondary(false)}
        >
          <p>Nossa equipe está esperando seu contato. Inicie uma conversa abaixo.</p>
        </a>
      )}
    </div>
  );
}