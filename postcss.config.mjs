// Tailwind, Next.js'in önerdiği biçimde PostCSS eklentisiyle çalışır. Önceki @tailwindcss/turbopack yükleyicisi
// globals.css değişikliklerini geliştirme sırasında bir sürüm geriden veriyordu.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
