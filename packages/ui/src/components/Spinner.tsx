import React from 'react';

export function Spinner({ size = 'md', color = 'primary' }: { size?: 'sm' | 'md' | 'lg'; color?: string }) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-10 h-10' : 'w-6 h-6';
  return (
    <span className={`${sizeClass} border-2 border-current border-t-transparent rounded-full animate-spin inline-block text-${color}`} />
  );
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <Spinner size="lg" />
    </div>
  );
}
