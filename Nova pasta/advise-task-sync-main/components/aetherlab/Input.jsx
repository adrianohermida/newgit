import React from 'react';
import { COLORS, BORDER_RADIUS, TYPOGRAPHY } from './theme/ThemeConfig';

export default function Input({ 
  type = 'text',
  placeholder = '',
  disabled = false,
  error = false,
  value = '',
  onChange = () => {},
  className = '',
  ...props
}) {
  const baseStyle = {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.base,
    padding: '12px 16px',
    border: `1px solid ${error ? '#DC2626' : COLORS.border}`,
    borderRadius: BORDER_RADIUS,
    backgroundColor: COLORS.white,
    color: COLORS.text.heading,
    transition: 'border-color 200ms ease-in-out',
    '&:focus': {
      outline: 'none',
      borderColor: COLORS.primary,
      boxShadow: `0 0 0 3px ${COLORS.primaryLight}`
    },
    '&::placeholder': {
      color: COLORS.text.body
    },
    '&:disabled': {
      backgroundColor: COLORS.gray,
      cursor: 'not-allowed',
      opacity: 0.6
    }
  };

  return (
    <input
      type={type}
      placeholder={placeholder}
      disabled={disabled}
      value={value}
      onChange={onChange}
      className={`w-full rounded-[10px] border transition-all focus:outline-none focus:ring-2 focus:ring-opacity-50 ${error ? 'border-red-500 focus:ring-red-500' : 'border-[#F4EEFB] focus:ring-[#7E57FF]'} ${className}`}
      style={baseStyle}
      {...props}
    />
  );
}