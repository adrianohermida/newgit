import React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PricingCard({ 
  name, 
  price, 
  period = "mês", 
  description, 
  features = [],
  highlighted = false,
  ctaText = "Assinar Agora",
  onCTA
}) {
  return (
    <div className={`rounded-lg border-2 transition-all ${
      highlighted
        ? 'bg-white border-[#7e57ff] shadow-lg'
        : 'bg-white border-[#e5e5e5] dark:border-gray-700 hover:border-[#7e57ff]'
    } p-8 dark:bg-gray-800`}>
      {highlighted && (
        <div className="mb-4 inline-block px-3 py-1 bg-[#7e57ff] text-white text-xs font-bold rounded-full">
          Mais Popular
        </div>
      )}
      <h4 className="text-2xl font-bold text-[#081828] dark:text-white mb-2">
        {name}
      </h4>
      {description && (
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
          {description}
        </p>
      )}
      <div className="mb-6">
        <span className="text-4xl font-bold text-[#081828] dark:text-white">
          ${price}
        </span>
        <span className="text-gray-600 dark:text-gray-400 ml-2">/{period}</span>
      </div>
      <Button 
        onClick={onCTA}
        className={`w-full h-12 font-semibold mb-6 ${
          highlighted
            ? 'bg-[#7e57ff] hover:bg-[#6a4ad1] text-white'
            : 'border border-[#7e57ff] text-[#7e57ff] bg-white hover:bg-[#f4f7fa]'
        }`}
        variant={highlighted ? 'default' : 'outline'}
      >
        {ctaText}
      </Button>
      <div className="space-y-3">
        {features.map((feature, idx) => (
          <div key={idx} className="flex items-start gap-3">
            <Check className="w-5 h-5 text-[#7e57ff] flex-shrink-0 mt-0.5" />
            <span className="text-gray-600 dark:text-gray-400 text-sm">
              {feature}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}