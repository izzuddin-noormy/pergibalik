import { NextResponse } from 'next/server';
import { cors } from '@/lib/db';
import { requireDriver, publicDriver } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const d = await requireDriver(req);
  if (!d) return cors(NextResponse.json({ error: 'Please sign in again' }, { status: 401 }));
  return cors(NextResponse.json({ driver: publicDriver(d) }));
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}
