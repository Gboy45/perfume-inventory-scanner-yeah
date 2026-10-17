import { LookupProductResult } from '../types';

const LOOKUP_TIMEOUT_MS = 6000;

async function fetchJson(url: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // offline, blocked, timed out, or not JSON
  } finally {
    clearTimeout(timer);
  }
}

interface RawProduct {
  name?: string;
  brand?: string;
  quantity?: string;
}

function readOpenFacts(j: any): RawProduct | null {
  if (j && j.status === 1 && j.product) {
    const p = j.product;
    const name = p.product_name || p.generic_name || '';
    const brand = String(p.brands || '').split(',')[0].trim();
    if (name || brand) return { name, brand, quantity: p.quantity || '' };
  }
  return null;
}

const OF_FIELDS = 'fields=product_name,generic_name,brands,quantity';
const LOOKUP_SOURCES = [
  {
    name: 'Open Beauty Facts',
    url: (c: string) => `https://world.openbeautyfacts.org/api/v2/product/${c}.json?${OF_FIELDS}`,
    read: readOpenFacts
  },
  {
    name: 'Open Food Facts',
    url: (c: string) => `https://world.openfoodfacts.org/api/v2/product/${c}.json?${OF_FIELDS}`,
    read: readOpenFacts
  },
  {
    name: 'Open Products Facts',
    url: (c: string) => `https://world.openproductsfacts.org/api/v2/product/${c}.json?${OF_FIELDS}`,
    read: readOpenFacts
  },
  {
    name: 'UPCitemdb',
    url: (c: string) => `https://api.upcitemdb.com/prod/trial/lookup?upc=${c}`,
    read: (j: any): RawProduct | null => {
      if (j && Array.isArray(j.items) && j.items.length) {
        const it = j.items[0];
        return { name: it.title || '', brand: it.brand || '', quantity: it.size || '' };
      }
      return null;
    }
  }
];

function firstResult<T>(promises: Promise<T | null>[]): Promise<T | null> {
  return new Promise(resolve => {
    let pending = promises.length;
    if (!pending) return resolve(null);
    promises.forEach(p => {
      p.then(r => {
        if (r) resolve(r);
        else if (--pending === 0) resolve(null);
      }).catch(() => {
        if (--pending === 0) resolve(null);
      });
    });
  });
}

function parseProductDetails(raw: RawProduct) {
  const text = `${raw.name || ''} ${raw.quantity || ''}`;
  const lower = text.toLowerCase();
  const out: { name?: string; brand?: string; size?: number; type?: string; gender?: string } = {};

  // Size -> mL
  const sizeRe = /(\d+(?:[.,]\d+)?)\s*(ml|cl|fl\.?\s?oz|oz)\b/i;
  const sm = text.match(sizeRe);
  if (sm) {
    let n = parseFloat(sm[1].replace(',', '.'));
    const unit = sm[2].toLowerCase().replace(/[\s.]/g, '');
    if (unit === 'cl') n *= 10;
    else if (unit === 'oz' || unit === 'floz') n *= 29.5735;
    if (n > 0) out.size = Math.round(n);
  }

  // Type
  if (/eau de parfum|\bedp\b/.test(lower)) out.type = 'Eau de Parfum';
  else if (/eau de toilette|\bedt\b/.test(lower)) out.type = 'Eau de Toilette';
  else if (/eau fra[iî]che/.test(lower)) out.type = 'Eau Fraiche';
  else if (/cologne|\bedc\b/.test(lower)) out.type = 'Cologne';
  else if (/\boil\b/.test(lower)) out.type = 'Perfume Oil';

  // Gender ("women" is checked before "men" because it contains it)
  if (/\bunisex\b/.test(lower)) out.gender = 'Unisex';
  else if (/\b(women|woman|femme|for her|pour elle|ladies)\b/.test(lower)) out.gender = 'For Women';
  else if (/\b(men|man|homme|for him|pour lui)\b/.test(lower)) out.gender = 'For Men';

  // Name: drop size text, keep letters only
  let name = String(raw.name || '').replace(sizeRe, ' ');
  name = name.replace(/[^A-Za-z\u00C0-\u017F .'-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (name) out.name = name;

  const brand = String(raw.brand || '').replace(/\s+/g, ' ').trim();
  if (brand) out.brand = brand;

  return out;
}

export async function lookupProduct(code: string): Promise<LookupProductResult | null> {
  const c = encodeURIComponent(String(code).trim());
  const tasks = LOOKUP_SOURCES.map(async src => {
    try {
      const json = await fetchJson(src.url(c));
      const raw = json ? src.read(json) : null;
      return raw ? { source: src.name, raw } : null;
    } catch {
      return null;
    }
  });

  const hit = await firstResult(tasks);
  if (!hit) return null;

  const fields = parseProductDetails(hit.raw);
  return Object.keys(fields).length ? { source: hit.source, fields } : null;
}
