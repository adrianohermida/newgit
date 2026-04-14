import React from 'react';
import { COLORS, BORDER_RADIUS, TYPOGRAPHY } from './theme/ThemeConfig';

export default function Badge({ 
  children,
  variant = 'primary',
  size = 'md',
  className = ''
}) {
  const sizes = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  const variants = {
    primary: {
      backgroundColor: COLORS.primaryLight,
      color: COLORS.primary,
      border: `1px solid ${COLORS.primary}`
    },
    secondary: {
      backgroundColor: COLORS.gray,
      color: COLORS.text.heading,
      border: `1px solid ${COLORS.border}`
    },
    success: {
      backgroundColor: '#E8F5E9',
      color: '#2E7D32',
      border: '1px solid #2E7D32'
    },
    warning: {
      backgroundColor: '#FFF3E0',
      color: '#F57C00',
      border: '1px solid #F57C00'
    },
    danger: {
      backgroundColor: '#FFEBEE',
      color: '#C62828',
      border: '1px solid #C62828'
    }
  };

  const baseStyle = {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontWeight: TYPOGRAPHY.weights.semibold,
    borderRadius: BORDER_RADIUS,
    display: 'inline-block',
    ...variants[variant]
  };

  return (
    <span
      className={`font-semibold ${sizes[size]} ${className}`}
      style={baseStyle}
    >
      {children}
    </span>
  );
}