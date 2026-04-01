import React from 'react';
import StreamCSVImporter from './StreamCSVImporter';

export default function CodigoForoImporter() {
  return (
    <StreamCSVImporter
      entityName="CodigoForoTJSP"
      schemaType="codigo_foro_tjsp"
      title="Importar Códigos de Foro TJSP"
      description="Importa a tabela de códigos de foro do TJSP para enriquecer o ParseCNJ com comarca e vara"
    />
  );
}