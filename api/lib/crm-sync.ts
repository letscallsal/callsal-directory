type ListingInput = {
  name?: string;
  ownerName?: string;
  email?: string;
  phone?: string;
  website?: string;
  instagram?: string;
  address?: string;
  category?: string;
  city?: string;
  region?: string;
  placeId?: string;
  mapsUrl?: string;
};

const CRM_ORIGIN = (process.env.CRM_API_URL || 'https://crm.callsal.app').replace(/\/$/, '');

function directoryKey(): string {
  return String(process.env.DIRECTORY_CRM_SECRET || '').trim();
}

function industryOf(listing: ListingInput): string {
  const raw = String(listing.category || '').trim().toLowerCase();
  if (raw === 'barber') return 'barbershops';
  if (raw === 'salon') return 'salons';
  if (raw === 'food') return 'restaurants';
  if (raw === 'dental') return 'dentists';
  if (raw === 'legal') return 'lawyers';
  if (raw === 'accounting') return 'accountants';
  if (raw === 'auto') return 'auto repair';
  if (raw === 'fitness') return 'gyms';
  if (raw === 'wellness') return 'spas';
  if (raw === 'trades') return 'trades';
  return raw || 'general';
}

async function crmFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const key = directoryKey();
  if (!key) return null;
  try {
    return await fetch(`${CRM_ORIGIN}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-directory-key': key,
        ...(init.headers || {}),
      },
    });
  } catch {
    return null;
  }
}

export async function fetchCrmLeads(): Promise<unknown[] | null> {
  const res = await crmFetch('/api/crm/leads');
  if (!res || !res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data : null;
}

export async function importListingToCrm(listing: ListingInput): Promise<boolean> {
  const company = String(listing.name || '').trim();
  if (!company) return false;
  const res = await crmFetch('/api/crm/leads', {
    method: 'POST',
    body: JSON.stringify({
      company,
      contact_name: listing.ownerName || '',
      email: listing.email || '',
      phone: listing.phone || '',
      website: listing.website || '',
      instagram: listing.instagram || '',
      address: listing.address || '',
      industry: industryOf(listing),
      notes: [listing.city, listing.region].filter(Boolean).join(', '),
      source: 'Directory',
      priority: 'Cool',
      stage: 'New',
      google_place_id: listing.placeId || null,
      google_maps_url: listing.mapsUrl || null,
    }),
  });
  return Boolean(res && (res.ok || res.status === 201));
}
