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
          50:  '#fef0f8',
          100: '#fcd8ef',
          200: '#f9b0de',
          300: '#f37ec5',
          400: '#e853ae',
          500: '#d6409a',
          600: '#c653a0', // primary magenta
          700: '#a63d82',
          800: '#852d66',
          900: '#6b204f', // dark text / primary CTA
          950: '#420c30',
        },
        border: '#E5E7EB',
        blush: {
          50:  '#fff1f3',
          100: '#ffdde2',
          200: '#ffb8c3',
          300: '#ff8fa0',
          400: '#f5637e',
          500: '#ec5473', // coral accent
          600: '#d93b5b',
          700: '#b82a49',
          800: '#97233b',
          900: '#7e2034',
        },
        cream: '#fff5db',
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
