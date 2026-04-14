import React from 'react';
import { CheckCircle, Mail, ArrowRight } from 'lucide-react';

export default function MailSuccess({ 
  title = "Email Confirmado!",
  message = "Sua inscrição foi realizada com sucesso.",
  subtitle = "Verifique sua caixa de entrada para começar.",
  actionText = "Voltar ao início",
  actionLink = "/",
  showAnimation = true
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-[#081828] dark:to-[#0f1419] p-4">
      <div className="text-center space-y-8 max-w-md">
        {/* Icon */}
        <div className={`mx-auto ${showAnimation ? 'animate-bounce' : ''}`}>
          <div className="w-24 h-24 mx-auto flex items-center justify-center bg-green-100 dark:bg-green-900/30 rounded-full">
            <CheckCircle className="w-16 h-16 text-green-600 dark:text-green-400" />
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            {title}
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            {message}
          </p>
          <p className="text-gray-500 dark:text-gray-500 flex items-center justify-center gap-2">
            <Mail className="w-5 h-5" />
            {subtitle}
          </p>
        </div>

        {/* CTA */}
        <a
          href={actionLink}
          className="inline-flex items-center gap-2 px-8 py-3 bg-[#7E57FF] hover:bg-[#6B4FD8] text-white font-semibold rounded-lg transition-colors"
        >
          {actionText}
          <ArrowRight className="w-5 h-5" />
        </a>
      </div>
    </div>
  );
}