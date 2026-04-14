export default function DotobotAccessGate({ authChecked, loading, isAdmin, onLogin }) {
  if (!authChecked || loading) {
    return <div className="p-8 text-center text-lg text-[#C5A059]">Verificando autenticacao...</div>;
  }

  if (isAdmin) return null;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
      <div className="mb-6 text-2xl text-[#C5A059]">Acesso restrito</div>
      <div className="mb-4 text-[#EAE3D6]">Faca login como administrador para usar o Dotobot.</div>
      <button
        type="button"
        onClick={onLogin}
        className="rounded-xl bg-[#D9B46A] px-6 py-3 text-lg font-bold text-[#1A1A1A] transition hover:bg-[#C5A059]"
      >
        Login admin
      </button>
    </div>
  );
}
