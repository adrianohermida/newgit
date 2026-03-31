import React, { useRef } from "react";
import { motion, useInView } from "framer-motion";
import Link from "next/link";
import { getFallbackBlogHighlights } from "../../lib/blog/posts";

const ARTICLES = getFallbackBlogHighlights(3);

function ArticleCard({ article, index }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay: index * 0.12 }}
      className="group"
    >
      <Link href={`/blog/${article.slug}`} className="block">
        <div className="aspect-[16/10] overflow-hidden mb-6 light-sweep" style={{ border: "1px solid #2D2E2E" }}>
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
  );
}

export default function BlogSection() {
  const headerRef = useRef(null);
  const isInView = useInView(headerRef, { once: true });

  return (
    <section id="blog" className="py-24 lg:py-32" style={{ borderTop: "1px solid #2D2E2E" }}>
      <div className="mx-auto max-w-7xl px-6">
        <div ref={headerRef} className="flex items-end justify-between mb-16">
          <div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
              style={{ color: "#C5A059" }}
            >
              Conteudo Especializado
            </motion.p>
            <motion.h3
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 }}
              className="font-serif text-4xl md:text-5xl font-light"
            >
              Blog <span className="italic" style={{ color: "#C5A059" }}>Juridico</span>
            </motion.h3>
          </div>
          <Link
            href="/blog"
            className="hidden md:inline-flex items-center gap-3 text-xs font-semibold tracking-[0.15em] uppercase hover:text-[#C5A059] transition-colors"
            style={{ color: "rgba(244, 241, 234, 0.5)" }}
          >
            Ver todos
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17L17 7M17 7H7M17 7v10" />
            </svg>
          </Link>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {ARTICLES.map((article, i) => (
            <ArticleCard key={article.slug} article={article} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
