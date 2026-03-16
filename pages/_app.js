import '../styles/globals.css';
import Head from 'next/head';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Hermida Maia Advocacia | Advogado Especialista em Superendividamento, Juros Abusivos e Contratos Bancários</title>
        <meta name="description" content="Escritório de advocacia especializado em superendividamento, revisão bancária, contratos, defesa contra juros abusivos, empréstimo consignado, cartão de crédito e direito bancário." />
        <meta name="keywords" content="advogado, superendividamento, revisão bancária, contratos, juros abusivo, empréstimo consignado, cartão de crédito, reserva de margem consignada, defesa do consumidor, negociação de dívidas, recuperação judicial, direito bancário, consultoria jurídica" />
        <link rel="icon" type="image/webp" href="/images/OIP.webp" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
