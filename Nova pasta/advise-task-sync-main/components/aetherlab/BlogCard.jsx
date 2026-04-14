import React from 'react';
import { Calendar, User } from 'lucide-react';

export default function BlogCard({ image, date, author, title, excerpt, link }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-[#e5e5e5] dark:border-gray-700 hover:shadow-lg transition-all">
      {image && (
        <div className="h-48 overflow-hidden bg-gray-200">
          <img src={image} alt={title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
        </div>
      )}
      <div className="p-6">
        <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400 mb-3">
          {date && (
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {date}
            </div>
          )}
          {author && (
            <div className="flex items-center gap-1">
              <User className="w-4 h-4" />
              {author}
            </div>
          )}
        </div>
        <h4 className="text-xl font-semibold text-[#081828] dark:text-white mb-3 line-clamp-2">
          {title}
        </h4>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-3">
          {excerpt}
        </p>
        {link && (
          <a href={link} className="inline-block text-[#7e57ff] font-semibold hover:text-[#6a4ad1] transition">
            Leia mais →
          </a>
        )}
      </div>
    </div>
  );
}