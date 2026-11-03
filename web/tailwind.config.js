/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        surface: 'var(--surface)',
        panel: 'var(--panel)',
        line: 'var(--line)',
        muted: 'var(--muted)',
        fg: 'var(--fg)',
        neon: {
          DEFAULT: '#4cc9ff',
          soft: '#8fe3ff',
          deep: '#2a9fd6',
        },
        amber: '#ffb547',
        mint: '#5dff8a',
        danger: '#ff4757',
        cyan: '#5dff8a',
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'var(--font-cjk)', 'ui-monospace', 'monospace'],
        sans: [
          'var(--font-cjk)',
          '"Noto Sans SC"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Hiragino Sans GB"',
          'system-ui',
          'sans-serif',
        ],
      },
      maxWidth: {
        shell: '1200px',
      },
      boxShadow: {
        pixel: '4px 4px 0 0 rgba(0,0,0,.85)',
        'pixel-sm': '2px 2px 0 0 rgba(0,0,0,.85)',
        'pixel-neon': '4px 4px 0 0 #4cc9ff',
        glow: '0 0 24px rgba(76,201,255,.45)',
        'glow-sm': '0 0 12px rgba(76,201,255,.5)',
      },
      keyframes: {
        floaty: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        blink: {
          '0%,49%': { opacity: '1' },
          '50%,100%': { opacity: '0' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        popin: {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        floaty: 'floaty 6s ease-in-out infinite',
        blink: 'blink 1.1s step-end infinite',
        scan: 'scan 6s linear infinite',
        popin: 'popin .28s ease-out both',
        shimmer: 'shimmer 1.4s linear infinite',
      },
    },
  },
  plugins: [],
};
