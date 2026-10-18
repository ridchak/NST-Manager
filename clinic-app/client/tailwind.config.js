/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette from the logo sheet. `blue` is remapped so existing blue-* classes become brand blue:
        // blue-600 = navy #075DA9, blue-500 = light blue #078ACB.
        blue: {
          50: '#EEF7FB', 100: '#DBEDF7', 200: '#B5DCEF', 300: '#82C4E5', 400: '#3FA6DB',
          500: '#078ACB', 600: '#075DA9', 700: '#064B88', 800: '#053A6B', 900: '#042B50',
        },
        brand: { yellow: '#FDCB41', magenta: '#C9427E', sky: '#078ACB', navy: '#075DA9' },
        primary: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          800: '#1e40af', 900: '#1e3a8a',
        },
      },
    },
  },
  plugins: [],
};
