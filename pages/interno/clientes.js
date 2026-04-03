import { useEffect } from "react";
import { useRouter } from "next/router";

export default function InternoClientesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/interno/aprovacoes");
  }, [router]);

  return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Redirecionando para Aprovacoes...</div>;
}
