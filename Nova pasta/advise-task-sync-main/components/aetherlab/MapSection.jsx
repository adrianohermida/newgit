import React from 'react';
import { Container, Section } from './Container';

export default function MapSection({ 
  mapEmbedUrl = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3655.0743145216666!2d-60.02099!3d-3.1190387!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x926c3c1e0e0e0e0d%3A0x0e0e0e0e0e0e0e0e!2sManaus%2C%20AM!5e0!3m2!1spt-BR!2sbr!4v1234567890",
  title = "Nossa Localização"
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
            padding: '10px',
            backgroundColor: '#fff',
            borderRadius: '6px',
            overflow: 'hidden'
          }}
        >
          <iframe
            src={mapEmbedUrl}
            width="100%"
            height="450px"
            style={{
              border: 'none',
              borderRadius: '6px',
              display: 'block'
            }}
            className="md:h-[400px] xs:h-[300px]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Mapa"
          />
        </div>
      </Container>
    </Section>
  );
}