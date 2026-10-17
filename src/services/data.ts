import { PerfumeItem, SaleRecord, AccountRecord, PersonnelRecord } from '../types';

const STORAGE_KEY = 'perfume-inventory:items';
const SALES_STORAGE_KEY = 'perfume-inventory:sales';
const ACCOUNT_KEY = 'perfume-inventory:account';
const SESSION_KEY = 'perfume-inventory:session';
const PERSONNEL_SESSION_KEY = 'perfume-inventory:personnel-session';
const PERSONNEL_KEY = 'perfume-inventory:personnel';
const PIN_KEY = 'perfume-inventory:delete-pin';
const DEFAULT_PIN = '1234';

export const BARCODE_MAX_LENGTH = 13; // standard EAN-13 length
export const MAX_PURCHASE_AMOUNT = 500000; // ₱500,000 ceiling per purchase entry
export const NAME_PATTERN = /^[A-Za-z\u00C0-\u017F .'-]+$/;

export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2);
}

export function isValidNameInput(value: string): boolean {
  const str = String(value || '');
  if (!str.trim()) return true;
  return NAME_PATTERN.test(str);
}

export function barcodeExceedsLimit(value: string): boolean {
  return String(value || '').replace(/\s/g, '').length > BARCODE_MAX_LENGTH;
}

function dateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export const SEED_ITEMS: PerfumeItem[] = [
  { id: uid(), name: 'Chanel Chance', brand: 'Chanel', type: 'Eau de Parfum', gender: 'For Women', size: 100, stock: 15, price: 89.99, location: 'Shelf A - Row 2', barcode: '3145891265478' },
  { id: uid(), name: 'Dior Sauvage', brand: 'Dior', type: 'Eau de Toilette', gender: 'For Men', size: 100, stock: 20, price: 74.50, location: 'Shelf A - Row 3', barcode: '3348901250158' },
  { id: uid(), name: 'Versace Dylan Blue', brand: 'Versace', type: 'Eau de Toilette', gender: 'For Men', size: 100, stock: 18, price: 92.00, location: 'Shelf B - Row 1', barcode: '8011003835521' },
  { id: uid(), name: 'YSL Libre', brand: 'YSL', type: 'Eau de Parfum', gender: 'For Women', size: 90, stock: 12, price: 65.00, location: 'Shelf B - Row 2', barcode: '3614272562481' },
  { id: uid(), name: 'Bleu de Chanel', brand: 'Chanel', type: 'Eau de Parfum', gender: 'For Men', size: 150, stock: 4, price: 120.00, location: 'Shelf A - Row 4', barcode: '3145891267229' },
  { id: uid(), name: 'Tom Ford Oud Wood', brand: 'Tom Ford', type: 'Eau de Parfum', gender: 'Unisex', size: 50, stock: 6, price: 145.00, location: 'Shelf C - Row 1', barcode: '888066000000' },
  { id: uid(), name: 'Ariana Grande Cloud', brand: 'Ariana Grande', type: 'Eau de Parfum', gender: 'For Women', size: 100, stock: 10, price: 48.00, location: 'Shelf C - Row 2', barcode: '812256022345' },
  { id: uid(), name: 'Paco Rabanne One Million', brand: 'Paco Rabanne', type: 'Eau de Toilette', gender: 'For Men', size: 100, stock: 2, price: 82.00, location: 'Shelf C - Row 3', barcode: '3349668529513' }
];

export const SEED_SALES: SaleRecord[] = [
  { id: uid(), name: 'Walk-in Customer', date: dateOffset(0), amount: 89.99, note: 'Chanel Chance' },
  { id: uid(), name: 'Walk-in Customer', date: dateOffset(0), amount: 74.50, note: 'Dior Sauvage' },
  { id: uid(), name: 'Maria Santos', date: dateOffset(1), amount: 120.00, note: 'Bleu de Chanel' },
  { id: uid(), name: 'Walk-in Customer', date: dateOffset(2), amount: 65.00, note: 'YSL Libre' },
  { id: uid(), name: 'Jon Reyes', date: dateOffset(2), amount: 92.00, note: 'Versace Dylan Blue' }
];

