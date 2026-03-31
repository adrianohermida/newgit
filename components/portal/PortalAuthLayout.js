import Head from "next/head";
import Link from "next/link";

export default function PortalAuthLayout({ title, description, children }) {
  return (
    <>
      <Head>
        <title>{title} | Portal do Cliente | Hermida Maia</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div className="relative min-h-screen overflow-hidden bg-[#07110E] px-6 py-8 text-[#F3EFE7]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(196,156,86,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(11,98,69,0.24),_transparent_32%)]" />

        <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_560px]">
          <section className="hidden lg:block">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.35em] text-[#C49C56]">Portal do cliente</p>
            <h1 className="max-w-2xl font-serif text-6xl leading-[0.94] text-[#FAF5EC]">
              Acompanhe seu caso com clareza, contexto e acesso seguro.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#D6D0C3]/78">
              Nova area autenticada para clientes, inspirada nos fluxos antigos do escritorio e recomposta sobre Supabase,
              Cloudflare Pages e o projeto atual.
            </p>
          </section>

          <section className="overflow-hidden rounded-[30px] border border-[#C49C56]/18 bg-[linear-gradient(180deg,rgba(7,17,14,0.96),rgba(12,20,18,0.94))] shadow-[0_40px_120px_rgba(0,0,0,0.42)]">
            <div className="border-b border-white/8 px-8 py-5">
              <Link href="/" className="inline-flex items-center gap-3 text-sm text-[#D6D0C3]/70 transition hover:text-[#FAF5EC]">
                <span aria-hidden="true">&larr;</span>
                Voltar ao site
              </Link>
            </div>

            <div className="px-8 py-9 md:px-10">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.32em] text-[#C49C56]">Hermida Maia</p>
              <h2 className="font-serif text-4xl text-[#FAF5EC]">{title}</h2>
              <p className="mt-4 mb-8 max-w-xl text-sm leading-7 text-[#D6D0C3]/74">{description}</p>
              {children}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
