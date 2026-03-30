const sharedConfig = require('../../packages/ui/tailwind.config.js');

module.exports = {
  ...sharedConfig,
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    ...sharedConfig.theme,
    extend: {
      ...sharedConfig.theme.extend,
      colors: {
        ...sharedConfig.theme.extend.colors,
        'background-light': '#f6f8f8',
        'background-dark': '#101f22',
        'surface-light': '#ffffff',
        'surface-dark': '#16282d',
        'text-main': '#1e293b',
        'text-muted': '#64748b',
        'neutral-surface': '#eef2f3',
        'neutral-surface-dark': '#1a2c30',
        'card-light': '#ffffff',
        'card-dark': '#162a2e',
      },
    },
  },
};