function readStorage<T>(key: string): T | null {
  try {
    const val = localStorage.getItem(key);
    return val ? (JSON.parse(val) as T) : null;
  } catch (err) {
    console.error('Failed to read from localStorage', err);
    return null;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Failed to write to localStorage', err);
  }
}

export const InventoryAPI = {
  hasStorage: typeof localStorage !== 'undefined',

  async list(): Promise<PerfumeItem[]> {
    let items = readStorage<PerfumeItem[]>(STORAGE_KEY);
    if (!items || !items.length) {
      items = SEED_ITEMS.map(item => ({ ...item }));
      writeStorage(STORAGE_KEY, items);
    } else {
      const migratedItems = items.map(item => ({
        ...item,
        price: Number(item.price || 0)
      }));
      if (JSON.stringify(items) !== JSON.stringify(migratedItems)) {
        items = migratedItems;
        writeStorage(STORAGE_KEY, items);
      }
    }
    return items;
  },

  async get(id: string): Promise<PerfumeItem | null> {
    const items = await this.list();
    return items.find(item => item.id === id) || null;
  },

  async getByBarcode(code: string): Promise<PerfumeItem | null> {
    const cleanCode = String(code || '').trim();
    const items = await this.list();
    return items.find(item => String(item.barcode).trim() === cleanCode) || null;
  },

  async create(item: Omit<PerfumeItem, 'id'>): Promise<PerfumeItem> {
    const items = await this.list();
    const record: PerfumeItem = {
      id: uid(),
      ...item,
      price: Number(item.price || 0)
    };
    items.push(record);
    writeStorage(STORAGE_KEY, items);
    return record;
  },

  async update(id: string, patch: Partial<PerfumeItem>): Promise<PerfumeItem | null> {
    const items = await this.list();
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return null;

    items[index] = {
      ...items[index],
      ...patch,
      ...(patch.price !== undefined ? { price: Number(patch.price || 0) } : {})
    };
    writeStorage(STORAGE_KEY, items);
    return items[index];
  },

  async remove(id: string): Promise<void> {
    const items = await this.list();
    writeStorage(STORAGE_KEY, items.filter(item => item.id !== id));
  },

  async reset(): Promise<PerfumeItem[]> {
    const items = SEED_ITEMS.map(item => ({ ...item, id: uid() }));
    writeStorage(STORAGE_KEY, items);
    return items;
  }
};

export const SalesAPI = {
  async list(): Promise<SaleRecord[]> {
    let sales = readStorage<SaleRecord[]>(SALES_STORAGE_KEY);
    if (!sales) {
      sales = SEED_SALES.map(sale => ({ ...sale }));
      writeStorage(SALES_STORAGE_KEY, sales);
    }
    return sales;
  },

  async create(sale: { name?: string; date: string; amount: number | string; note?: string }): Promise<SaleRecord> {
    const sales = await this.list();
    const record: SaleRecord = {
      id: uid(),
      name: sale.name || 'Walk-in Customer',
      date: sale.date,
      amount: Math.min(Number(sale.amount) || 0, MAX_PURCHASE_AMOUNT),
      note: sale.note || ''
    };
    sales.push(record);
    writeStorage(SALES_STORAGE_KEY, sales);
    return record;
  },

  async remove(id: string): Promise<void> {
    const sales = await this.list();
    writeStorage(SALES_STORAGE_KEY, sales.filter(s => s.id !== id));
  },

  async reset(): Promise<SaleRecord[]> {
    const sales = SEED_SALES.map(sale => ({ ...sale, id: uid() }));
    writeStorage(SALES_STORAGE_KEY, sales);
    return sales;
  }
};

