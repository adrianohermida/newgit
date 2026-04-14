import React from 'react';
import { COLORS, BORDER_RADIUS, TRANSITIONS } from './theme/ThemeConfig';

export default function Button({ 
  children, 
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  ...props 
}) {
  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg'
  };

  const variants = {
    primary: {
      backgroundColor: COLORS.primary,
      color: COLORS.white,
      border: 'none',
      '&:hover': {
        backgroundColor: COLORS.primaryDark
      }
    },
    secondary: {
      backgroundColor: 'transparent',
      color: COLORS.primary,
      border: `2px solid ${COLORS.primary}`,
      '&:hover': {
        backgroundColor: COLORS.primaryLight
      }
    },
    ghost: {
      backgroundColor: 'transparent',
      color: COLORS.primary,
      border: 'none',
      '&:hover': {
        backgroundColor: COLORS.primaryLight
      }
    }
  };

  const baseStyle = {
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 600,
    borderRadius: BORDER_RADIUS,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: TRANSITIONS.fast,
    ...variants[variant]
  };

  return (
    <button
      className={`font-semibold rounded-[10px] transition-all ${sizes[size]} ${className}`}
      style={baseStyle}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}