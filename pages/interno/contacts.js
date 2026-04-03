import Link from "next/link";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";

export default function InternoContactsPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Contacts"
          description="Ponto de operacao para contatos do CRM enquanto o modulo dedicado segue sendo expandido."
        >
          <div className="space-y-6">
            <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: "#C5A059" }}>
                Operacao CRM
              </p>
              <h2 className="mb-3 font-serif text-3xl">Gestao de contatos</h2>
              <p className="text-sm leading-relaxed opacity-75">
                Este atalho foi restaurado para manter a navegacao interna funcionando. A operacao
                principal de CRM e automacao segue concentrada no AgentLab e nos modulos de
                agendamentos e leads.
              </p>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              <Link href="/interno/agentlab" className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5 hover:border-[#C5A059]">
                Abrir AgentLab
              </Link>
              <Link href="/interno/leads" className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5 hover:border-[#C5A059]">
                Abrir leads
              </Link>
              <Link href="/interno/agendamentos" className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5 hover:border-[#C5A059]">
                Abrir agendamentos
              </Link>
            </section>
          </div>
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
