import React from 'react';
import TeamMemberCard from './TeamMemberCard';
import SectionTitle from './SectionTitle';

export default function TeamSection({ 
  title,
  subtitle,
  description,
  members = [],
  columns = 3
}) {
  if (members.length === 0) return null;

  const columnClasses = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <section className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        {(title || subtitle || description) && (
          <div className="mb-16">
            <SectionTitle
              subtitle={subtitle}
              title={title}
              description={description}
              centered
            />
          </div>
        )}

        {/* Team Grid */}
        <div className={`grid grid-cols-1 gap-8 ${columnClasses[columns] || columnClasses[3]}`}>
          {members.map((member, idx) => (
            <TeamMemberCard
              key={idx}
              {...member}
            />
          ))}
        </div>
      </div>
    </section>
  );
}