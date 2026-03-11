
import Layout from "../components/Layout";
import { motion } from "framer-motion";

const ARTICLES = [
  {
    category: "SUPERENDIVIDAMENTO",
    date: "15 Out 2023",
    title: "5 Sinais de que você está no Limite do Superendividamento",
    excerpt: "Entenda quando o endividamento deixa de ser um problema comum e passa a ser uma situação protegida por lei.",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/92604e21e_generated_image.png",
  },
  {
    category: "REVISIONAL",
    date: "12 Out 2023",
    title: "Como identificar juros abusivos no seu contrato de financiamento",
    excerpt: "Aprenda a ler as entrelinhas do seu contrato bancário e identifique taxas que podem ser contestadas judicialmente.",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/eb41f4fb8_generated_image.png",
  },
  {
    category: "LEIS",
    date: "08 Out 2023",
    title: "A Nova Lei 14.181 e seus benefícios para o consumidor brasileiro",
    excerpt: "Tudo o que você precisa saber sobre a atualização do Código de Defesa do Consumidor.",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/785905e76_generated_image.png",
  },
  {
    category: "DICAS",
    date: "01 Out 2023",
    title: "Como organizar suas finanças após uma renegociação de dívidas",
    excerpt: "Dicas práticas para manter a saúde financeira depois de conseguir a redução das suas dívidas.",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/3f356e7c6_generated_image.png",
  },
  {
    category: "SUPERENDIVIDAMENTO",
    date: "25 Set 2023",
    title: "Mínimo existencial: entenda seus direitos na lei do superendividamento",
    excerpt: "A lei garante que você mantenha o mínimo necessário para viver com dignidade, mesmo endividado.",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/9f6b9fe41_generated_image.png",
  },
  {
    category: "REVISIONAL",
    date: "20 Set 2023",
    title: "Financiamento de veículo: quando é possível revisá-lo judicialmente",
    excerpt: "Saiba quando e como entrar com uma ação revisional para reduzir as parcelas do seu financiamento.",
    image: "/perfil_1.jpg",
  },
];

export default function Blog() {
  return (
    <Layout>
      <div className="pt-32 pb-24">
        <div className="mx-auto max-w-7xl px-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-20"
          >
            <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-4" style={{ color: "#C5A059" }}>
              Conteúdo Especializado
            </p>
            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl font-light mb-6">
              Blog <span className="italic" style={{ color: "#C5A059" }}>Jurídico</span>
            </h1>
            <p className="text-base opacity-40 max-w-xl leading-relaxed">
              Artigos, análises e guias práticos sobre direito bancário, proteção ao consumidor e superendividamento.
            </p>
          </motion.div>

          {/* Articles grid */}
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {ARTICLES.map((article, i) => (
              <motion.article
                key={article.title}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: i * 0.1 }}
                className="group cursor-pointer"
              >
                <div className="aspect-[16/10] overflow-hidden mb-6" style={{ border: "1px solid #2D2E2E" }}>
                  <img
                    src={article.image}
                    alt={article.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    style={{ filter: "brightness(0.5) contrast(1.1)" }}
                  />
                </div>

                <div className="flex items-center gap-3 mb-4">
                  <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C5A059" }}>
                    {article.category}
                  </span>
                  <span className="w-1 h-1 rounded-full" style={{ background: "#2D2E2E" }} />
                  <span className="text-[10px] font-semibold tracking-[0.15em] uppercase opacity-30">
                    {article.date}
                  </span>
                </div>

                <h4 className="font-serif text-xl md:text-2xl font-light mb-3 group-hover:text-[#C5A059] transition-colors duration-300" style={{ color: "#F4F1EA" }}>
                  {article.title}
                </h4>
                <p className="text-sm opacity-40 leading-relaxed">
                  {article.excerpt}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
