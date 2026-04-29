/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pdf/tw-content-placeholder.html',
    './template-editor-src/**/*.{ts,tsx}',
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