export function computeStats(items: PerfumeItem[]) {
  const totalItems = items.reduce((sum, item) => sum + Number(item.stock || 0), 0);
  const inventoryValue = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.stock || 0),
    0
  );
  const bySize: Record<number, number> = {};

  items.forEach(item => {
    const size = Number(item.size || 0);
    bySize[size] = (bySize[size] || 0) + Number(item.stock || 0);
  });

  const sizeBreakdown = Object.keys(bySize)
    .map(Number)
    .sort((a, b) => a - b)
    .map(size => {
      const count = bySize[size];
      const pct = totalItems > 0 ? Math.round((count / totalItems) * 100) : 0;
      return { size, count, pct };
    });

  const depletedCount = items.filter(i => Number(i.stock || 0) <= 0).length;
  const lowStockCount = items.filter(
    i => Number(i.stock || 0) > 0 && Number(i.stock || 0) <= 5
  ).length;
  const lowStockItems = items.filter(i => Number(i.stock || 0) <= 5);

  return {
    totalItems,
    skus: items.length,
    inventoryValue,
    depletedCount,
    lowStockCount,
    lowStockItems,
    sizeBreakdown
  };
}

export function statusForStock(stock: number | string) {
  const s = Number(stock);
  if (s <= 0) return { label: 'Out of Stock', cls: 'danger' };
  if (s <= 5) return { label: 'Low Stock', cls: 'warn' };
  return { label: 'In Stock', cls: 'success' };
}

export const AccountAPI = {
  async current(): Promise<AccountRecord | null> {
    const session = readStorage<{ username: string }>(SESSION_KEY);
    if (!session) return null;
    const account = readStorage<AccountRecord>(ACCOUNT_KEY);
    return account && account.username.toLowerCase() === session.username.toLowerCase() ? account : null;
  },

  async hasAccount(): Promise<boolean> {
    const account = readStorage<AccountRecord>(ACCOUNT_KEY);
    return !!account;
  },

  async register(usernameInput: string, passwordInput: string): Promise<{ ok: boolean; error?: string; account?: AccountRecord }> {
    const username = String(usernameInput || '').trim();
    if (!username || !passwordInput) {
      return { ok: false, error: 'Username and password are required.' };
    }
    const record: AccountRecord = { username, password: passwordInput, createdAt: new Date().toISOString() };
    writeStorage(ACCOUNT_KEY, record);
    writeStorage(SESSION_KEY, { username });
    writeStorage(PERSONNEL_SESSION_KEY, null);
    return { ok: true, account: record };
  },

  async login(usernameInput: string, passwordInput: string): Promise<{ ok: boolean; error?: string; account?: AccountRecord }> {
    const username = String(usernameInput || '').trim();
    let account = readStorage<AccountRecord>(ACCOUNT_KEY);
    
    // Auto-seed default director account if none exists yet
    if (!account && username.toLowerCase() === 'director' && passwordInput === 'aura123') {
      account = { username: 'director', password: 'aura123', createdAt: new Date().toISOString() };
      writeStorage(ACCOUNT_KEY, account);
    }

    if (!account || account.username.toLowerCase() !== username.toLowerCase() || account.password !== passwordInput) {
      return { ok: false, error: 'Incorrect username or password.' };
    }
    writeStorage(SESSION_KEY, { username: account.username });
    writeStorage(PERSONNEL_SESSION_KEY, null);
    return { ok: true, account };
  },

  async logout(): Promise<void> {
    writeStorage(SESSION_KEY, null);
  }
};

export const SecurityAPI = {
  async getPin(): Promise<string> {
    const stored = readStorage<{ pin: string }>(PIN_KEY);
    return stored && stored.pin ? stored.pin : DEFAULT_PIN;
  },

  async setPin(newPinInput: string): Promise<{ ok: boolean; error?: string }> {
    const newPin = String(newPinInput || '').trim();
    if (!/^\d{4,8}$/.test(newPin)) {
      return { ok: false, error: 'PIN must be 4-8 digits.' };
    }
    writeStorage(PIN_KEY, { pin: newPin });
    return { ok: true };
  },

  async verifyPin(candidate: string): Promise<boolean> {
    const pin = await this.getPin();
    return String(candidate || '').trim() === pin;
  },

  async hasCustomPin(): Promise<boolean> {
    const stored = readStorage<{ pin: string }>(PIN_KEY);
    return !!(stored && stored.pin);
  }
};

