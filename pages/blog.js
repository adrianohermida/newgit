import Layout from "../components/Layout";
import { motion } from "framer-motion";
import Head from "next/head";
import Link from "next/link";
import { getPublishedBlogPosts } from "../lib/blog/posts";

export default function Blog({ articles }) {
  const safeArticles = Array.isArray(articles) ? articles : [];

  if (!Array.isArray(articles)) {
    console.error("[blog] 'articles' prop is not an array:", articles);
  }

  return (
    <Layout>
      <Head>
        <title>Blog Juridico: Superendividamento, Juros Abusivos, Contratos e Defesa do Consumidor | Hermida Maia</title>
        <meta
          name="description"
          content="Dicas e informacoes sobre superendividamento, revisao bancaria, contratos, emprestimo consignado, cartao de credito e direito bancario. Conteudo para consumidores e empresas."
        />
        <meta
          name="keywords"
          content="advogado, blog juridico, superendividamento, revisao bancaria, contratos, juros abusivo, emprestimo consignado, cartao de credito, defesa do consumidor, direito bancario"
        />
      </Head>

      <div className="pt-32 pb-24">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-20"
          >
            <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-4" style={{ color: "#C5A059" }}>
              Conteudo Especializado
            </p>
            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl font-light mb-6">
              Blog <span className="italic" style={{ color: "#C5A059" }}>Juridico</span>
            </h1>
            <p className="text-base opacity-40 max-w-xl leading-relaxed">
              Artigos, analises e guias praticos sobre direito bancario, protecao ao consumidor e superendividamento.
            </p>
          </motion.div>

          {safeArticles.length > 0 ? (
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {safeArticles.map((article, i) => (
                <motion.article
                  key={article.slug}
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: i * 0.1 }}
                  className="group"
                >
                  <Link href={`/blog/${article.slug}`} className="block">
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

                    <h4
                      className="font-serif text-xl md:text-2xl font-light mb-3 group-hover:text-[#C5A059] transition-colors duration-300"
                      style={{ color: "#F4F1EA" }}
                    >
                      {article.title}
                    </h4>
                    <p className="text-sm opacity-40 leading-relaxed">{article.excerpt}</p>
                  </Link>
                </motion.article>
              ))}
            </div>
          ) : (
            <div
              className="max-w-2xl rounded-sm px-6 py-8 text-sm leading-relaxed opacity-70"
              style={{ border: "1px solid #2D2E2E", background: "rgba(18, 18, 18, 0.35)" }}
            >
              Nenhum artigo esta disponivel no momento. Tente novamente em instantes.
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export async function getStaticProps() {
  const articles = await getPublishedBlogPosts();

  return {
    props: {
      articles,
    },
  };
}
