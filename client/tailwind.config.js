/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Violet accent ramp (600 = --color-accent); static so opacity modifiers keep working
        brand: {
          50: "#f3f0ff",
          100: "#e8e2ff",
          200: "#d3c9ff",
          300: "#b7a7ff",
          400: "#967dff",
          500: "#8266ff",
          600: "#6a4cff",
          700: "#5838e6",
          800: "#4629b8",
          900: "#341f8a",
          950: "#1f1457",
        },
        // Neutral ramp: warm greys in light mode, near-black surfaces for dark: variants
        slate: {
          50: "#f7f7f5",
          100: "#f4f4f1",
          200: "#eeeee9",
          300: "#dcdcd5",
          400: "#a1a1aa",
          500: "#6b6b72",
          600: "#55555c",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
          950: "#0e0e10",
        },
        // Semantic ramps aligned to severity / healthy colours
        rose: {
          50: "#fdf2f2", 100: "#fbe0e1", 200: "#f8b4b4", 300: "#f28a92", 400: "#ff6b7a",
          500: "#d92d3a", 600: "#d92d3a", 700: "#b3261e", 800: "#8f1f1a", 900: "#5c1512", 950: "#2e0a09",
        },
        emerald: {
          50: "#edfbf5", 100: "#d5f5e6", 200: "#a8e8cb", 300: "#6fd6a8", 400: "#2ecc71",
          500: "#1f9d6b", 600: "#1f9d6b", 700: "#1f7a55", 800: "#175e42", 900: "#10432f", 950: "#082a1d",
        },
        amber: {
          50: "#fef9ee", 100: "#fcf0cf", 200: "#fce8a6", 300: "#f5d26b", 400: "#e5a100",
          500: "#c98a00", 600: "#c98a00", 700: "#9a6a00", 800: "#765100", 900: "#523800", 950: "#2c1e00",
        },
        sky: {
          50: "#edf2fe", 100: "#dbe5fd", 200: "#b9cefa", 300: "#8eaef7", 400: "#5c82ff",
          500: "#3e63dd", 600: "#3e63dd", 700: "#3250b5", 800: "#283f8f", 900: "#1d2d66", 950: "#101a3d",
        },
        page: "var(--color-page)",
        "card-bg": "var(--color-card)",
        ink: "var(--color-ink)",
        sidebar: "var(--color-sidebar)",
        "sidebar-icon": "var(--color-sidebar-icon)",
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          subtle: "var(--color-accent-subtle)",
        },
        "border-color": "var(--color-border)",
        pill: {
          DEFAULT: "var(--color-pill)",
          hover: "var(--color-pill-hover)",
        },
        "muted-fg": "var(--color-muted)",
        "main-fg": "var(--color-text-main)",
        sev: {
          p1: {
            DEFAULT: "var(--color-sev-p1)",
            subtle: "var(--color-sev-p1-subtle)",
            border: "var(--color-sev-p1-border)",
          },
          p2: {
            DEFAULT: "var(--color-sev-p2)",
            subtle: "var(--color-sev-p2-subtle)",
            border: "var(--color-sev-p2-border)",
          },
          p3: {
            DEFAULT: "var(--color-sev-p3)",
            subtle: "var(--color-sev-p3-subtle)",
            border: "var(--color-sev-p3-border)",
          },
          p4: {
            DEFAULT: "var(--color-sev-p4)",
            subtle: "var(--color-sev-p4-subtle)",
            border: "var(--color-sev-p4-border)",
          },
        },
        status: {
          triggered: "var(--status-triggered)",
          investigating: "var(--status-investigating)",
          acknowledged: "var(--status-acknowledged)",
          resolved: "var(--status-resolved)",
        },
        healthy: {
          DEFAULT: "var(--color-success)",
          text: "var(--color-success-text)",
          subtle: "var(--color-success-subtle)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          text: "var(--color-danger-text)",
          subtle: "var(--color-danger-subtle)",
        },
      },
      borderRadius: {
        card: "var(--radius-card)",
        sidebar: "var(--radius-sidebar)",
        notch: "var(--radius-notch)",
        pill: "var(--radius-pill)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      letterSpacing: {
        tightest: "-0.04em",
        tighter: "-0.02em",
      },
      boxShadow: {
        xs: "none",
        sm: "var(--shadow-subtle)",
        subtle: "var(--shadow-subtle)",
        card: "var(--shadow-card)",
        floating: "var(--shadow-floating)",
      },
    },
  },
  plugins: [],
}
