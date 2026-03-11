import Layout from "../components/Layout";
import ServicosHero from "../components/servicos/ServicosHero";
import ServicosList from "../components/servicos/ServicosList";
import ServicosFAQ from "../components/servicos/ServicosFAQ";
import ServicosCTA from "../components/servicos/ServicosCTA";
import Head from "next/head";

export default function Servicos() {
  return (
    <Layout>
      <Head>
        <title>Serviços Jurídicos - Hermida Maia</title>
        <meta name="description" content="Soluções jurídicas em Direito Bancário, Superendividamento e Recuperação Judicial. Proteja seu patrimônio com especialistas." />
      </Head>
      <ServicosHero />
      <ServicosList />
      <ServicosFAQ />
      <ServicosCTA />
    </Layout>
  );
}
