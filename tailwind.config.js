/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Manrope", "Noto Sans KR", "sans-serif"],
      },
      colors: {
        // CSS 변수 토큰 매핑 — index.css :root / [data-theme="dark"]와 연동
        bg: "var(--color-bg)",
        surface: {
          DEFAULT: "var(--color-surface)",
          alt: "var(--color-surface-alt)",
          dim: "var(--color-surface-dim)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          dim: "var(--color-accent-dim)",
          hover: "var(--color-accent-hover)",
        },
        txt: {
          DEFAULT: "var(--color-text)",
          sub: "var(--color-text-sub)",
          tertiary: "var(--color-text-tertiary)",
          "on-accent": "var(--color-text-on-accent)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          light: "var(--color-border-light)",
        },
        muted: "var(--color-muted)",
        success: {
          DEFAULT: "var(--color-success)",
          dim: "var(--color-success-dim)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          dim: "var(--color-warning-dim)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          dim: "var(--color-danger-dim)",
        },
        // 구 호환 (제거 예정)
        primary: "#1337ec",
        "primary-dark": "#0b25a7",
        "app-dark": "#101322",
        "surface-dark": "#1b1e2e",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
      },
    },
  },
  plugins: [],
}
