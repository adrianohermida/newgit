import Head from 'next/head';

export default function Home() {
  return (
    <>
      <Head>
        <title>Hermida Maia Advocacia</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta charSet="utf-8" />
        <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@100..700,0..1&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
        <script id="tailwind-config" dangerouslySetInnerHTML={{ __html: `tailwind.config = { darkMode: 'class', theme: { extend: { colors: { primary: '#11d473', 'primary-dark': '#0a8a4b', gold: '#d4af37', 'background-light': '#f6f8f7', 'background-dark': '#102219', 'slate-custom': '#1e293b', }, fontFamily: { display: ['Public Sans', 'sans-serif'] }, borderRadius: { DEFAULT: '0.25rem', lg: '0.5rem', xl: '0.75rem', full: '9999px', }, }, }, }` }} />
        <style>{`body { font-family: 'Public Sans', sans-serif; } .gold-gradient { background: linear-gradient(135deg, #d4af37 0%, #f1d592 50%, #d4af37 100%); } .glass-card { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px); }`}</style>
      </Head>
      {/* TODO: Colar o conteúdo HTML convertido para JSX aqui */}
      <div className="text-center py-20">
        <h1 className="text-4xl font-black text-primary">Página inicial Next.js pronta para GitHub Pages</h1>
        <p className="mt-4 text-lg text-slate-600">Cole o conteúdo convertido do seu HTML aqui.</p>
      </div>
    </>
  );
}
