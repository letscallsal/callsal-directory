let cached: { key: string; at: number } | null = null;

function localGoogleKey(): string | undefined {
  const key = (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim();
  return key || undefined;
}

export async function resolveGoogleKey(): Promise<string | undefined> {
  const local = localGoogleKey();
  if (local) return local;
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.key;

  const secret = String(process.env.DIRECTORY_CRM_SECRET || '').trim();
  if (!secret) return undefined;
  const origin = (process.env.CRM_API_URL || 'https://crm.callsal.app').replace(/\/$/, '');
  try {
    const res = await fetch(`${origin}/api/directory/maps-key`, {
      headers: { 'x-directory-key': secret },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { key?: string };
    const key = String(data?.key || '').trim();
    if (!key) return undefined;
    cached = { key, at: Date.now() };
    return key;
  } catch {
    return undefined;
  }
}
