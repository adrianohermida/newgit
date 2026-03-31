import dynamic from "next/dynamic";

const WhatsappWidgetCircle = dynamic(() => import("./WhatsappWidgetCircle"), { ssr: false });

const supportChannel = process.env.NEXT_PUBLIC_SUPPORT_CHANNEL || "whatsapp";
const freshworksChatEnabled = process.env.NEXT_PUBLIC_FRESHWORKS_WIDGET_CHAT === "true";

export default function SupportWidget() {
  // When Freshworks chat is active, the external widget becomes the primary channel.
  if (supportChannel === "freshworks" && freshworksChatEnabled) {
    return null;
  }

  return <WhatsappWidgetCircle />;
}
