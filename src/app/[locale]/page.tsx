import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MODELS } from '@/engine/models';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <main className="mx-auto grid max-w-4xl gap-8 px-4 py-12">
      <header className="grid gap-3">
        <p className="text-lg font-bold tracking-tight text-accent-strong">{t('brand')}</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('home.title')}</h1>
        <p className="max-w-2xl text-lg text-muted">{t('home.subtitle')}</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        {MODELS.map((model) => (
          <li key={model.slug} className="grid gap-3 rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-xl font-semibold">{t(`models.${model.nameKey}` as 'models.sideboard')}</h2>
            <p className="text-muted">{t(`home.${model.nameKey}Desc` as 'home.sideboardDesc')}</p>
            <Link href={`/configurator/${model.slug}`} className="justify-self-start rounded-full bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-strong">
              {t('home.configure')}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
