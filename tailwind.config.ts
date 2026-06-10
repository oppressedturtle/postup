import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // PostUp brand: a warm ember/orange ("Heat").
        brand: {
          50: '#fff5ed',
          100: '#ffe8d4',
          200: '#fecca8',
          300: '#fda871',
          400: '#fb7a38',
          500: '#f95612',
          600: '#ea3d08',
          700: '#c22c09',
          800: '#9a2510',
          900: '#7c2110',
        },
      },
    },
  },
  plugins: [],
};

export default config;
