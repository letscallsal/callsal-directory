import { leadsKey, planKey } from './auth.js';
import { getStorage } from './storage.js';
import { listCityShops, seedShops, shopDedupeKey, typeLabel, type Shop } from './places.js';

export type Stage = 'new' | 'contacted' | 'replied' | 'booked';
export type Plan = 'free' | 'paid';

export const STAGES: Stage[] = ['new', 'contacted', 'replied', 'booked'];
export const FREE_CAP = 25;
export const PAID_CAP = 1000;
export const ORACLE_PER_DAY = 3;
export const PRICE = '$999 a month';

export interface Lead {
  slug: string;
  placeId?: string;
  name: string;
  type: string;
  category: string;
  city: string;
  region?: string;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  ownerName?: string;
  socials?: { instagram?: string };
  photo?: string;
  verified: {
    phone: boolean;
    website: boolean;
    email: boolean;
    address: boolean;
    ownerName: boolean;
    socials: boolean;
    photo: boolean;
  };
  stage: Stage;
  addedAt: string;
  updatedAt: string;
  oracleDraft?: string;
}

export interface BoardState {
  leads: Lead[];
  lastScanByCity?: Record<string, string>;
  oracleDays?: Record<string, number>;
}

export interface OracleResult {
  nextSlug: string | null;
  nextName: string | null;
  flags: string[];
  stageHint: string;
  draft: string;
  note: string;
}

function emptyBoard(): BoardState {
  return { leads: [], lastScanByCity: {}, oracleDays: {} };
}

export async function loadPlan(userId: string): Promise<Plan> {
  const storage = await getStorage();
  const plan = await storage.get<Plan>(planKey(userId));
  return plan === 'paid' ? 'paid' : 'free';
}

export async function setPlan(userId: string, plan: Plan): Promise<void> {
  const storage = await getStorage();
  await storage.set(planKey(userId), plan);
}

export async function loadBoard(userId: string): Promise<BoardState> {
  const storage = await getStorage();
  const board = await storage.get<BoardState>(leadsKey(userId));
  if (!board || !Array.isArray(board.leads)) return emptyBoard();
  return {
    leads: board.leads,
    lastScanByCity: board.lastScanByCity || {},
    oracleDays: board.oracleDays || {},
  };
}

export async function saveBoard(userId: string, board: BoardState): Promise<void> {
  const storage = await getStorage();
  await storage.set(leadsKey(userId), board);
}

export function torontoDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function capFor(plan: Plan): number {
  return plan === 'paid' ? PAID_CAP : FREE_CAP;
}

export function leadKey(lead: Lead): string {
  return shopDedupeKey(lead);
}

export function hasLead(board: BoardState, shop: { placeId?: string; slug?: string; name: string; address?: string; city?: string }): boolean {
  const key = shopDedupeKey(shop);
  return board.leads.some((lead) => leadKey(lead) === key);
}

export function shopToLead(shop: Shop, stage: Stage = 'new'): Lead {
  const now = new Date().toISOString();
  return {
    slug: shop.slug,
    placeId: shop.placeId,
    name: shop.name,
    type: typeLabel(shop.category),
    category: shop.category,
    city: shop.city,
    region: shop.region,
    address: shop.address,
    phone: shop.phone,
    website: shop.website,
    email: shop.email,
    ownerName: shop.verified.ownerName ? shop.ownerName : undefined,
    socials: shop.socials,
    photo: shop.verified.photo ? shop.photo : undefined,
    verified: { ...shop.verified, photo: Boolean(shop.verified.photo && shop.photo) },
    stage,
    addedAt: now,
    updatedAt: now,
  };
}

export function findShop(slug: string): Shop | undefined {
  return seedShops().find((shop) => shop.slug === slug);
}

export async function addShop(board: BoardState, slug: string, plan: Plan): Promise<{ board: BoardState; added: boolean; reason?: string }> {
  if (hasLead(board, { slug, name: slug })) {
    return { board, added: false, reason: 'on-board' };
  }
  const shop = findShop(slug);
  if (!shop) return { board, added: false, reason: 'missing' };
  if (board.leads.length >= capFor(plan)) {
    return { board, added: false, reason: 'cap' };
  }
  board.leads.push(shopToLead(shop));
  return { board, added: true };
}

export function moveLead(board: BoardState, slug: string, stage: Stage): BoardState {
  const now = new Date().toISOString();
  board.leads = board.leads.map((lead) =>
    lead.slug === slug ? { ...lead, stage, updatedAt: now } : lead,
  );
  return board;
}

function scannedToday(board: BoardState, city: string): boolean {
  const stamp = board.lastScanByCity?.[city];
  return Boolean(stamp && torontoDate(new Date(stamp)) === torontoDate());
}

