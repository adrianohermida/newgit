import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function FAQItem({ 
  question, 
  answer,
  defaultOpen = false,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`mb-5 rounded-lg shadow-sm hover:shadow-md transition-shadow ${className}`}>
      {/* Header Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full text-left px-6 py-4 md:px-5 md:py-4 sm:px-5 sm:py-4 rounded-lg border-none transition-all duration-300 flex items-center justify-between ${
          isOpen
            ? 'bg-[#7e57ff] text-white rounded-b-none'
            : 'bg-white text-gray-900 hover:bg-gray-50'
        }`}
      >
        <span className="text-base md:text-sm sm:text-sm font-semibold leading-relaxed pr-4">
          {question}
        </span>
        <ChevronDown
          className={`w-5 h-5 md:w-4 md:h-4 sm:w-4 sm:h-4 flex-shrink-0 transition-transform duration-300 ${
            isOpen ? 'rotate-180 text-white' : 'text-gray-600'
          }`}
        />
      </button>

      {/* Body Collapse */}
      {isOpen && (
        <div className="bg-white rounded-b-lg px-6 py-6 md:px-5 md:py-6 sm:px-5 sm:py-5 border-t border-gray-100">
          <div className="text-gray-600 space-y-4 text-base leading-relaxed">
            {typeof answer === 'string' ? (
              <p>{answer}</p>
            ) : (
              answer
            )}
          </div>
        </div>
      )}
    </div>
  );
}