import Layout from "../components/Layout";
import HeroSection from "../components/home/HeroSection";
import SocialProofBar from "../components/home/SocialProofBar";
import ServicesSection from "../components/home/ServicesSection";
import CalculatorSection from "../components/home/CalculatorSection";
import MethodologySection from "../components/home/MethodologySection";
import TestimonialsSection from "../components/home/TestimonialsSection";
import BlogSection from "../components/home/BlogSection";
import CTASection from "../components/home/CTASection";
import Head from "next/head";

export default function Home() {
  return (
    <Layout>
      <Head>
        <title>Advogado Especialista em Superendividamento, Juros Abusivos e Contratos Bancários | Hermida Maia</title>
        <meta name="description" content="Consultoria jurídica em superendividamento, revisão de contratos, defesa contra juros abusivos, empréstimo consignado, cartão de crédito e direito bancário. Atendimento nacional." />
        <meta name="keywords" content="advogado, superendividamento, revisão bancária, contratos, juros abusivo, empréstimo consignado, cartão de crédito, reserva de margem consignada, defesa do consumidor, negociação de dívidas, recuperação judicial, direito bancário, consultoria jurídica" />
      </Head>
      <HeroSection />
      <div style={{ background: "#050706", color: "#F4F1EA" }}>
        <SocialProofBar />
        <ServicesSection />
        <CalculatorSection />
        <MethodologySection />
        <TestimonialsSection />
        <BlogSection />
        <CTASection />
      </div>
    </Layout>
  );
}
