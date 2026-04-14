import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';

export default function TestimonialSlider({ testimonials = [] }) {
  const [current, setCurrent] = useState(0);

  const next = () => {
    setCurrent((current + 1) % testimonials.length);
  };

  const prev = () => {
    setCurrent((current - 1 + testimonials.length) % testimonials.length);
  };

  if (testimonials.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-8 border border-[#e5e5e5] dark:border-gray-700">
      <div className="flex items-start gap-4 mb-6">
        <Quote className="w-8 h-8 text-[#7e57ff] flex-shrink-0" />
      </div>
      
      <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 italic leading-relaxed">
        "{testimonials[current].text}"
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {testimonials[current].avatar && (
            <img 
              src={testimonials[current].avatar}
              alt={testimonials[current].author}
              className="w-12 h-12 rounded-full object-cover"
            />
          )}
          <div>
            <h4 className="font-semibold text-[#081828] dark:text-white">
              {testimonials[current].author}
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {testimonials[current].role}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={prev}
            className="p-2 hover:bg-[#f4f7fa] dark:hover:bg-gray-700 rounded-lg transition"
            aria-label="Anterior"
          >
            <ChevronLeft className="w-5 h-5 text-[#7e57ff]" />
          </button>
          <button
            onClick={next}
            className="p-2 hover:bg-[#f4f7fa] dark:hover:bg-gray-700 rounded-lg transition"
            aria-label="Próximo"
          >
            <ChevronRight className="w-5 h-5 text-[#7e57ff]" />
          </button>
        </div>
      </div>
    </div>
  );
}