import ServicosHero from "../components/servicos/ServicosHero";
import ServicosList from "../components/servicos/ServicosList";
import ServicosFAQ from "../components/servicos/ServicosFAQ";
import ServicosCTA from "../components/servicos/ServicosCTA";

export default function Servicos() {
  return (
    <>
      <ServicosHero />
      <ServicosList />
      <ServicosFAQ />
      <ServicosCTA />
    </>
  );
}
