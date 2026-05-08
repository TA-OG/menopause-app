import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f4f0fa',
          100: '#e9e0f5',
          200: '#d3c1eb',
          300: '#b899dc',
          400: '#9a6eca',
          500: '#7b4fb5',
          600: '#663d99',
          700: '#54307d',
          800: '#462a68',
          900: '#3b1f6b', // primary brand
          950: '#240f44',
        },
        blush: {
          50:  '#fdf4f7',
          100: '#fce8f1',
          200: '#f9d1e3',
          300: '#f4aacb',
          400: '#ec79ab',
          500: '#e04d8d',
          600: '#cc3071',
          700: '#ab225b',
          800: '#8e1f4d',
          900: '#781e43',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
}

export default config
