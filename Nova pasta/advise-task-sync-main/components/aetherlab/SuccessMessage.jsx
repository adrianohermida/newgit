import React from 'react';
import { CheckCircle } from 'lucide-react';

export default function SuccessMessage({ 
  title = 'Sucesso!',
  subtitle = 'Sua mensagem foi enviada com sucesso',
  message = 'Verificaremos e responderemos em breve.',
  buttonText = 'Voltar',
  onButtonClick,
  icon = true,
  fullScreen = true,
  className = ''
}) {
  const containerClass = fullScreen 
    ? 'fixed inset-0 bg-[#081828] flex items-center justify-center'
    : 'bg-[#081828] min-h-screen flex items-center justify-center p-6';

  return (
    <div className={containerClass}>
      <div className="inline-block p-16 md:p-14 sm:p-12 bg-white rounded-xl text-center max-w-md w-full mx-4 md:mx-0">
        
        {/* Icon */}
        {icon && (
          <div className="flex justify-center mb-6">
            <CheckCircle className="w-16 h-16 text-[#7e57ff]" />
          </div>
        )}

        {/* Title */}
        <h1 className="text-5xl md:text-4xl sm:text-3xl font-bold text-[#7e57ff] mb-5">
          {title}
        </h1>

        {/* Subtitle */}
        <h2 className="text-xl md:text-lg sm:text-base text-[#081828] dark:text-gray-900 mb-4 font-semibold">
          {subtitle}
        </h2>

        {/* Message */}
        <p className="font-normal text-[#081828] dark:text-gray-800 text-base mb-8">
          {message}
        </p>

        {/* Button */}
        {onButtonClick && (
          <button
            onClick={onButtonClick}
            className="px-8 py-3 bg-[#7e57ff] text-white font-medium rounded-lg hover:bg-[#6a4ad1] transition-colors duration-300"
          >
            {buttonText}
          </button>
        )}
      </div>
    </div>
  );
}