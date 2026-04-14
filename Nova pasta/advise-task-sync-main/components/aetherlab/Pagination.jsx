import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ 
  currentPage = 1,
  totalPages = 5,
  onPageChange,
  align = 'center',
  className = ''
}) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  const alignClass = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end'
  }[align] || 'justify-center';

  return (
    <nav className={`flex ${alignClass} gap-1 mt-16 md:mt-12 sm:mt-10 mb-0 ${className}`}>
      {/* Previous Button */}
      <button
        onClick={() => onPageChange?.(currentPage - 1)}
        disabled={currentPage === 1}
        className="p-2 text-[#081828] dark:text-gray-200 font-medium text-sm border border-gray-300 dark:border-gray-600 rounded transition-all hover:bg-[#7e57ff] hover:text-white hover:border-[#7e57ff] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* Page Numbers */}
      {pages.map((page) => (
        <button
          key={page}
          onClick={() => onPageChange?.(page)}
          className={`px-5 py-2 text-sm font-medium rounded transition-all border ${
            currentPage === page
              ? 'bg-[#7e57ff] text-white border-[#7e57ff]'
              : 'bg-white text-[#081828] dark:bg-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-[#7e57ff]/10'
          }`}
        >
          {page}
        </button>
      ))}

      {/* Next Button */}
      <button
        onClick={() => onPageChange?.(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="p-2 text-[#081828] dark:text-gray-200 font-medium text-sm border border-gray-300 dark:border-gray-600 rounded transition-all hover:bg-[#7e57ff] hover:text-white hover:border-[#7e57ff] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
}