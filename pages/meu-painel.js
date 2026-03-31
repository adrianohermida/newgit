import Head from "next/head";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function MeuPainelAliasPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/portal");
  }, [router]);

  return (
    <>
      <Head>
        <meta httpEquiv="refresh" content="0;url=/portal" />
      </Head>
      <main className="flex min-h-screen items-center justify-center px-6 text-center">
        <div>
          <p className="text-sm text-[#D8D1C6]">Redirecionando para o portal do cliente...</p>
          <Link href="/portal" className="mt-4 inline-block text-sm text-[#D4AF37] underline">
            Continuar
          </Link>
        </div>
      </main>
    </>
  );
}
