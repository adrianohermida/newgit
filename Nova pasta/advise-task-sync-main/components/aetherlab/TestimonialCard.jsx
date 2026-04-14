import React from 'react';
import { Quote } from 'lucide-react';

export default function TestimonialCard({ 
  text, 
  author, 
  role, 
  avatar,
  featured = false 
}) {
  return (
    <div className={`relative bg-white rounded-lg p-12 transition-all duration-400 overflow-hidden group ${
      featured ? 'shadow-lg' : 'shadow-base hover:shadow-md'
    }`}>
      {/* Decorative circle */}
      <div className="absolute -right-8 -top-8 w-16 h-16 bg-[#7e57ff] rounded-full opacity-100 group-hover:opacity-90 transition-opacity"></div>

      {/* Quote icon background */}
      <div className="absolute bottom-12 right-10 opacity-10">
        <Quote className="w-12 h-12 text-[#7e57ff]" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <p className="text-gray-600 dark:text-gray-300 text-base leading-relaxed mb-8 italic">
          "{text}"
        </p>

        {/* Author Section */}
        <div className="flex items-center gap-4">
          {avatar && (
            <img 
              src={avatar} 
              alt={author}
              className="w-12 h-12 rounded-full object-cover flex-shrink-0"
            />
          )}
          <div>
            <h4 className="text-base font-semibold text-[#081828] dark:text-white">
              {author}
            </h4>
            {role && (
              <span className="text-sm text-[#727272] dark:text-gray-400 block mt-1">
                {role}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}