export const PersonnelAPI = {
  async list(): Promise<PersonnelRecord[]> {
    let list = readStorage<PersonnelRecord[]>(PERSONNEL_KEY);
    if (!list || !list.length) {
      list = [
        {
          id: uid(),
          name: 'Ana Cruz',
          username: 'ana.cruz',
          password: 'staff123',
          status: 'active',
          createdAt: new Date().toISOString()
        }
      ];
      writeStorage(PERSONNEL_KEY, list);
    }
    return list;
  },

  async get(id: string): Promise<PersonnelRecord | null> {
    const list = await this.list();
    return list.find(p => p.id === id) || null;
  },

  async create(person: { name: string; username: string; password?: string; status?: 'active' | 'inactive' }): Promise<{ ok: boolean; error?: string; person?: PersonnelRecord }> {
    const list = await this.list();
    const name = String(person.name || '').trim();
    const username = String(person.username || '').trim();

    if (!name || !username || !person.password) {
      return { ok: false, error: 'Name, username, and password are required.' };
    }
    if (!isValidNameInput(name)) {
      return { ok: false, error: 'Name can only contain letters.' };
    }
    if (list.some(p => p.username.toLowerCase() === username.toLowerCase())) {
      return { ok: false, error: 'That username is already taken.' };
    }

    const record: PersonnelRecord = {
      id: uid(),
      name,
      username,
      password: person.password,
      status: person.status === 'inactive' ? 'inactive' : 'active',
      createdAt: new Date().toISOString()
    };

    list.push(record);
    writeStorage(PERSONNEL_KEY, list);
    return { ok: true, person: record };
  },

  async update(id: string, patch: Partial<PersonnelRecord>): Promise<{ ok: boolean; error?: string; person?: PersonnelRecord }> {
    const list = await this.list();
    const index = list.findIndex(p => p.id === id);
    if (index === -1) return { ok: false, error: 'Personnel not found.' };

    if (patch.name !== undefined && !isValidNameInput(patch.name)) {
      return { ok: false, error: 'Name can only contain letters.' };
    }

    list[index] = { ...list[index], ...patch };
    writeStorage(PERSONNEL_KEY, list);
    return { ok: true, person: list[index] };
  },

  async setStatus(id: string, status: 'active' | 'inactive') {
    return this.update(id, { status: status === 'inactive' ? 'inactive' : 'active' });
  },

  async remove(id: string): Promise<void> {
    const list = await this.list();
    writeStorage(PERSONNEL_KEY, list.filter(p => p.id !== id));
    const session = readStorage<{ id: string; username: string }>(PERSONNEL_SESSION_KEY);
    if (session && session.id === id) {
      writeStorage(PERSONNEL_SESSION_KEY, null);
    }
  },

  async login(usernameInput: string, passwordInput: string): Promise<{ ok: boolean; error?: string; person?: PersonnelRecord }> {
    const username = String(usernameInput || '').trim();
    const list = await this.list();
    const person = list.find(p => p.username.toLowerCase() === username.toLowerCase());

    if (!person || person.password !== passwordInput) {
      return { ok: false, error: 'Incorrect username or password.' };
    }
    if (person.status === 'inactive') {
      return { ok: false, error: 'This account is inactive. Contact the admin.' };
    }

    writeStorage(PERSONNEL_SESSION_KEY, { id: person.id, username: person.username });
    writeStorage(SESSION_KEY, null);
    return { ok: true, person };
  },

  async currentSession(): Promise<PersonnelRecord | null> {
    const session = readStorage<{ id: string; username: string }>(PERSONNEL_SESSION_KEY);
    if (!session) return null;
    const person = await this.get(session.id);
    if (!person || person.status === 'inactive') {
      writeStorage(PERSONNEL_SESSION_KEY, null);
      return null;
    }
    return person;
  },

  async logout(): Promise<void> {
    writeStorage(PERSONNEL_SESSION_KEY, null);
  },

  async isStaffSession(): Promise<boolean> {
    return !!(await this.currentSession());
  }
};

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP'
});

export function formatPeso(value: number | string): string {
  return pesoFormatter.format(Number(value || 0));
}
