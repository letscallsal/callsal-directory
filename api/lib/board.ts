import fs from 'fs';
import path from 'path';
import { leadsKey, planKey, type DirectoryUser } from './auth.js';
import { getStorage } from './storage.js';
import { listCityShops, seedShops, shopDedupeKey, typeLabel, type Shop, type ShopCategory } from './places.js';

export type Stage =
  | 'New'
  | 'Contacted'
  | 'Responded'
  | 'Meeting Scheduled'
  | 'Proposal Sent'
  | 'Won';
export type Plan = 'free' | 'paid';

export const STAGES: Stage[] = [
  'New',
  'Contacted',
  'Responded',
  'Meeting Scheduled',
  'Proposal Sent',
  'Won',
];

export const STAGE_LABELS: Record<Stage, string> = {
  New: 'NEW',
  Contacted: 'CONTACTED',
  Responded: 'RESPONDED',
  'Meeting Scheduled': 'MEETING',
  'Proposal Sent': 'PROPOSAL',
  Won: 'WON',
};

const LEGACY_STAGE: Record<string, Stage> = {
  new: 'New',
  contacted: 'Contacted',
  replied: 'Responded',
  responded: 'Responded',
  booked: 'Meeting Scheduled',
  meeting: 'Meeting Scheduled',
  'meeting scheduled': 'Meeting Scheduled',
  proposal: 'Proposal Sent',
  'proposal sent': 'Proposal Sent',
  negotiation: 'Proposal Sent',
  won: 'Won',
};

const CRM_LEADS_KEY = 'callsal:crm:leads';
const HEAVY_FIELDS = ['research_data', 'ai_summary', 'cold_call_script', 'dm_script', 'email_script'] as const;

export const FREE_CAP = 25;
export const PAID_CAP = 1000;
export const ORACLE_PER_DAY = 3;
export const PRICE = '$999 a month';

export interface BoardUser {
  id: string;
  email?: string;
  name?: string;
}

export interface LeadLog {
  at: string;
  type: 'added' | 'stage' | 'note';
  from?: string;
  to?: string;
  text?: string;
}

export interface StoredLead {
  slug: string;
  placeId?: string;
  stage: Stage;
  addedAt: string;
  updatedAt: string;
  oracleDraft?: string;
  note?: string;
  log?: LeadLog[];
  name?: string;
  category?: string;
  city?: string;
  region?: string;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  ownerName?: string;
  photo?: string;
  mapsUrl?: string;
}

export interface Lead extends StoredLead {
  catalogSlug?: string;
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
  mapsUrl?: string;
  verified: {
    phone: boolean;
    website: boolean;
    email: boolean;
    address: boolean;
    ownerName: boolean;
    socials: boolean;
    photo: boolean;
  };
}

export interface BoardState {
  leads: Lead[];
  lastScanByCity?: Record<string, string>;
  oracleDays?: Record<string, number>;
}

interface StoredBoard {
  leads: StoredLead[];
  lastScanByCity?: Record<string, string>;
  oracleDays?: Record<string, number>;
}

