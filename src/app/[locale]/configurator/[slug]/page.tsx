import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Configurator } from '@/components/Configurator';
import { getModel, MODELS } from '@/engine/models';
import { routing } from '@/i18n/routing';

type Params = Promise<{ locale: string; slug: string }>;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => MODELS.map((model) => ({ locale, slug: model.slug })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const model = getModel(slug);
  if (!model || !hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  return { title: t('meta.configurator', { model: t(`models.${model.nameKey}` as 'models.sideboard') }) };
}

export default async function ConfiguratorPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !getModel(slug)) notFound();
  setRequestLocale(locale);
  return <Configurator slug={slug} />;
}
