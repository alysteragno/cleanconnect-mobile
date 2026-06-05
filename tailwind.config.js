/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        pink: {
          50:  '#fdf2f8',
          100: '#fce7f3',
          200: '#fbcfe8',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
        },
      },
    },
  },
  plugins: [],
}