interface CrmLight {
  id?: string;
  company?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  website?: string;
  instagram?: string;
  address?: string;
  industry?: string;
  notes?: string;
  source?: string;
  priority?: string;
  stage?: string;
  google_place_id?: string | null;
  google_maps_url?: string | null;
  created_at?: string;
  updated_at?: string;
  log?: LeadLog[];
  oracleDraft?: string;
  [key: string]: unknown;
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

function emptyVerified() {
  return {
    phone: false,
    website: false,
    email: false,
    address: false,
    ownerName: false,
    socials: false,
    photo: false,
  };
}

export function normalizeStage(value: string | undefined): Stage {
  if (!value) return 'New';
  if ((STAGES as string[]).includes(value)) return value as Stage;
  return LEGACY_STAGE[value.trim().toLowerCase()] || 'New';
}

export function isPipelineOwner(user: BoardUser | DirectoryUser | string): boolean {
  if (typeof user === 'string') return false;
  const owner = String(process.env.DIRECTORY_PIPELINE_OWNER || '').trim().toLowerCase();
  if (!owner) return false;
  const email = String(user.email || '').trim().toLowerCase();
  const id = String(user.id || '').trim().toLowerCase();
  const local = email.split('@')[0] || '';
  return email === owner || id === owner || local === owner;
}

function userIdOf(user: BoardUser | string): string {
  return typeof user === 'string' ? user : user.id;
}

function clip(value: unknown, max: number): string {
  return String(value || '').trim().slice(0, max);
}

const SHOP_CATEGORIES: ShopCategory[] = [
  'dental',
  'salon',
  'food',
  'barber',
  'legal',
  'accounting',
  'auto',
  'fitness',
  'wellness',
  'trades',
  'other',
];

function asCategory(value: unknown): ShopCategory {
  const raw = String(value || '').trim().toLowerCase();
  return SHOP_CATEGORIES.includes(raw as ShopCategory) ? (raw as ShopCategory) : 'other';
}

function listingPhotoSrc(placeId?: string, photo?: string): string | undefined {
  if (placeId && !String(placeId).startsWith('osm:')) {
    return `/api/photo?placeId=${encodeURIComponent(placeId)}`;
  }
  const src = clip(photo, 220);
  return src || undefined;
}

function toTiny(lead: Lead | StoredLead): StoredLead {
  const tiny: StoredLead = {
    slug: lead.slug,
    stage: normalizeStage(lead.stage),
    addedAt: lead.addedAt,
    updatedAt: lead.updatedAt,
  };
  if (lead.placeId) tiny.placeId = lead.placeId;
  if (lead.oracleDraft) tiny.oracleDraft = lead.oracleDraft;
  if (lead.note) tiny.note = lead.note;
  if (Array.isArray(lead.log) && lead.log.length) tiny.log = lead.log;
  const byPlace = findShopByPlaceId(lead.placeId);
  const catalogued = byPlace || (!lead.placeId ? findShop(lead.slug) : undefined);
  if (!catalogued) {
    const full = lead as Lead;
    const name = clip(full.name || lead.name, 80);
    const category = clip(full.category || lead.category, 24);
    const city = clip(full.city || lead.city, 40);
    const region = clip(full.region || lead.region, 8);
    const address = clip(full.address || lead.address, 80);
    const phone = clip(full.phone || lead.phone, 32);
    const website = clip(full.website || lead.website, 80);
    const email = clip(full.email || lead.email, 80);
    const ownerName = clip(full.ownerName || lead.ownerName, 60);
    const mapsUrl = clip(full.mapsUrl || lead.mapsUrl, 160);
    const photo = listingPhotoSrc(lead.placeId, full.photo || lead.photo);
    if (name) tiny.name = name;
    if (category) tiny.category = category;
    if (city) tiny.city = city;
    if (region) tiny.region = region;
    if (address) tiny.address = address;
    if (phone) tiny.phone = phone;
    if (website) tiny.website = website;
    if (email) tiny.email = email;
    if (ownerName) tiny.ownerName = ownerName;
    if (mapsUrl) tiny.mapsUrl = mapsUrl;
    if (photo && (!lead.placeId || String(lead.placeId).startsWith('osm:'))) tiny.photo = photo;
  }
  return tiny;
}

let catalogCache: Shop[] | null = null;

function readCityShards(): Shop[] {
  const found: Shop[] = [];
  const dirs = [
    path.join(process.cwd(), 'src/data/cities'),
    path.join(process.cwd(), '../src/data/cities'),
  ];
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json')) continue;
        const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as { shops?: Shop[] };
        if (Array.isArray(raw.shops)) found.push(...raw.shops);
      }
    } catch {
      // Catalog shards are optional on the function bundle. Seed still works.
    }
  }
  return found;
}

