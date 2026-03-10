import React from "react";
import { motion, useInView } from "framer-motion";

const companies = [
  { name: "Globo", logo: "https://upload.wikimedia.org/wikipedia/commons/6/6b/Globo_logo.png" },
  { name: "UOL", logo: "https://upload.wikimedia.org/wikipedia/commons/2/2c/UOL_logo.png" },
  { name: "Estadão", logo: "https://upload.wikimedia.org/wikipedia/commons/7/7e/Estadao_logo.png" },
  { name: "Exame", logo: "https://upload.wikimedia.org/wikipedia/commons/2/2e/Exame_logo.png" },
  { name: "Valor", logo: "https://upload.wikimedia.org/wikipedia/commons/2/2e/Valor_Economico_logo.png" },
];

export default function SocialProofBar() {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <section ref={ref} className="py-8 bg-black">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7 }}
        className="flex flex-wrap justify-center items-center gap-8 max-w-5xl mx-auto px-6"
      >
        {companies.map((c) => (
          <img
            key={c.name}
            src={c.logo}
            alt={c.name}
            className="h-8 md:h-10 opacity-60 grayscale hover:grayscale-0 transition-all duration-300"
            style={{ maxWidth: 120 }}
          />
        ))}
      </motion.div>
    </section>
  );
}
