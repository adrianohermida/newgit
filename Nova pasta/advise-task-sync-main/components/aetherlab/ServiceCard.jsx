import React from 'react';

export default function ServiceCard({ icon: Icon, title, description }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-8 border border-[#e5e5e5] dark:border-gray-700 hover:border-[#7e57ff] transition-all hover:shadow-lg h-full">
      <div className="mb-4 inline-flex p-3 bg-[#f4f7fa] dark:bg-gray-700 rounded-lg">
        {Icon ? <Icon className="w-6 h-6 text-[#7e57ff]" /> : null}
      </div>
      <h4 className="text-xl font-semibold text-[#081828] dark:text-white mb-3">
        {title}
      </h4>
      <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
        {description}
      </p>
    </div>
  );
}