export function catalogShops(): Shop[] {
  if (catalogCache) return catalogCache;
  const merged = new Map<string, Shop>();
  const add = (shop: Shop) => {
    const key = shopDedupeKey(shop);
    if (!merged.has(key)) merged.set(key, shop);
  };
  for (const shop of seedShops()) add(shop);
  for (const shop of readCityShards()) add(shop);
  catalogCache = [...merged.values()];
  return catalogCache;
}

export function findShop(slug: string): Shop | undefined {
  const needle = String(slug || '').trim().toLowerCase();
  if (!needle) return undefined;
  return catalogShops().find((shop) => shop.slug.toLowerCase() === needle);
}

export function findShopByPlaceId(placeId?: string | null): Shop | undefined {
  const needle = String(placeId || '').trim();
  if (!needle) return undefined;
  return catalogShops().find((shop) => shop.placeId === needle);
}

function cityFromAddress(address?: string): string {
  if (!address) return '';
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[1];
  return '';
}

function hydrateFromShop(record: StoredLead, shop?: Shop): Lead {
  const stage = normalizeStage(record.stage);
  if (!shop) {
    return hydrateFromSnapshot(record);
  }
  return {
    ...toTiny({ ...record, stage, placeId: record.placeId || shop.placeId }),
    catalogSlug: shop.slug,
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
    photo: shop.verified.photo ? shop.photo : listingPhotoSrc(shop.placeId, shop.photo),
    mapsUrl: shop.mapsUrl,
    verified: { ...shop.verified, photo: Boolean((shop.verified.photo && shop.photo) || listingPhotoSrc(shop.placeId)) },
  };
}

function hydrateFromSnapshot(record: StoredLead): Lead {
  const stage = normalizeStage(record.stage);
  const category = asCategory(record.category);
  const photo = listingPhotoSrc(record.placeId, record.photo);
  return {
    ...toTiny({ ...record, stage }),
    name: clip(record.name, 80) || record.slug,
    type: typeLabel(category),
    category,
    city: clip(record.city, 40),
    region: clip(record.region, 8) || undefined,
    address: clip(record.address, 80) || undefined,
    phone: clip(record.phone, 32) || undefined,
    website: clip(record.website, 80) || undefined,
    email: clip(record.email, 80) || undefined,
    ownerName: clip(record.ownerName, 60) || undefined,
    photo,
    mapsUrl: clip(record.mapsUrl, 160) || undefined,
    verified: {
      phone: Boolean(record.phone),
      website: Boolean(record.website),
      email: Boolean(record.email),
      address: Boolean(record.address),
      ownerName: Boolean(record.ownerName),
      socials: false,
      photo: Boolean(photo),
    },
  };
}

function hydrateStored(record: StoredLead): Lead {
  const byPlace = findShopByPlaceId(record.placeId);
  if (byPlace) return hydrateFromShop(record, byPlace);
  if (record.name) return hydrateFromSnapshot(record);
  const bySlug = findShop(record.slug);
  return hydrateFromShop(record, bySlug);
}

function stripHeavy(raw: CrmLight): CrmLight {
  const light = { ...raw };
  for (const field of HEAVY_FIELDS) delete light[field];
  return light;
}

