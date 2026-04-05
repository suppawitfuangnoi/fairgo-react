/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx}',
    '../../apps/*/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#13c8ec',
        'primary-dark': '#0ea5c3',
        'primary-light': '#e8fafd',
        'bg-light': '#f6f8f8',
        'bg-dark': '#101f22',
        // Alias tokens used by driver & customer apps
        'background-light': '#f6f8f8',
        'background-dark': '#101f22',
        'surface-light': '#ffffff',
        'surface-dark': '#1a2f33',
        'card-light': '#ffffff',
        'card-dark': '#1a2f33',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
        'text-primary': '#0d1f22',
        'text-secondary': '#6b7280',
        'border-light': '#e5e7eb',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'IBM Plex Sans Thai', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        card: '0 2px 12px rgba(0,0,0,0.06)',
        'card-md': '0 4px 24px rgba(0,0,0,0.10)',
        float: '0 8px 32px rgba(0,0,0,0.14)',
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.35s ease-out',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(20px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
      },
    },
  },
  plugins: [],
};
