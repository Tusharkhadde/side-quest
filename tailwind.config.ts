import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        moss: { 50: "#f3f6ef", 100: "#e3ebd9", 200: "#c7d6b3", 300: "#a3bb86", 400: "#7f9e5f", 500: "#5f8043", 600: "#4a6634", 700: "#3a502a", 800: "#2f4024", 900: "#27351f" },
        bark: { 50: "#f8f5f0", 100: "#eee7dc", 200: "#dccdb6", 300: "#c5ab88", 400: "#b08e64", 500: "#9a774f", 600: "#7f6043", 700: "#664c38", 800: "#544032", 900: "#47372c" },
        sky: { 50: "#f2f8fb", 100: "#dfeef5", 300: "#9fcbe0", 500: "#4f97ba", 700: "#2f6683" },
        ember: { 400: "#f0a35e", 500: "#e8843a", 600: "#cc6a24" },
        night: "#0b0f0c"
      },
      fontFamily: {
        display: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"],
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"]
      },
      borderRadius: { "4xl": "2rem" }
    }
  },
  plugins: []
};

export default config;
