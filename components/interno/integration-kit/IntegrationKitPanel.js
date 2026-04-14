export default function IntegrationKitPanel({ title, children }) {
  return <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
    <h2 className="font-serif text-2xl text-[#F7F1E8]">{title}</h2>
    <div className="mt-4 space-y-3 text-sm leading-6 text-[#A8B6B0]">{children}</div>
  </section>;
}
