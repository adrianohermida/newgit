import React from 'react';

export default function SectionTitle({ subtitle, title, description, centered = true }) {
  return (
    <div className={`section-title ${centered ? 'text-center' : ''}`}>
      {subtitle && (
        <h3 className="text-sm font-semibold text-[#7e57ff] uppercase tracking-wide mb-2">
          {subtitle}
        </h3>
      )}
      {title && (
        <h2 className="text-3xl sm:text-4xl font-bold text-[#081828] dark:text-white mb-4">
          {title}
        </h2>
      )}
      {description && (
        <p className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          {description}
        </p>
      )}
    </div>
  );
}