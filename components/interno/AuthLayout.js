import Head from "next/head";
import Link from "next/link";

const defaultHighlights = [
  "Login e recuperacao conectados ao Supabase Auth.",
  "Fluxo isolado da home para homologacao sem regressao.",
  "Base pronta para integrar o botao Entrar quando o circuito estiver validado.",
];

export default function AuthLayout({
  title,
  description,
  eyebrow = "Area interna",
  highlights = defaultHighlights,
  children,
}) {
  return (
    <>
      <Head>
        <title>{title} | Hermida Maia</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div className="relative min-h-screen overflow-hidden bg-[#050706] px-6 py-8 text-[#F4F1EA] md:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(212,175,55,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(27,67,50,0.35),_transparent_32%)]" />

        <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_560px]">
          <section className="hidden lg:block">
            <div className="max-w-2xl">
              <p className="mb-6 text-xs font-semibold uppercase tracking-[0.35em] text-[#D4AF37]">
                {eyebrow}
              </p>
              <h1 className="mb-6 font-serif text-6xl leading-[0.95] text-[#F7F1E8]">
                Experiencia de acesso com linguagem{" "}
                <span className="italic text-[#D4AF37]">premium</span>
              </h1>
              <p className="mb-10 max-w-xl text-lg leading-relaxed text-[#D8D1C6]/78">
                Base inspirada nos prototipos do Stitch para login, recuperacao, onboarding e area privada,
                sem substituir as paginas publicas existentes.
              </p>

              <div className="grid gap-4">
                {highlights.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-[#D4AF37]/15 bg-[rgba(9,12,11,0.78)] px-5 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#D4AF37]" />
                      <p className="text-sm leading-6 text-[#E8E1D4]/82">{item}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[28px] border border-[#D4AF37]/20 bg-[linear-gradient(180deg,rgba(5,7,6,0.92),rgba(10,15,13,0.96))] shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
            <div className="border-b border-white/8 bg-[linear-gradient(90deg,rgba(212,175,55,0.08),rgba(212,175,55,0.01))] px-8 py-5 md:px-10">
              <Link href="/" className="inline-flex items-center gap-3 text-sm text-[#D8D1C6]/70 transition hover:text-[#F7F1E8]">
                <span aria-hidden="true">&larr;</span>
                Voltar ao site
              </Link>
            </div>

            <div className="px-8 py-8 md:px-10 md:py-10">
              <div className="mb-8 flex items-center justify-between gap-4">
                <div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.32em] text-[#D4AF37]">
                    Hermida Maia
                  </p>
                  <h2 className="font-serif text-4xl leading-tight text-[#F7F1E8]">{title}</h2>
                </div>
                <div className="hidden rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/8 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#D4AF37] md:block">
                  Auth Supabase
                </div>
              </div>

              <p className="mb-8 max-w-xl text-sm leading-7 text-[#D8D1C6]/72">{description}</p>

              {children}

              <div className="mt-8 border-t border-white/8 pt-6 text-[11px] uppercase tracking-[0.2em] text-[#8F887C]">
                Acesso restrito a clientes e equipe autorizada
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
