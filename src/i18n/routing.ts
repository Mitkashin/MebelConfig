import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['mk', 'en'],
  defaultLocale: 'mk',
});

export type Locale = (typeof routing.locales)[number];
