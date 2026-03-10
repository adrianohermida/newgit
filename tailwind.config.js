// tailwind.config.js
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#11d473",
        "primary-dark": "#0a8a4b",
        gold: "#d4af37",
        "background-light": "#f6f8f7",
        "background-dark": "#102219",
        "slate-custom": "#1e293b",
      },
      fontFamily: {
        display: ["Public Sans", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },
    },
  },
  darkMode: "class",
  plugins: [require("@tailwindcss/forms")],
};
