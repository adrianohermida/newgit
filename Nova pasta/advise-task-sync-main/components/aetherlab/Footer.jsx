import React from 'react';
import FooterSection from './FooterSection';
import FooterLinks from './FooterLinks';
import FooterNewsletter from './FooterNewsletter';
import FooterCopyright from './FooterCopyright';

export default function Footer({ 
  isDark = false,
  companyName = 'LegalChain',
  about,
  logo,
  socialLinks,
  linkSections = [],
  showNewsletter = true,
  creditsUrl
}) {
  const defaultSections = [
    {
      title: 'Produto',
      links: [
        { label: 'Funcionalidades', url: '#features' },
        { label: 'Preços', url: '#pricing' },
        { label: 'Documentação', url: '#docs' },
        { label: 'Status', url: '#status' }
      ]
    },
    {
      title: 'Empresa',
      links: [
        { label: 'Sobre', url: '#about' },
        { label: 'Blog', url: '#blog' },
        { label: 'Carreiras', url: '#careers' },
        { label: 'Contato', url: '#contact' }
      ]
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacidade', url: '#privacy' },
        { label: 'Termos', url: '#terms' },
        { label: 'Compliance', url: '#compliance' },
        { label: 'Segurança', url: '#security' }
      ]
    }
  ];

  return (
    <footer className="bg-[#081828] text-white py-16 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Main Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-12">
          {/* About Section */}
          <div className="lg:col-span-2">
            <FooterSection 
              logo={logo}
              about={about}
              socialLinks={socialLinks}
            />
          </div>

          {/* Link Sections */}
          {(linkSections.length > 0 ? linkSections : defaultSections).map((section, idx) => (
            <FooterLinks
              key={idx}
              title={section.title}
              links={section.links}
            />
          ))}

          {/* Newsletter */}
          {showNewsletter && (
            <div className="lg:col-span-1">
              <FooterNewsletter isDark={isDark} />
            </div>
          )}
        </div>

        {/* Copyright */}
        <FooterCopyright 
          companyName={companyName}
          creditsUrl={creditsUrl}
        />
      </div>
    </footer>
  );
}