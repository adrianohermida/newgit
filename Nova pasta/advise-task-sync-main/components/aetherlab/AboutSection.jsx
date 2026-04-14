import React from 'react';

export default function AboutSection({ 
  title, 
  description, 
  features = [],
  image,
  imagePosition = 'right'
}) {
  const content = (
    <div className="flex-1">
      <h2 className="text-3xl sm:text-4xl font-bold text-[#081828] dark:text-white mb-6">
        {title}
      </h2>
      <p className="text-gray-600 dark:text-gray-400 text-lg mb-8 leading-relaxed">
        {description}
      </p>
      {features.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {features.map((feature, idx) => (
            <div key={idx} className="flex gap-4">
              <div className="flex-shrink-0">
                {feature.icon && (
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-[#7e57ff]/10">
                    <feature.icon className="w-6 h-6 text-[#7e57ff]" />
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-lg font-semibold text-[#081828] dark:text-white mb-2">
                  {feature.title}
                </h4>
                <p className="text-gray-600 dark:text-gray-400">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const imageEl = image && (
    <div className="flex-1 hidden lg:block">
      <img src={image} alt={title} className="w-full h-auto rounded-lg" />
    </div>
  );

  return (
    <section className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row gap-12 items-center">
          {imagePosition === 'left' && imageEl}
          {content}
          {imagePosition === 'right' && imageEl}
        </div>
      </div>
    </section>
  );
}