/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'gym-bg': '#0f0f0f',
        'gym-accent': '#D7FF37',
        'gym-accent-dark': '#B8DB2F',
        'gym-card': '#1a1a1a',
        'gym-border': '#2a2a2a',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
