import { hostname, networkInterfaces } from 'node:os';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * `next dev` only serves its scripts to pages opened on `localhost`. Opened
 * any other way (127.0.0.1, the computer's name, its network address from a
 * phone) the page would load but never become interactive. Allow the
 * addresses of this machine, plus any listed in DEV_ORIGINS (comma-separated).
 */
function devOrigins(): string[] {
  const own = Object.values(networkInterfaces())
    .flat()
    .filter((address) => address && address.family === 'IPv4')
    .map((address) => (address as { address: string }).address);
  const extra = (process.env.DEV_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set(['127.0.0.1', hostname(), hostname().toLowerCase(), ...own, ...extra])];
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: devOrigins(),
};

export default withNextIntl(nextConfig);
