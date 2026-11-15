import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { MODELS } from '@/engine/models';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

/** The entry point: choose what to build. Cards come straight from the model registry. */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;
  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:py-14">
      <header className="grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-lg font-bold tracking-tight text-accent-strong">{t('brand')}</p>
          <Link href="/" locale={other} lang={other} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:border-accent hover:text-accent">
            {t(`header.languages.${other}`)}
          </Link>
        </div>
        <p className="mt-6 text-xs font-semibold tracking-[0.2em] text-accent uppercase">{t('home.eyebrow')}</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{t('home.title')}</h1>
        <p className="max-w-2xl text-lg text-muted">{t('home.subtitle')}</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="model-chooser">
        {MODELS.map((model, i) => {
          const name = t(`models.${model.nameKey}` as 'models.sideboard');
          return (
            <li key={model.slug} className={i === 0 ? 'sm:col-span-2' : undefined}>
              <Link
                href={`/configurator/${model.slug}`}
                className="group grid h-full grid-cols-1 overflow-hidden rounded-3xl border border-line bg-surface transition hover:border-accent hover:shadow-lg"
                data-testid={`model-${model.slug}`}
              >
                <Image src={`/models/${model.slug}.png`} alt={t('home.imageAlt', { model: name })} width={900} height={600} unoptimized className={`w-full bg-[#f1efea] object-cover ${i === 0 ? 'aspect-[2/1]' : 'aspect-[3/2]'}`} priority={i < 3} />
                <span className="grid min-w-0 content-start gap-2 p-5">
                  <span className="text-xl font-semibold">{name}</span>
                  <span className="text-muted">{t(`home.desc.${model.nameKey}` as 'home.desc.sideboard')}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-semibold tracking-wider text-accent uppercase">{t('home.adjust')}</span>
                    {model.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-line px-2 py-0.5">
                        {t(`home.tags.${tag}` as 'home.tags.size')}
                      </span>
                    ))}
                  </span>
                  <span className="mt-3 justify-self-start rounded-full bg-accent px-5 py-2 font-semibold text-white group-hover:bg-accent-strong">{t('home.configure')}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
