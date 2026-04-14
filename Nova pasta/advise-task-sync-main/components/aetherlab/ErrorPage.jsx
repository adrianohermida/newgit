import React from 'react';
import ErrorCard from './ErrorCard';

export default function ErrorPage({ 
  code = '404',
  title = 'Page Not Found',
  description = 'The page you are looking for might have been removed or is temporarily unavailable.',
  children,
  className = ''
}) {
  return (
    <div className={`w-full h-screen bg-gray-900 relative overflow-hidden flex items-center justify-center ${className}`}>
      
      {/* Optional Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, #7e57ff 0%, transparent 50%)',
        }}></div>
      </div>

      {/* Error Card */}
      <ErrorCard
        code={code}
        title={title}
        description={description}
      >
        {children}
      </ErrorCard>
    </div>
  );
}