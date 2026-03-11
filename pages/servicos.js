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
        <title>Serviços Jurídicos: Superendividamento, Juros Abusivos, Contratos e Direito Bancário | Hermida Maia</title>
        <meta name="description" content="Conheça nossos serviços jurídicos em superendividamento, revisão bancária, contratos, defesa contra juros abusivos, empréstimo consignado, cartão de crédito e direito bancário. Atendimento nacional." />
        <meta name="keywords" content="advogado, serviços jurídicos, superendividamento, revisão bancária, contratos, juros abusivo, empréstimo consignado, cartão de crédito, defesa do consumidor, direito bancário" />
      </Head>
      <ServicosHero />
      <ServicosList />
      <ServicosFAQ />
      <ServicosCTA />
    </Layout>
  );
}