export async function scanCity(board: BoardState, city: string, plan: Plan): Promise<{
  board: BoardState;
  added: number;
  skipped: number;
  reason?: string;
  source: 'places' | 'seed';
}> {
  if (plan !== 'paid') return { board, added: 0, skipped: 0, reason: 'paid', source: 'seed' };
  const cityKey = city.trim().toLowerCase() || 'milton';
  if (scannedToday(board, cityKey)) {
    return { board, added: 0, skipped: 0, reason: 'scan-wait', source: 'seed' };
  }
  const result = await listCityShops(cityKey);
  let added = 0;
  let skipped = 0;
  for (const shop of result.shops) {
    if (board.leads.length >= PAID_CAP) break;
    if (hasLead(board, shop)) {
      skipped += 1;
      continue;
    }
    board.leads.push(shopToLead(shop));
    added += 1;
  }
  board.lastScanByCity = { ...(board.lastScanByCity || {}), [cityKey]: new Date().toISOString() };
  return { board, added, skipped, source: result.source };
}

export function oracleAllowed(board: BoardState, plan: Plan): { ok: boolean; remaining: number; message?: string } {
  if (plan !== 'paid') return { ok: false, remaining: 0, message: 'paid' };
  const day = torontoDate();
  const used = board.oracleDays?.[day] || 0;
  if (used >= ORACLE_PER_DAY) {
    return { ok: false, remaining: 0, message: 'Oracle can look again after 8am' };
  }
  return { ok: true, remaining: ORACLE_PER_DAY - used };
}

export function runOracle(board: BoardState): OracleResult {
  const next =
    board.leads
      .filter((lead) => lead.stage === 'new')
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt))[0] ||
    board.leads
      .filter((lead) => lead.stage === 'contacted')
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0] ||
    null;

  if (!next) {
    return {
      nextSlug: null,
      nextName: null,
      flags: [],
      stageHint: 'Add a shop from the index first.',
      draft: '',
      note: 'The board is empty.',
    };
  }

  const flags: string[] = [];
  if (!next.verified.phone || !next.phone) flags.push('Phone is missing.');
  if (!next.verified.email || !next.email) flags.push('Email is missing.');
  if (!next.verified.website || !next.website) flags.push('Website is missing.');

  let stageHint = 'Stay with this card until you reach out.';
  if (next.stage === 'new' && (next.phone || next.email)) {
    stageHint = 'Move to Contacted when you reach out.';
  } else if (next.stage === 'contacted') {
    stageHint = 'Move to Replied if they wrote back.';
  } else if (next.stage === 'replied') {
    stageHint = 'Move to Booked if you have a meeting.';
  } else if (next.stage === 'booked') {
    stageHint = 'This one is booked.';
  }

  const missingLine = flags.length
    ? `A published ${flags.map((f) => f.replace(' is missing.', '').toLowerCase()).join(' and ')} is not on the listing yet.`
    : 'The published phone, email, and website are on the listing.';

  const draft = `Hello, I am writing about ${next.name} in ${next.city}. I found the listing on the Directory. ${missingLine}`;

  next.oracleDraft = draft;
  next.updatedAt = new Date().toISOString();
  const day = torontoDate();
  board.oracleDays = { ...(board.oracleDays || {}), [day]: (board.oracleDays?.[day] || 0) + 1 };

  return {
    nextSlug: next.slug,
    nextName: next.name,
    flags,
    stageHint,
    draft,
    note: `Work ${next.name} next.`,
  };
}

export function usage(board: BoardState, plan: Plan) {
  const day = torontoDate();
  const scanStamp = board.lastScanByCity?.milton;
  const scanned = Boolean(scanStamp && torontoDate(new Date(scanStamp)) === day);
  const oracleUsed = board.oracleDays?.[day] || 0;
  return {
    plan,
    leadCount: board.leads.length,
    leadCap: capFor(plan),
    price: PRICE,
    scan: {
      allowed: plan === 'paid' && !scanned,
      message: plan !== 'paid'
        ? `Scan is on Paid Directory at ${PRICE}.`
        : scanned
          ? 'Scan can run again after 8am.'
          : 'Scan can fill Milton shops that are not already on the board.',
    },
    oracle: {
      remaining: plan === 'paid' ? Math.max(0, ORACLE_PER_DAY - oracleUsed) : 0,
      message: plan !== 'paid'
        ? `Oracle is on Paid Directory at ${PRICE}.`
        : oracleUsed >= ORACLE_PER_DAY
          ? 'Oracle can look again after 8am'
          : 'Oracle can review the board a few times a day.',
    },
  };
}
