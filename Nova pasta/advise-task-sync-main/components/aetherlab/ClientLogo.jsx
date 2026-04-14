import React from 'react';
import { COLORS } from './theme/ThemeConfig';
import { Container, Section } from './Container';

export default function ClientLogo({ 
  children,
  title
}) {
  return (
    <Section bgColor="gray">
      <Container>
        {title && (
          <h2 style={{ textAlign: 'center', marginBottom: '40px' }}>
            {title}
          </h2>
        )}
        
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '30px',
            alignItems: 'center'
          }}
          className="md:grid-cols-2 xs:grid-cols-1 xs:gap-0"
        >
          {children}
        </div>
      </Container>
    </Section>
  );
}