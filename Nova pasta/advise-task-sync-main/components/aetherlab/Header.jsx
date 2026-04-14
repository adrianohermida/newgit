import React, { useState } from 'react';
import { COLORS, TYPOGRAPHY } from './theme/ThemeConfig';
import { Menu, X } from 'lucide-react';

export default function Header({ 
  logo = "Legal Tasks",
  navItems = [
    { label: 'Início', href: '#' },
    { label: 'Sobre', href: '#' },
    { label: 'Soluções', href: '#' },
    { label: 'Blog', href: '#' },
    { label: 'Contato', href: '#' }
  ],
  onLoginClick = () => {},
  activeNav = null
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header
      style={{
        backgroundColor: COLORS.white,
        borderBottom: `1px solid #f0f0f0`,
        position: 'sticky',
        top: 0,
        zIndex: 1000
      }}
    >
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '70px'
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textDecoration: 'none',
            cursor: 'pointer'
          }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: `linear-gradient(135deg, ${COLORS.primary} 0%, #8b5cf6 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: COLORS.white,
              fontWeight: TYPOGRAPHY.weights.bold,
              fontSize: '18px',
              fontFamily: TYPOGRAPHY.fontFamily
            }}
          >
            L
          </div>
          <span
            style={{
              fontSize: '18px',
              fontWeight: TYPOGRAPHY.weights.bold,
              color: COLORS.text.heading,
              fontFamily: TYPOGRAPHY.fontFamily
            }}
          >
            {logo}
          </span>
        </div>

        {/* Desktop Navigation */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '40px',
            flex: 1,
            justifyContent: 'center'
          }}
          className="hidden md:flex"
        >
          {navItems.map((item, idx) => (
            <a
              key={idx}
              href={item.href}
              style={{
                fontSize: '15px',
                fontWeight: TYPOGRAPHY.weights.normal,
                color: activeNav === item.label ? COLORS.primary : COLORS.text.heading,
                textDecoration: 'none',
                transition: 'color 0.3s ease',
                fontFamily: TYPOGRAPHY.fontFamily,
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                if (activeNav !== item.label) {
                  e.target.style.color = COLORS.primary;
                }
              }}
              onMouseLeave={(e) => {
                if (activeNav !== item.label) {
                  e.target.style.color = COLORS.text.heading;
                }
              }}
            >
              {item.label}
              {activeNav === item.label && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '-8px',
                    left: '0',
                    right: '0',
                    height: '2px',
                    backgroundColor: COLORS.primary,
                    borderRadius: '2px'
                  }}
                />
              )}
            </a>
          ))}
        </nav>

        {/* Desktop Login Button */}
        <button
          onClick={onLoginClick}
          className="hidden md:flex"
          style={{
            padding: '10px 28px',
            borderRadius: '6px',
            backgroundColor: COLORS.primary,
            color: COLORS.white,
            border: 'none',
            fontSize: '14px',
            fontWeight: TYPOGRAPHY.weights.semibold,
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            fontFamily: TYPOGRAPHY.fontFamily
          }}
          onMouseEnter={(e) => {
            e.target.style.opacity = '0.85';
            e.target.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.target.style.opacity = '1';
            e.target.style.transform = 'translateY(0)';
          }}
        >
          Login
        </button>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex items-center justify-center"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px'
          }}
        >
          {mobileMenuOpen ? (
            <X size={24} color={COLORS.text.heading} />
          ) : (
            <Menu size={24} color={COLORS.text.heading} />
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <nav
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
            borderTop: `1px solid #f0f0f0`,
            backgroundColor: COLORS.white
          }}
          className="md:hidden"
        >
          {navItems.map((item, idx) => (
            <a
              key={idx}
              href={item.href}
              style={{
                padding: '12px 0',
                fontSize: '15px',
                fontWeight: TYPOGRAPHY.weights.normal,
                color: COLORS.text.heading,
                textDecoration: 'none',
                transition: 'color 0.3s ease',
                fontFamily: TYPOGRAPHY.fontFamily
              }}
              onMouseEnter={(e) => e.target.style.color = COLORS.primary}
              onMouseLeave={(e) => e.target.style.color = COLORS.text.heading}
            >
              {item.label}
            </a>
          ))}
          <button
            onClick={() => {
              onLoginClick();
              setMobileMenuOpen(false);
            }}
            style={{
              marginTop: '20px',
              padding: '10px 28px',
              borderRadius: '6px',
              backgroundColor: COLORS.primary,
              color: COLORS.white,
              border: 'none',
              fontSize: '14px',
              fontWeight: TYPOGRAPHY.weights.semibold,
              cursor: 'pointer',
              width: '100%'
            }}
          >
            Login
          </button>
        </nav>
      )}
    </header>
  );
}