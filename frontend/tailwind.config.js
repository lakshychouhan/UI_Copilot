/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],

safelist: [
  // Layout / grid
  { pattern: /grid/ },
  { pattern: /grid-cols-[1-6]/ },
  { pattern: /gap-[1-9]/ },

  // Flex & alignment
  { pattern: /flex/ },
  { pattern: /items-center/ },
  { pattern: /justify-center/ },

  // Backgrounds & text
  { pattern: /bg-(white|gray-100|gray-200|slate-900|slate-950)/ },
  { pattern: /text-(gray-700|gray-800|white)/ },

  // Borders / radius / shadows
  { pattern: /rounded-(lg|xl|2xl)/ },
  { pattern: /shadow/ },
  { pattern: /^text-(red|blue|green|yellow|gray|slate|white|black)-(100|200|300|400|500|600|700|800|900)$/ },
  { pattern: /^bg-(red|blue|green|yellow|gray|slate|white|black)-(100|200|300|400|500|600|700|800|900)$/ },
  { pattern: /^border-(red|blue|green|yellow|gray|slate|white|black)-(100|200|300|400|500|600|700|800|900)$/ },
  { pattern: /^shadow/ },
  { pattern: /^rounded/ },
  { pattern: /^grid/ },
  { pattern: /^gap-/ },
  { pattern: /^p-/ },
  { pattern: /^m-/ },
  { pattern: /^max-w-/ },
  { pattern: /^w-/ },
],
plugins: [],
};