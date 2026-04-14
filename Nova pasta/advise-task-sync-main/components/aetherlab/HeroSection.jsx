import React from 'react';
import { Button } from '@/components/ui/button';

export default function HeroSection({ 
  subtitle,
  title,
  description,
  buttons = [],
  backgroundImage,
  heroImage,
  layout = 'two-column',
  className = ''
}) {
  const isTwoColumn = layout === 'two-column';
  const imageHidden = 'hidden md:hidden lg:block';

  return (
    <section 
      className={`relative bg-[#081828] overflow-hidden ${className}`}
      style={{
        backgroundImage: backgroundImage ? `url('${backgroundImage}')` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Background overlay for smaller screens */}
      <div className="md:hidden sm:hidden absolute inset-0 bg-[#081828]/90 z-0"></div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className={`grid ${isTwoColumn ? 'lg:grid-cols-2' : 'grid-cols-1'} gap-12 lg:gap-16 items-center`}>
          
          {/* Content Side */}
          <div className={`${isTwoColumn ? 'lg:text-left md:text-center sm:text-center' : 'text-center'} py-60 md:py-32 sm:py-20`}>
            
            {/* Subtitle */}
            {subtitle && (
              <h4 className="text-[#7e57ff] font-semibold text-sm capitalize mb-5">
                {subtitle}
              </h4>
            )}

            {/* Main Title */}
            {title && (
              <h1 className="font-bold text-5xl lg:text-5xl md:text-4xl sm:text-3xl leading-tight text-white capitalize mb-6">
                {title}
              </h1>
            )}

            {/* Description */}
            {description && (
              <p className="font-normal text-base leading-7 text-gray-300 mt-5 mb-12">
                {description}
              </p>
            )}

            {/* Buttons */}
            {buttons.length > 0 && (
              <div className="flex flex-wrap gap-4 md:justify-center sm:justify-center lg:justify-start mt-12">
                {buttons.map((btn, idx) => (
                  <Button
                    key={idx}
                    onClick={btn.onClick}
                    className={`font-semibold py-3 px-8 rounded-full transition-all duration-300 ${
                      btn.variant === 'secondary'
                        ? 'bg-white text-[#081828] hover:bg-[#7e57ff] hover:text-white'
                        : 'bg-[#7e57ff] text-white hover:bg-white hover:text-[#081828]'
                    } ${btn.fullWidth ? 'w-full md:w-auto' : 'w-auto'}`}
                  >
                    {btn.label}
                    {btn.icon && <span className="ml-2">{btn.icon}</span>}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Image Side */}
          {isTwoColumn && heroImage && (
            <div className={`relative h-96 lg:h-full flex items-end justify-center ${imageHidden}`}>
              <img 
                src={heroImage} 
                alt="Hero"
                className="max-h-full object-contain"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}