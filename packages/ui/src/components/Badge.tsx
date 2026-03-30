import React from 'react';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'default' | 'primary';

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-green-100 text-green-700',
  danger: 'bg-red-100 text-red-600',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
  primary: 'bg-primary-light text-primary-dark',
  default: 'bg-bg-light text-text-secondary',
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}
