import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function ContactForm({ onSubmit }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (onSubmit) {
        await onSubmit(formData);
      }
      setSuccess(true);
      setFormData({ name: '', email: '', subject: '', message: '' });
      setTimeout(() => setSuccess(false), 5000);
    } catch (error) {
      console.error('Erro ao enviar:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <input
          type="text"
          name="name"
          placeholder="Seu nome"
          value={formData.name}
          onChange={handleChange}
          required
          className="px-4 py-3 rounded-lg border border-[#e5e5e5] dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-[#7e57ff] outline-none transition"
        />
        <input
          type="email"
          name="email"
          placeholder="Seu email"
          value={formData.email}
          onChange={handleChange}
          required
          className="px-4 py-3 rounded-lg border border-[#e5e5e5] dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-[#7e57ff] outline-none transition"
        />
      </div>
      <input
        type="text"
        name="subject"
        placeholder="Assunto"
        value={formData.subject}
        onChange={handleChange}
        required
        className="w-full px-4 py-3 rounded-lg border border-[#e5e5e5] dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-[#7e57ff] outline-none transition"
      />
      <textarea
        name="message"
        placeholder="Sua mensagem"
        rows="5"
        value={formData.message}
        onChange={handleChange}
        required
        className="w-full px-4 py-3 rounded-lg border border-[#e5e5e5] dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-[#7e57ff] outline-none transition resize-none"
      ></textarea>
      <Button 
        type="submit" 
        disabled={loading}
        className="w-full bg-[#7e57ff] hover:bg-[#6a4ad1] text-white h-12 font-semibold"
      >
        {loading && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
        {loading ? 'Enviando...' : 'Enviar Mensagem'}
      </Button>
      {success && (
        <p className="text-green-600 dark:text-green-400 text-center font-semibold">
          ✓ Mensagem enviada com sucesso!
        </p>
      )}
    </form>
  );
}