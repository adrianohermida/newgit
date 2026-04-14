import React from 'react';
import SectionTitle from './SectionTitle';
import FAQAccordion from './FAQAccordion';

export default function FAQSection({ 
  title,
  subtitle,
  description,
  items = [],
  className = ''
}) {
  return (
    <section className={`pb-20 md:pb-10 sm:pb-8 bg-gray-50 ${className}`}>
      <div className="max-w-7xl mx-auto px-6">
        
        {/* Section Header */}
        {(title || subtitle) && (
          <SectionTitle
            title={title}
            subtitle={subtitle}
            description={description}
            className="mb-16 md:mb-10 sm:mb-8"
          />
        )}

        {/* FAQ Accordion */}
        <FAQAccordion items={items} />
      </div>
    </section>
  );
}