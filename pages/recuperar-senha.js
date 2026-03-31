import Head from "next/head";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function RecuperarSenhaAliasPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/interno/recuperar-senha");
  }, [router]);

  return (
    <>
      <Head>
        <meta httpEquiv="refresh" content="0;url=/interno/recuperar-senha" />
      </Head>
      <main className="flex min-h-screen items-center justify-center px-6 text-center">
        <div>
          <p className="text-sm text-[#D8D1C6]">Redirecionando para a recuperacao de senha...</p>
          <Link href="/interno/recuperar-senha" className="mt-4 inline-block text-sm text-[#D4AF37] underline">
            Continuar
          </Link>
        </div>
      </main>
    </>
  );
}
