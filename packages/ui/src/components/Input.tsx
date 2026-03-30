import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
}

export function Input({ label, error, icon, suffix, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-semibold text-text-primary">{label}</label>}
      <div className="relative flex items-center">
        {icon && (
          <span className="absolute left-3 text-text-secondary">{icon}</span>
        )}
        <input
          className={[
            'w-full bg-white border rounded-2xl text-sm text-text-primary placeholder:text-text-secondary',
            'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
            'transition-all duration-150 h-11',
            icon ? 'pl-10' : 'pl-4',
            suffix ? 'pr-10' : 'pr-4',
            error ? 'border-danger' : 'border-border-light',
            className,
          ].join(' ')}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 text-text-secondary">{suffix}</span>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
