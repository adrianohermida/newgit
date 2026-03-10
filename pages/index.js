import Layout from "../components/Layout";
export default function Home() {
  return (
    <Layout>
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
