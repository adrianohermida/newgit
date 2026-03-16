import React from "react";

const whatsappNumber = "555131810323";
const whatsappLink = `https://wa.me/${whatsappNumber}`;
const iconUrl = "https://cdn.sendpulse.com/img/messengers/sp-i-small-forms-wa.svg";

export default function WhatsappWidgetCircle() {
  return (
    <a
      href={whatsappLink}
      className="wa-float-img-circle"
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
        transition: "all .3s",
        alignItems: "center",
        justifyContent: "center",
        background: "#25D366",
      }}
    >
      <img src={iconUrl} alt="WhatsApp" style={{ position: "relative" }} />
    </a>
  );
}