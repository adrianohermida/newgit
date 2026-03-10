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
      </Head>
      <div className="text-center py-20">
        <h1 className="text-4xl font-black text-primary">Página inicial Next.js pronta para GitHub Pages</h1>
        <p className="mt-4 text-lg text-slate-600">Cole o conteúdo convertido do seu HTML aqui.</p>
      </div>
    </>
  );
}
