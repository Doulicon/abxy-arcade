import { useI18n } from '../i18n';

/** 开源项目鸣谢列表（协议信息见 THIRD_PARTY_NOTICES.md） */
const OSS = [
  { name: 'React', url: 'https://react.dev/', license: 'MIT' },
  { name: 'React Router', url: 'https://reactrouter.com/', license: 'MIT' },
  { name: 'Vite', url: 'https://vitejs.dev/', license: 'MIT' },
  { name: 'Tailwind CSS', url: 'https://tailwindcss.com/', license: 'MIT' },
  { name: 'TypeScript', url: 'https://www.typescriptlang.org/', license: 'Apache-2.0' },
  { name: 'Express', url: 'https://expressjs.com/', license: 'MIT' },
  { name: 'better-sqlite3', url: 'https://github.com/WiseLibs/better-sqlite3', license: 'MIT' },
  { name: 'bcryptjs', url: 'https://github.com/dcodeIO/bcrypt.js', license: 'MIT' },
  { name: 'jsonwebtoken', url: 'https://github.com/auth0/node-jsonwebtoken', license: 'MIT' },
  { name: 'multer', url: 'https://github.com/expressjs/multer', license: 'MIT' },
  { name: 'nanoid', url: 'https://github.com/ai/nanoid', license: 'MIT' },
  { name: 'cookie-parser', url: 'https://github.com/expressjs/cookie-parser', license: 'MIT' },
  { name: 'EmulatorJS', url: 'https://emulatorjs.org/', license: 'GPL-3.0' },
];

export default function About() {
  const { t } = useI18n();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-5 sm:py-14">
      <h1 className="font-pixel text-[15px] leading-[1.6] text-neon sm:text-[18px]">
        {t('about.title')}
      </h1>
      <p className="mt-2 text-[12px] text-white/60">{t('about.subtitle')}</p>

      {/* 介绍 */}
      <section className="mt-6 border-2 border-line bg-panel">
        <div className="border-b-2 border-line px-4 py-3">
          <h2 className="text-[12px] font-black tracking-wide text-white">{t('nav.about')}</h2>
        </div>
        <p className="px-4 py-4 text-[13px] leading-[1.9] text-white/80">{t('about.intro')}</p>
      </section>

      {/* 开源鸣谢 */}
      <section className="mt-5 border-2 border-line bg-panel">
        <div className="border-b-2 border-line px-4 py-3">
          <h2 className="text-[12px] font-black tracking-wide text-white">
            {t('about.ossTitle')}
          </h2>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">{t('about.ossIntro')}</p>
        </div>
        <ul className="divide-y divide-line/60">
          {OSS.map((item) => (
            <li key={item.name} className="flex items-center justify-between gap-4 px-4 py-3">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[13px] font-bold text-white transition-colors hover:text-neon"
              >
                {item.name}
              </a>
              <span className="shrink-0 border border-line bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-white/60">
                {item.license}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
