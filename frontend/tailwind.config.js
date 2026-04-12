/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff3ff',
          100: '#dce4fd',
          200: '#bfcdfb',
          300: '#93aaf8',
          400: '#6080f3',
          500: '#3d5aed',
          600: '#1428a0',   // Samsung blue
          700: '#1020820',
          800: '#0e1a7a',
          900: '#0b1463',
          950: '#060b3d',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
      },
      borderRadius: {
        '2xl': '18px',
        '3xl': '24px',
      },
    }
  },
  plugins: []
}
