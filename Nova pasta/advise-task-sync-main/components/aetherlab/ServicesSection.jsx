import React from 'react';
import ServiceCardEnhanced from './ServiceCardEnhanced';
import SectionTitle from './SectionTitle';
import { Button } from '@/components/ui/button';

export default function ServicesSection({ 
  title,
  subtitle,
  description,
  services = [],
  upperContent = null,
  cta = null,
  columns = 3
}) {
  const columnClasses = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <section className="bg-[#F4F7FA] dark:bg-gray-900 py-20 px-6 relative z-0">
      <div className="max-w-6xl mx-auto">
        
        {/* Header Section */}
        {(title || subtitle || description) && (
          <div className="mb-16">
            <SectionTitle
              subtitle={subtitle}
              title={title}
              description={description}
              centered
            />
          </div>
        )}

        {/* Upper Content - With Title and CTA */}
        {upperContent && (
          <div className="mb-16 lg:pr-20">
            {upperContent.subtitle && (
              <p className="text-[#7e57ff] font-semibold text-sm uppercase tracking-wide mb-3">
                {upperContent.subtitle}
              </p>
            )}
            {upperContent.title && (
              <h2 className="text-3xl sm:text-5xl font-bold text-[#081828] dark:text-white mb-4">
                {upperContent.title}
              </h2>
            )}
            {upperContent.description && (
              <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg mt-5">
                {upperContent.description}
              </p>
            )}
            {cta && (
              <div className="mt-10">
                <Button
                  className="bg-[#7e57ff] hover:bg-[#6a4ad1] text-white font-semibold px-8 py-6 rounded-lg transition-all duration-300"
                >
                  {cta.label || 'Saiba Mais'}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Services Grid */}
        {services.length > 0 && (
          <div className={`grid grid-cols-1 gap-8 ${columnClasses[columns] || columnClasses[3]}`}>
            {services.map((service, idx) => (
              <ServiceCardEnhanced
                key={idx}
                icon={service.icon}
                title={service.title}
                description={service.description}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}