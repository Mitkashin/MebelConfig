/**
 * Number conventions per language. Written out rather than taken from the
 * browser's Intl data, because not every browser ships Macedonian and the
 * server and client must render the same text.
 */
const NUMBER_STYLE: Record<string, { decimal: string; group: string }> = {
  mk: { decimal: ',', group: '.' },
  en: { decimal: '.', group: ',' },
};

export function formatNumber(value: number, locale: string, options: { min?: number; max?: number; grouping?: boolean } = {}): string {
  const { min = 0, max = 0, grouping = true } = options;
  const style = NUMBER_STYLE[locale] ?? (NUMBER_STYLE.en as { decimal: string; group: string });
  const fixed = Math.abs(value).toFixed(max);
  let [whole = '0', fraction = ''] = fixed.split('.');
  while (fraction.length > min && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  if (grouping) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, style.group);
  return `${value < 0 ? '-' : ''}${whole}${fraction ? style.decimal + fraction : ''}`;
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Dates the same way everywhere: 15.11.2026 in Macedonian, 15 November 2026 in English. */
export function formatDate(date: Date | number, locale: string): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return locale === 'mk' ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` : `${d.getDate()} ${MONTHS_EN[d.getMonth()]} ${d.getFullYear()}`;
}
