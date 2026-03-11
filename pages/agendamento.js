import Layout from "../components/Layout";
import AgendamentoForm from "../components/agendamento/AgendamentoForm";
import Head from "next/head";

export default function Agendamento() {
  return (
    <Layout>
      <Head>
        <title>Agendamento de Consulta - Hermida Maia</title>
        <meta name="description" content="Agende sua consulta jurídica especializada com a equipe Hermida Maia." />
      </Head>
      <AgendamentoForm />
    </Layout>
  );
}
