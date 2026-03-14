/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Celestial Design System
        alabaster: '#F7F7F8',
        obsidian: '#1A1A1A',
        celestial: {
          50: '#f8f7ff',
          100: '#f0edff',
          200: '#e3dcff',
          300: '#cfc4ff',
          400: '#b5a4ff',
          500: '#9d85ff',
          600: '#8b6cff',
          700: '#7558e3',
          800: '#5d45ba',
          900: '#4a3391',
        },
        success: '#22c55e',
        warning: '#f97316',
        destructive: '#ef4444',
        muted: '#9ca3af',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
