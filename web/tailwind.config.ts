import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Quicksilver brand palette extracted from the official SVG assets.
        // Orange #f47822 / Ink #231f20 are the only two brand-defined values;
        // the surrounding scale was hand-tuned for UI use.
        brand: {
          orange: {
            DEFAULT: "#f47822",
            50: "#fef5ec",
            100: "#fde7d0",
            200: "#fbcb9b",
            300: "#f9aa66",
            400: "#f78b3f",
            500: "#f47822",
            600: "#d75e15",
            700: "#a94714",
            800: "#7a3514",
            900: "#552512",
          },
          ink: {
            DEFAULT: "#231f20",
            50: "#f5f5f5",
            100: "#e7e6e6",
            200: "#c8c5c6",
            300: "#a4a0a1",
            400: "#7a7576",
            500: "#534f50",
            600: "#3a3536",
            700: "#2c2728",
            800: "#231f20",
            900: "#181516",
          },
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "0.875rem",
      },
    },
  },
  plugins: [],
};

export default config;
