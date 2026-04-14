import React, { useState } from 'react';
import { COLORS, TYPOGRAPHY, SHADOWS } from './theme/ThemeConfig';
import { Mail, Linkedin, Github, Twitter } from 'lucide-react';

const ICON_MAP = {
  email: Mail,
  linkedin: Linkedin,
  github: Github,
  twitter: Twitter
};

export default function TeamMember({ 
  name = "Nome do Membro",
  role = "Cargo",
  avatar = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop",
  socialLinks = []
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="text-center transition-all duration-400 ease-out"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ marginTop: '30px' }}
    >
      {/* Avatar */}
      <img
        src={avatar}
        alt={name}
        className="rounded-full inline-block transition-all duration-300 mx-auto"
        style={{
          height: '200px',
          width: '200px',
          padding: '10px',
          backgroundColor: COLORS.white,
          border: `1px solid ${COLORS.border}`,
          boxShadow: isHovered ? SHADOWS.md : 'none'
        }}
      />

      {/* Content */}
      <div
        className="transition-all duration-400 ease-out"
        style={{
          padding: '40px 30px'
        }}
      >
        {/* Name & Role */}
        <h4
          style={{
            fontSize: TYPOGRAPHY.sizes.lg,
            fontWeight: TYPOGRAPHY.weights.semibold,
            fontFamily: TYPOGRAPHY.fontFamily,
            color: COLORS.text.heading,
            marginBottom: '0'
          }}
        >
          {name}
          <span
            className="block mt-2.5"
            style={{
              color: COLORS.text.body,
              fontSize: TYPOGRAPHY.sizes.base,
              fontWeight: TYPOGRAPHY.weights.medium,
              fontFamily: 'DM Sans, sans-serif',
              marginTop: '10px'
            }}
          >
            {role}
          </span>
        </h4>

        {/* Social Links */}
        {socialLinks.length > 0 && (
          <ul
            className="list-none inline-flex gap-5 transition-all duration-400"
            style={{
              opacity: isHovered ? 1 : 0,
              visibility: isHovered ? 'visible' : 'hidden',
              transform: isHovered ? 'translateY(20px)' : 'translateY(-10px)',
              marginTop: '20px',
              padding: '0'
            }}
          >
            {socialLinks.map((link, index) => {
              const Icon = ICON_MAP[link.type] || Mail;
              return (
                <li key={index} style={{ marginRight: index === socialLinks.length - 1 ? 0 : '20px' }}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors duration-300"
                    style={{
                      fontSize: '15px',
                      color: COLORS.black,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onMouseEnter={(e) => e.target.style.color = COLORS.primary}
                    onMouseLeave={(e) => e.target.style.color = COLORS.black}
                  >
                    <Icon size={18} />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}