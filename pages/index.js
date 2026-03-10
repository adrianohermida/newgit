import Layout from "../components/Layout";
import HeroSection from "../components/home/HeroSection";
import SocialProofBar from "../components/home/SocialProofBar";
import ServicesSection from "../components/home/ServicesSection";
import CalculatorSection from "../components/home/CalculatorSection";
import MethodologySection from "../components/home/MethodologySection";
import TestimonialsSection from "../components/home/TestimonialsSection";
import BlogSection from "../components/home/BlogSection";
import CTASection from "../components/home/CTASection";
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
