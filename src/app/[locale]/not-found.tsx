import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('home');
  return (
    <main className="mx-auto grid max-w-xl gap-4 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{t('notFound')}</h1>
      <Link href="/" className="justify-self-center rounded-full bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-strong">
        {t('backHome')}
      </Link>
    </main>
  );
}
