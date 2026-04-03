import { useEffect, useMemo, useState } from "react";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { clientFetch } from "../../lib/client/api";
import { useSupabaseBrowser } from "../../lib/supabase";

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCpf(value) {
  const digits = digitsOnly(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function formatWhatsapp(value) {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildEmptyContact() {
  return { id: `contact-${Date.now()}-${Math.random()}`, label: "", type: "telefone", value: "", notes: "", primary: false };
}

function buildEmptyAddress() {
  return { id: `address-${Date.now()}-${Math.random()}`, label: "", street: "", number: "", complement: "", district: "", city: "", state: "", postal_code: "", country: "Brasil", primary: false };
}

function buildForm(profile) {
  const metadata = profile?.metadata || {};
  const contacts = normalizeArray(metadata.contacts);
  const addresses = normalizeArray(metadata.addresses);
  return {
    full_name: profile?.full_name || "",
    email: profile?.email || "",
    whatsapp: profile?.whatsapp || "",
    cpf: profile?.cpf || "",
    profession: metadata.profession || "",
    marital_status: metadata.marital_status || "",
    communication_consent: metadata.communication_consent === true,
    contacts: contacts.length ? contacts : [buildEmptyContact()],
    addresses: addresses.length ? addresses : [buildEmptyAddress()],
  };
}

export default function PortalPerfilPage() {
  const [state, setState] = useState({
    loading: true,
    saving: false,
    error: null,
    message: null,
    profile: null,
    requests: [],
    form: buildForm(null),
  });

  return (
    <RequireClient allowIncomplete>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Perfil"
          description="Atualize seus dados pessoais operacionais e envie solicitacoes de alteracao para aprovacao da equipe interna."
        >
          <PerfilContent state={state} setState={setState} />
        </PortalLayout>
      )}
    </RequireClient>
  );
}

function PerfilContent({ state, setState }) {
  const { supabase } = useSupabaseBrowser();

  async function loadProfile() {
    const payload = await clientFetch("/api/client-profile");
    setState((current) => ({
      ...current,
      loading: false,
      saving: false,
      error: null,
      profile: payload.profile,
      requests: payload.requests || [],
      form: buildForm(payload.profile),
    }));
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await clientFetch("/api/client-profile");
        if (!cancelled) {
          setState((current) => ({
            ...current,
            loading: false,
            saving: false,
            error: null,
            profile: payload.profile,
            requests: payload.requests || [],
            form: buildForm(payload.profile),
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            loading: false,
            saving: false,
            error: error.message,
          }));
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [setState]);

  function updateField(name, value) {
    setState((current) => ({
      ...current,
      error: null,
      message: null,
      form: {
        ...current.form,
        [name]: value,
      },
    }));
  }

  function updateArrayItem(field, index, patch) {
    setState((current) => ({
      ...current,
      error: null,
      message: null,
      form: {
        ...current.form,
        [field]: current.form[field].map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
      },
    }));
  }

  function addArrayItem(field, builder) {
    setState((current) => ({
      ...current,
      form: {
        ...current.form,
        [field]: [...current.form[field], builder()],
      },
    }));
  }

  function removeArrayItem(field, index) {
    setState((current) => {
      const nextItems = current.form[field].filter((_, itemIndex) => itemIndex !== index);
      return {
        ...current,
        form: {
          ...current.form,
          [field]: nextItems.length ? nextItems : [field === "contacts" ? buildEmptyContact() : buildEmptyAddress()],
        },
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setState((current) => ({ ...current, saving: true, error: null, message: null }));

    try {
      const payload = await clientFetch("/api/client-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: state.form.full_name,
          whatsapp: digitsOnly(state.form.whatsapp),
          cpf: digitsOnly(state.form.cpf),
          profession: state.form.profession,
          marital_status: state.form.marital_status,
          communication_consent: state.form.communication_consent,
          contacts: state.form.contacts,
          addresses: state.form.addresses,
        }),
      });

      if (supabase) {
        await supabase.auth.refreshSession();
      }

      await loadProfile();

      setState((current) => ({
        ...current,
        saving: false,
        error: null,
        message: payload.message || "Solicitacao enviada com sucesso.",
      }));
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error: error.message, message: null }));
    }
  }

  const locks = useMemo(() => state.profile?.metadata?.personal_data_locks || {}, [state.profile]);
  const pendingRequest = useMemo(() => (state.requests || []).find((item) => item.status === "pending") || null, [state.requests]);

  if (state.loading) {
    return <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando perfil...</div>;
  }

  if (state.error && !state.profile) {
    return <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div>;
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {pendingRequest ? (
        <section className="rounded-[30px] border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#D8C18A]">Solicitacao pendente</p>
          <h3 className="mt-3 font-serif text-2xl">Sua ultima alteracao cadastral esta em analise.</h3>
          <p className="mt-3 text-sm leading-7 opacity-75">
            A equipe interna precisa validar a solicitacao antes de efetivar os dados no seu perfil operacional.
          </p>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.85fr]">
        <div className="space-y-6">
          <Panel title="Identificacao principal" helper="CPF validado e nome verificado podem ser bloqueados pela equipe interna.">
            <div className="grid gap-5 md:grid-cols-2">
              <Field
                label="Nome completo"
                value={state.form.full_name}
                onChange={(event) => updateField("full_name", event.target.value)}
                disabled={locks.full_name_verified === true}
                helper={locks.full_name_verified ? "Bloqueado apos verificacao administrativa." : "Sera enviado para aprovacao antes de alterar o cadastro oficial."}
              />
              <Field label="E-mail de acesso" value={state.form.email} disabled helper="Usado no login do portal." />
              <Field
                label="CPF"
                value={state.form.cpf}
                onChange={(event) => updateField("cpf", formatCpf(event.target.value))}
                disabled={locks.cpf_verified === true}
                helper={locks.cpf_verified ? "CPF validado e bloqueado para edicao." : "Enquanto nao for validado, ainda pode ser corrigido via solicitacao."}
              />
              <Field
                label="WhatsApp principal"
                value={state.form.whatsapp}
                onChange={(event) => updateField("whatsapp", formatWhatsapp(event.target.value))}
                helper="Canal operacional usado em consultas, suporte e documentos."
              />
            </div>
          </Panel>

          <Panel title="Dados pessoais complementares" helper="Campos usados para qualificar o atendimento e o cadastro operacional.">
            <div className="grid gap-5 md:grid-cols-2">
              <Field
                label="Profissao"
                value={state.form.profession}
                onChange={(event) => updateField("profession", event.target.value)}
              />
              <Field
                label="Estado civil"
                value={state.form.marital_status}
                onChange={(event) => updateField("marital_status", event.target.value)}
              />
            </div>
          </Panel>

          <Panel title="Contatos adicionais" helper="Adicione multiplos meios de contato para o escritorio usar quando necessario.">
            <div className="space-y-4">
              {state.form.contacts.map((contact, index) => (
                <div key={contact.id} className="rounded-[24px] border border-[#20332D] bg-black/10 p-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <Field label="Rotulo" value={contact.label} onChange={(event) => updateArrayItem("contacts", index, { label: event.target.value })} />
                    <SelectField
                      label="Tipo"
                      value={contact.type}
                      onChange={(event) => updateArrayItem("contacts", index, { type: event.target.value })}
                      options={[
                        { value: "telefone", label: "Telefone" },
                        { value: "whatsapp", label: "WhatsApp" },
                        { value: "email", label: "E-mail" },
                        { value: "recado", label: "Recado" },
                      ]}
                    />
                    <Field label="Valor" value={contact.value} onChange={(event) => updateArrayItem("contacts", index, { value: event.target.value })} />
                    <Field label="Observacoes" value={contact.notes} onChange={(event) => updateArrayItem("contacts", index, { notes: event.target.value })} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs opacity-70">
                      <input
                        type="checkbox"
                        checked={contact.primary === true}
                        onChange={(event) => updateArrayItem("contacts", index, { primary: event.target.checked })}
                      />
                      Contato principal
                    </label>
                    <button type="button" onClick={() => removeArrayItem("contacts", index)} className="text-xs text-[#F3C7C7] hover:text-[#FFD5D5]">
                      Remover contato
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => addArrayItem("contacts", buildEmptyContact)} className="rounded-2xl border border-[#20332D] px-4 py-3 text-sm hover:border-[#C49C56] hover:text-[#C49C56]">
                Adicionar contato
              </button>
            </div>
          </Panel>

          <Panel title="Enderecos" helper="Voce pode manter endereco residencial, comercial ou correspondencia em separado.">
            <div className="space-y-4">
              {state.form.addresses.map((address, index) => (
                <div key={address.id} className="rounded-[24px] border border-[#20332D] bg-black/10 p-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Rotulo" value={address.label} onChange={(event) => updateArrayItem("addresses", index, { label: event.target.value })} />
                    <Field label="Logradouro" value={address.street} onChange={(event) => updateArrayItem("addresses", index, { street: event.target.value })} />
                    <Field label="Numero" value={address.number} onChange={(event) => updateArrayItem("addresses", index, { number: event.target.value })} />
                    <Field label="Complemento" value={address.complement} onChange={(event) => updateArrayItem("addresses", index, { complement: event.target.value })} />
                    <Field label="Bairro" value={address.district} onChange={(event) => updateArrayItem("addresses", index, { district: event.target.value })} />
                    <Field label="Cidade" value={address.city} onChange={(event) => updateArrayItem("addresses", index, { city: event.target.value })} />
                    <Field label="Estado" value={address.state} onChange={(event) => updateArrayItem("addresses", index, { state: event.target.value.toUpperCase() })} />
                    <Field label="CEP" value={address.postal_code} onChange={(event) => updateArrayItem("addresses", index, { postal_code: event.target.value })} />
                    <Field label="Pais" value={address.country} onChange={(event) => updateArrayItem("addresses", index, { country: event.target.value })} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs opacity-70">
                      <input
                        type="checkbox"
                        checked={address.primary === true}
                        onChange={(event) => updateArrayItem("addresses", index, { primary: event.target.checked })}
                      />
                      Endereco principal
                    </label>
                    <button type="button" onClick={() => removeArrayItem("addresses", index)} className="text-xs text-[#F3C7C7] hover:text-[#FFD5D5]">
                      Remover endereco
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => addArrayItem("addresses", buildEmptyAddress)} className="rounded-2xl border border-[#20332D] px-4 py-3 text-sm hover:border-[#C49C56] hover:text-[#C49C56]">
                Adicionar endereco
              </button>
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Status do cadastro" helper="As alteracoes do portal entram em fluxo de aprovacao antes de refletir no cadastro oficial.">
            <SummaryRow label="Nome verificado" value={locks.full_name_verified ? "Sim" : "Nao"} />
            <SummaryRow label="CPF validado" value={locks.cpf_verified ? "Sim" : "Nao"} />
            <SummaryRow label="Solicitacao pendente" value={pendingRequest ? "Sim" : "Nao"} />
          </Panel>

          <Panel title="Consentimentos" helper="O consentimento operacional continua ativo no portal.">
            <label className="flex gap-3 text-sm leading-6">
              <input
                type="checkbox"
                checked={state.form.communication_consent}
                onChange={(event) => updateField("communication_consent", event.target.checked)}
                className="mt-1"
              />
              Receber comunicacoes operacionais sobre consultas, suporte, documentos e andamento do cadastro.
            </label>
          </Panel>

          <Panel title="Historico recente" helper="Acompanhe o que ja foi solicitado pelo portal.">
            <div className="space-y-3">
              {(state.requests || []).slice(0, 5).map((request) => (
                <div key={request.id} className="rounded-2xl border border-[#20332D] bg-black/10 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold capitalize">{mapRequestStatusLabel(request.status)}</span>
                    <span className="text-xs opacity-55">{formatDateTime(request.created_at)}</span>
                  </div>
                </div>
              ))}
              {!state.requests?.length ? <p className="text-sm opacity-60">Nenhuma solicitacao registrada ainda.</p> : null}
            </div>
          </Panel>
        </div>
      </section>

      {state.error ? <div className="rounded-2xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] px-4 py-3 text-sm">{state.error}</div> : null}
      {state.message ? <div className="rounded-2xl border border-[#1f3a2f] bg-[rgba(12,39,28,0.42)] px-4 py-3 text-sm">{state.message}</div> : null}

      <button type="submit" disabled={state.saving} className="rounded-2xl bg-[#C49C56] px-5 py-3 text-sm font-semibold text-[#07110E] transition hover:brightness-110 disabled:opacity-60">
        {state.saving ? "Enviando..." : "Solicitar atualizacao cadastral"}
      </button>
    </form>
  );
}

function Panel({ title, helper, children }) {
  return (
    <section className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
      <h3 className="font-serif text-2xl">{title}</h3>
      {helper ? <p className="mt-2 text-sm leading-6 opacity-62">{helper}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({ label, helper = null, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] opacity-55">{label}</span>
      <input
        {...props}
        className={`w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none transition focus:border-[#C49C56] ${props.disabled ? "opacity-60" : ""}`}
      />
      {helper ? <span className="mt-2 block text-xs leading-5 opacity-50">{helper}</span> : null}
    </label>
  );
}

function SelectField({ label, options, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] opacity-55">{label}</span>
      <select {...props} className="w-full rounded-2xl border border-white/10 bg-[#0D1513] px-4 py-3 outline-none transition focus:border-[#C49C56]">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
      <span className="text-xs uppercase tracking-[0.18em] opacity-45">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function mapRequestStatusLabel(value) {
  const labels = {
    pending: "Pendente",
    approved: "Aprovada",
    rejected: "Rejeitada",
    applied: "Aplicada",
  };
  return labels[value] || "Registrada";
}

function formatDateTime(value) {
  if (!value) return "Sem data";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("pt-BR");
}
