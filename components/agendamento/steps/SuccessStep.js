import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

const GOLD = "#C5A059";
const OBSIDIAN = "#050706";
const PARCHMENT = "#F4F1EA";

export default function SuccessStep({ selectedDate, selectedTime }) {
  return (
    <div style={{ background: OBSIDIAN, minHeight: "100vh" }}>
      <section className="relative py-32 px-6 overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69afcb1629af46b252a01ca2/785905e76_generated_image.png')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }} />
        <div className="relative max-w-2xl mx-auto text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 0.6 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
            style={{ background: GOLD }}
          >
            <CheckCircle2 size={40} color={OBSIDIAN} />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="font-serif text-4xl md:text-5xl font-bold mb-4"
            style={{ color: PARCHMENT }}
          >
            Agendamento Confirmado!
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-lg opacity-70 mb-8"
            style={{ color: PARCHMENT }}
          >
            Você receberá um e-mail de confirmação com todos os detalhes da consulta e o link para a videochamada.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="border p-6 inline-block"
            style={{ borderColor: GOLD }}
          >
            <p className="text-sm mb-2 opacity-60" style={{ color: PARCHMENT }}>Data e Horário</p>
            <p className="text-xl font-bold mb-4" style={{ color: GOLD }}>
              {selectedDate?.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} às {selectedTime}
            </p>
            <p className="text-sm opacity-60" style={{ color: PARCHMENT }}>Dr. Adriano Hermida Maia</p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
