import React from 'react';
import VideoPlayButton from './VideoPlayButton';
import SectionTitle from './SectionTitle';

export default function IntroVideoSection({ 
  title,
  subtitle,
  description,
  videoThumbnail,
  videoUrl,
  onPlayClick,
  children,
  className = ''
}) {
  return (
    <section className={`relative z-10 bg-[#081828] pt-32 md:pt-24 sm:pt-16 pb-0 ${className}`}>
      
      {/* White background push at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-white -z-10"></div>

      <div className="max-w-7xl mx-auto px-6">
        
        {/* Section Header */}
        {(title || subtitle || description) && (
          <div className="mb-32 md:mb-24 sm:mb-20 px-0 md:px-12 sm:px-8 text-center">
            <SectionTitle
              title={title}
              subtitle={subtitle}
              description={description}
              centered
            />
          </div>
        )}

        {/* Video Container */}
        <div className="relative z-10">
          {/* Glass Container */}
          <div className="p-8 border border-white/25 rounded-3xl bg-white/14 backdrop-blur-sm sm:p-0 sm:border-none sm:bg-transparent">
            
            {/* White Content Box */}
            <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden pt-20 pb-20 md:pt-12 md:pb-16 sm:pt-12 sm:pb-12">
              
              {/* Decorative Shapes */}
              <div className="absolute right-0 bottom-12 w-32 h-32 sm:w-20 sm:h-20 sm:right-0 sm:bottom-5 opacity-10">
                <div className="w-full h-full rounded-full bg-[#7e57ff]"></div>
              </div>
              <div className="absolute left-0 top-8 w-28 h-28 sm:w-20 sm:h-20 opacity-10">
                <div className="w-full h-full rounded-full bg-[#7e57ff]"></div>
              </div>

              {/* Video Content */}
              <div className="relative z-10 flex flex-col items-center justify-center min-h-[400px] md:min-h-[300px]">
                
                {/* Video Thumbnail */}
                {videoThumbnail && (
                  <img 
                    src={videoThumbnail} 
                    alt="Video thumbnail"
                    className="w-full h-auto mb-8 rounded-lg"
                  />
                )}

                {/* Custom Children */}
                {children && (
                  <div className="mb-8 w-full">
                    {children}
                  </div>
                )}

                {/* Play Button */}
                <VideoPlayButton 
                  onClick={onPlayClick}
                  size="lg"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}