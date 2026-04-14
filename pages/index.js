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
import { useEffect } from "react";
import { useInternalTheme } from "../components/interno/InternalThemeProvider";

export default function Home() {
  const { setThemePreference } = useInternalTheme();

  useEffect(() => {
    setThemePreference("dark");
  }, [setThemePreference]);

  return (
    <Layout forceDarkMode={true} hideThemeControls={true}>
      <Head>
        <title>Advogado Especialista em Superendividamento, Juros Abusivos e Contratos BancÃ¡rios | Hermida Maia</title>
        <meta name="description" content="Consultoria jurÃ­dica em superendividamento, revisÃ£o de contratos, defesa contra juros abusivos, emprÃ©stimo consignado, cartÃ£o de crÃ©dito e direito bancÃ¡rio. Atendimento nacional." />
        <meta name="keywords" content="advogado, superendividamento, revisÃ£o bancÃ¡ria, contratos, juros abusivo, emprÃ©stimo consignado, cartÃ£o de crÃ©dito, reserva de margem consignada, defesa do consumidor, negociaÃ§Ã£o de dÃ­vidas, recuperaÃ§Ã£o judicial, direito bancÃ¡rio, consultoria jurÃ­dica" />
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
