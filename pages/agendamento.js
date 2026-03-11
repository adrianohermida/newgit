import Layout from "../components/Layout";
import AgendamentoForm from "../components/agendamento/AgendamentoForm";
import Head from "next/head";

export default function Agendamento() {
  return (
    <Layout>
      <Head>
        <title>Agende Consulta com Advogado Especialista em Superendividamento, Juros Abusivos e Contratos | Hermida Maia</title>
        <meta name="description" content="Agende sua consulta jurídica com advogado especialista em superendividamento, revisão bancária, contratos, defesa contra juros abusivos, empréstimo consignado e direito bancário." />
        <meta name="keywords" content="advogado, agendamento, consulta jurídica, superendividamento, revisão bancária, contratos, juros abusivo, empréstimo consignado, cartão de crédito, defesa do consumidor, direito bancário" />
      </Head>
      <AgendamentoForm />
    </Layout>
  );
}
