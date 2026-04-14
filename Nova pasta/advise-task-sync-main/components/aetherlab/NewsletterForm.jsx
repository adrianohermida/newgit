import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NewsletterForm({ title = "Newsletters", description = "Receba novidades e conteúdos sobre inovação." }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Integrar com EmailJS ou seu serviço
      console.log('Email:', email);
      setSuccess(true);
      setEmail('');
      setTimeout(() => setSuccess(false), 5000);
    } catch (error) {
      console.error('Erro ao enviar:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-8 border border-[#e5e5e5] dark:border-gray-700">
      <h3 className="text-xl font-bold text-[#081828] dark:text-white mb-2">
        {title}
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        {description}
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="flex-1 px-4 py-3 rounded-lg border border-[#e5e5e5] dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:border-[#7e57ff] outline-none transition"
          />
          <Button 
            type="submit" 
            disabled={loading}
            className="bg-[#7e57ff] hover:bg-[#6a4ad1] text-white px-6 h-auto"
          >
            <Mail className="w-5 h-5" />
          </Button>
        </div>
        {success && (
          <p className="text-green-600 dark:text-green-400 text-sm">
            ✓ Inscrição realizada com sucesso!
          </p>
        )}
      </form>
    </div>
  );
}