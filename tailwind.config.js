/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // El acento se inyecta por negocio vía variables CSS (ver index.css).
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          fg: 'rgb(var(--accent-fg) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      // Sombra difusa y suave (estética minimalista, sin bordes duros).
      boxShadow: {
        soft: '0 6px 24px -8px rgb(15 23 42 / 0.12), 0 2px 6px -2px rgb(15 23 42 / 0.06)',
      },
      // Áreas táctiles amplias para la pantalla de venta.
      minHeight: {
        touch: '3.25rem',
      },
      minWidth: {
        touch: '3.25rem',
      },
    },
  },
  plugins: [],
}