function crmToLead(raw: CrmLight): Lead | null {
  const light = stripHeavy(raw);
  const crmStage = String(light.stage || '');
  if (crmStage.trim().toLowerCase() === 'lost') return null;
  const shop = findShopByPlaceId(light.google_place_id) || findShop(String(light.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  const stage = normalizeStage(crmStage);
  const addedAt = String(light.created_at || new Date().toISOString());
  const updatedAt = String(light.updated_at || addedAt);
  const log: LeadLog[] = Array.isArray(light.log) ? light.log : [];
  const note = String(light.notes || '').trim();
  if (note && !log.some((entry) => entry.type === 'note' && entry.text === note)) {
    log.push({ at: updatedAt, type: 'note', text: note });
  }
  const record: StoredLead = {
    slug: String(light.id || shop?.slug || 'lead'),
    placeId: light.google_place_id || shop?.placeId || undefined,
    stage,
    addedAt,
    updatedAt,
    oracleDraft: light.oracleDraft,
    note: note || undefined,
    log,
    name: String(light.company || shop?.name || ''),
    category: String(light.industry || shop?.category || ''),
    city: cityFromAddress(String(light.address || shop?.address || '')),
    address: light.address ? String(light.address) : shop?.address,
    phone: light.phone ? String(light.phone) : shop?.phone,
    website: light.website ? String(light.website) : shop?.website,
    email: light.email ? String(light.email) : shop?.email,
    ownerName: light.contact_name ? String(light.contact_name) : shop?.ownerName,
    mapsUrl: light.google_maps_url ? String(light.google_maps_url) : shop?.mapsUrl,
  };
  const lead = shop ? hydrateFromShop(record, shop) : hydrateFromSnapshot(record);
  if (!shop) {
    lead.name = String(light.company || record.slug);
    lead.type = String(light.industry || '');
    lead.city = cityFromAddress(String(light.address || ''));
    lead.address = light.address ? String(light.address) : undefined;
    lead.phone = light.phone ? String(light.phone) : undefined;
    lead.website = light.website ? String(light.website) : undefined;
    lead.email = light.email ? String(light.email) : undefined;
    lead.ownerName = light.contact_name ? String(light.contact_name) : undefined;
    lead.socials = light.instagram ? { instagram: String(light.instagram) } : undefined;
    lead.verified = {
      phone: Boolean(light.phone),
      website: Boolean(light.website),
      email: Boolean(light.email),
      address: Boolean(light.address),
      ownerName: Boolean(light.contact_name),
      socials: Boolean(light.instagram),
      photo: false,
    };
  }
  return lead;
}

function newCrmId(): string {
  return `lead_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function leadToCrmLight(lead: Lead, existing?: CrmLight): CrmLight {
  const base = stripHeavy(existing || {});
  const shop = findShop(lead.catalogSlug || lead.slug) || findShopByPlaceId(lead.placeId);
  const now = lead.updatedAt || new Date().toISOString();
  return {
    ...base,
    id: existing?.id || (lead.slug.startsWith('lead_') ? lead.slug : newCrmId()),
    company: existing?.company || lead.name || shop?.name || lead.slug,
    contact_name: existing?.contact_name || lead.ownerName || '',
    email: existing?.email || lead.email || '',
    phone: existing?.phone || lead.phone || '',
    website: existing?.website || lead.website || '',
    instagram: existing?.instagram || lead.socials?.instagram || '',
    address: existing?.address || lead.address || '',
    industry: existing?.industry || lead.type || '',
    notes: existing?.notes || lead.note || '',
    source: existing?.source || 'directory',
    priority: existing?.priority || 'Cool',
    stage: lead.stage,
    google_place_id: existing?.google_place_id || lead.placeId || shop?.placeId || null,
    created_at: existing?.created_at || lead.addedAt || now,
    updated_at: now,
    log: lead.log,
    oracleDraft: lead.oracleDraft,
  };
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

async function loadOwnerBoard(): Promise<BoardState> {
  const { fetchCrmLeads } = await import('./crm-sync.js');
  const remote = await fetchCrmLeads();
  const storage = await getStorage();
  const raw = (remote || (await storage.get<CrmLight[] | null>(CRM_LEADS_KEY)) || []) as CrmLight[];
  const rows = Array.isArray(raw) ? raw : [];
  const leads = rows.map(crmToLead).filter((lead): lead is Lead => Boolean(lead));
  return { leads, lastScanByCity: {}, oracleDays: {} };
}

async function saveOwnerBoard(board: BoardState): Promise<void> {
  const storage = await getStorage();
  const existing = ((await storage.get<CrmLight[] | null>(CRM_LEADS_KEY)) || []) as CrmLight[];
  const rows = Array.isArray(existing) ? existing.map(stripHeavy) : [];
  const byId = new Map(rows.map((row) => [String(row.id || ''), row]));
  const byPlace = new Map(
    rows.filter((row) => row.google_place_id).map((row) => [String(row.google_place_id), row]),
  );
  for (const lead of board.leads) {
    const current = byId.get(lead.slug) || (lead.placeId ? byPlace.get(lead.placeId) : undefined);
    if (current) {
      current.stage = lead.stage;
      current.updated_at = lead.updatedAt;
      if (lead.log) current.log = lead.log;
      if (lead.oracleDraft) current.oracleDraft = lead.oracleDraft;
      if (lead.note) current.notes = lead.note;
      if (lead.placeId && !current.google_place_id) current.google_place_id = lead.placeId;
      if (lead.phone && !current.phone) current.phone = lead.phone;
      if (lead.website && !current.website) current.website = lead.website;
      if (lead.address && !current.address) current.address = lead.address;
      continue;
    }
    const created = leadToCrmLight(lead);
    rows.unshift(created);
    byId.set(String(created.id || created.company), created);
    if (created.google_place_id) byPlace.set(String(created.google_place_id), created);
  }
  await storage.set(CRM_LEADS_KEY, rows);
}

export function hydrateBoard(stored: StoredBoard | BoardState | null | undefined): BoardState {
  if (!stored || !Array.isArray(stored.leads)) return emptyBoard();
  return {
    leads: stored.leads.map((lead) => hydrateStored(toTiny(lead as Lead))),
    lastScanByCity: stored.lastScanByCity || {},
    oracleDays: stored.oracleDays || {},
  };
}

export function storedBoardOf(board: BoardState): StoredBoard {
  return {
    leads: board.leads.map(toTiny),
    lastScanByCity: board.lastScanByCity || {},
    oracleDays: board.oracleDays || {},
  };
}

async function loadMemberBoard(userId: string): Promise<BoardState> {
  const storage = await getStorage();
  const board = await storage.get<StoredBoard | BoardState>(leadsKey(userId));
  return hydrateBoard(board);
}

async function saveMemberBoard(userId: string, board: BoardState): Promise<void> {
  const storage = await getStorage();
  const stored: StoredBoard = {
    leads: board.leads.map(toTiny),
    lastScanByCity: board.lastScanByCity || {},
    oracleDays: board.oracleDays || {},
  };
  await storage.set(leadsKey(userId), stored);
}

export async function loadBoard(user: BoardUser | string): Promise<BoardState> {
  return loadMemberBoard(userIdOf(user));
}

export async function saveBoard(user: BoardUser | string, board: BoardState): Promise<void> {
  await saveMemberBoard(userIdOf(user), board);
}

export async function upsertCrmMaster(shops: Shop[]): Promise<void> {
  if (!shops.length) return;
  const storage = await getStorage();
  const existing = ((await storage.get<CrmLight[] | null>(CRM_LEADS_KEY)) || []) as CrmLight[];
  const rows = Array.isArray(existing) ? existing.map(stripHeavy) : [];
  const byPlace = new Map(
    rows.filter((row) => row.google_place_id).map((row) => [String(row.google_place_id), row]),
  );
  let changed = false;
  for (const shop of shops) {
    if (shop.placeId && byPlace.has(shop.placeId)) continue;
    const created = leadToCrmLight(shopToLead(shop));
    rows.unshift(created);
    if (created.google_place_id) byPlace.set(String(created.google_place_id), created);
    changed = true;
  }
  if (changed) await storage.set(CRM_LEADS_KEY, rows);
}

export function torontoDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function capFor(plan: Plan, owner = false): number {
  if (owner) return Number.MAX_SAFE_INTEGER;
  return plan === 'paid' ? PAID_CAP : FREE_CAP;
}

export function leadKey(lead: Lead | StoredLead): string {
  return shopDedupeKey({
    placeId: lead.placeId,
    slug: (lead as Lead).catalogSlug || lead.slug,
    name: (lead as Lead).name || lead.slug,
    address: (lead as Lead).address,
    city: (lead as Lead).city,
  });
}

export function hasLead(board: BoardState, shop: { placeId?: string; slug?: string; name: string; address?: string; city?: string }): boolean {
  const key = shopDedupeKey(shop);
  return board.leads.some((lead) => leadKey(lead) === key || lead.slug === shop.slug || lead.catalogSlug === shop.slug);
}

function pushLog(lead: Lead, entry: LeadLog): Lead {
  return { ...lead, log: [...(lead.log || []), entry] };
}

export function shopToLead(shop: Shop, stage: Stage = 'New'): Lead {
  const now = new Date().toISOString();
  return hydrateFromShop({
    slug: shop.slug,
    placeId: shop.placeId,
    stage,
    addedAt: now,
    updatedAt: now,
    log: [{ at: now, type: 'added', to: stage }],
  }, shop);
}

export interface ListingInput {
  slug?: string;
  placeId?: string;
  name?: string;
  category?: string;
  city?: string;
  region?: string;
  country?: string;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  ownerName?: string;
  photo?: string;
  mapsUrl?: string;
  instagram?: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
}

export function shopFromListing(input: ListingInput | string | null | undefined): Shop | undefined {
  const raw = typeof input === 'string' ? { slug: input } : (input || {});
  const byPlace = findShopByPlaceId(raw.placeId);
  if (byPlace) return byPlace;
  const name = clip(raw.name, 120);
  const livePlace = clip(raw.placeId, 128);
  if (!(livePlace && name)) {
    const bySlug = findShop(raw.slug || '');
    if (bySlug) return bySlug;
    if (!name) return undefined;
  }
  const city = clip(raw.city, 60) || 'Local';
  const slug = slugify(raw.slug || '') || `${slugify(name)}-${slugify(city)}`;
  const placeId = clip(raw.placeId, 128) || undefined;
  const address = clip(raw.address, 120) || undefined;
  const phone = clip(raw.phone, 40) || undefined;
  const website = clip(raw.website, 160) || undefined;
  const email = clip(raw.email, 80) || undefined;
  const ownerName = clip(raw.ownerName, 80) || undefined;
  const instagram = clip(raw.instagram, 80) || undefined;
  const mapsUrl = clip(raw.mapsUrl, 220) || undefined;
  const photo = listingPhotoSrc(placeId, raw.photo);
  const category = asCategory(raw.category);
  const region = clip(raw.region, 8) || '';
  const country = clip(raw.country, 2).toUpperCase() || 'CA';
  return {
    name,
    slug,
    city,
    region,
    country,
    address,
    phone,
    website,
    email,
    ownerName,
    socials: instagram ? { instagram } : undefined,
    photo,
    placeId,
    mapsUrl,
    category,
    verified: {
      phone: Boolean(phone),
      website: Boolean(website),
      email: Boolean(email),
      address: Boolean(address),
      ownerName: Boolean(ownerName),
      socials: Boolean(instagram),
      photo: Boolean(photo),
    },
  };
}

export async function addShop(
  board: BoardState,
  listing: ListingInput | string,
  plan: Plan,
  owner = false,
): Promise<{ board: BoardState; added: boolean; reason?: string }> {
  const shop = shopFromListing(listing);
  if (!shop) return { board, added: false, reason: 'missing' };
  if (hasLead(board, shop)) return { board, added: false, reason: 'on-board' };
  if (board.leads.length >= capFor(plan, owner)) {
    return { board, added: false, reason: 'cap' };
  }
  board.leads.push(shopToLead(shop));
  return { board, added: true };
}

export function moveLead(board: BoardState, slug: string, stage: Stage): BoardState {
  const now = new Date().toISOString();
  const next = normalizeStage(stage);
  board.leads = board.leads.map((lead) => {
    if (lead.slug !== slug && lead.catalogSlug !== slug) return lead;
    const from = normalizeStage(lead.stage);
    if (from === next) return lead;
    return pushLog({ ...lead, stage: next, updatedAt: now }, { at: now, type: 'stage', from, to: next });
  });
  return board;
}

function scannedToday(board: BoardState, city: string): boolean {
  const stamp = board.lastScanByCity?.[city];
  return Boolean(stamp && torontoDate(new Date(stamp)) === torontoDate());
}

export async function scanCity(
  board: BoardState,
  city: string,
  plan: Plan,
  owner = false,
  extra: { region?: string; country?: string; category?: string } = {},
): Promise<{
  board: BoardState;
  added: number;
  skipped: number;
  reason?: string;
  source: 'places' | 'listings' | 'seed';
  imported: Shop[];
}> {
  if (plan !== 'paid') return { board, added: 0, skipped: 0, reason: 'paid', source: 'seed', imported: [] };
  const cityKey = city.trim();
  if (!cityKey || cityKey.toLowerCase() === 'all' || /[,|/]/.test(cityKey)) {
    return { board, added: 0, skipped: 0, reason: 'city-required', source: 'seed', imported: [] };
  }
  const category = String(extra.category || '').trim().toLowerCase();
  const stampKey = `${cityKey.toLowerCase()}:${category || 'all'}`;
  if (scannedToday(board, stampKey)) {
    return { board, added: 0, skipped: 0, reason: 'scan-wait', source: 'seed', imported: [] };
  }
  const live = await listCityShops(cityKey, extra.region || '', extra.country || '', category);
  const imported: Shop[] = [];
  let added = 0;
  let skipped = 0;
  for (const shop of live.shops) {
    if (board.leads.length >= capFor(plan, owner)) break;
    if (hasLead(board, shop)) {
      skipped += 1;
      continue;
    }
    board.leads.push(shopToLead(shop));
    imported.push(shop);
    added += 1;
  }
  board.lastScanByCity = { ...(board.lastScanByCity || {}), [stampKey]: new Date().toISOString() };
  return { board, added, skipped, source: live.source, imported };
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
      .filter((lead) => normalizeStage(lead.stage) === 'New')
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt))[0] ||
    board.leads
      .filter((lead) => normalizeStage(lead.stage) === 'Contacted')
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

  const stage = normalizeStage(next.stage);
  let stageHint = 'Stay with this card until you reach out.';
  if (stage === 'New' && (next.phone || next.email)) {
    stageHint = 'Move to Contacted when you reach out.';
  } else if (stage === 'Contacted') {
    stageHint = 'Move to Responded if they wrote back.';
  } else if (stage === 'Responded') {
    stageHint = 'Move to Meeting Scheduled if you have a meeting.';
  } else if (stage === 'Meeting Scheduled') {
    stageHint = 'Move to Proposal Sent when the proposal is ready.';
  } else if (stage === 'Proposal Sent') {
    stageHint = 'Move to Won if they say yes.';
  } else if (stage === 'Won') {
    stageHint = 'This one is won.';
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

export function usage(board: BoardState, plan: Plan, owner = false) {
  const day = torontoDate();
  const scanStamp = board.lastScanByCity?.milton || Object.values(board.lastScanByCity || {})[0];
  const scanned = Boolean(scanStamp && torontoDate(new Date(scanStamp)) === day);
  const oracleUsed = board.oracleDays?.[day] || 0;
  return {
    plan,
    leadCount: board.leads.length,
    leadCap: capFor(plan, owner),
    price: PRICE,
    scan: {
      allowed: plan === 'paid' && !scanned,
      message: plan !== 'paid'
        ? `Scan is on Paid Directory at ${PRICE}.`
        : scanned
          ? 'Scan can run again after 8am.'
          : 'Scan can fill shops from the Directory index that are not already on the board.',
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
