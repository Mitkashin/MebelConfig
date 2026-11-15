import { appendFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  contact: z.string().trim().min(3).max(160),
  message: z.string().max(2000).nullish(),
  link: z.string().url().max(4000),
  locale: z.enum(['mk', 'en']),
  total: z.number().nonnegative(),
});

/**
 * Inquiry endpoint. It validates the request and records it; no email or CRM
 * is wired up yet (see docs/assumptions.md). Replace the body of `deliver`
 * with the real integration.
 */
async function deliver(inquiry: z.infer<typeof schema>) {
  const line = JSON.stringify({ ...inquiry, receivedAt: new Date().toISOString() });
  console.info('[inquiry]', line);
  if (process.env.INQUIRY_LOG_FILE) await appendFile(process.env.INQUIRY_LOG_FILE, `${line}\n`);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_fields' }, { status: 422 });
  await deliver(parsed.data);
  return NextResponse.json({ ok: true });
}
