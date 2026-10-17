export interface PerfumeItem {
  id: string;
  name: string;
  brand: string;
  type: string;
  gender: string;
  size: number;
  stock: number;
  price: number;
  location: string;
  barcode: string;
}

export interface SaleRecord {
  id: string;
  name: string;
  date: string;
  amount: number;
  note: string;
}

export interface AccountRecord {
  username: string;
  password?: string;
  createdAt: string;
}

export interface PersonnelRecord {
  id: string;
  name: string;
  username: string;
  password?: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export type ViewType =
  | 'dashboard'
  | 'inventory'
  | 'scanner'
  | 'sales'
  | 'reports'
  | 'staff'
  | 'system';

export interface FilterState {
  brand: string;
  size: string;
  type: string;
  gender: string;
  sort: string;
}

export interface LookupProductResult {
  source: string;
  fields: {
    name?: string;
    brand?: string;
    size?: number;
    type?: string;
    gender?: string;
  };
}
