import React, { useState, useEffect, useRef } from 'react';
import {
  PerfumeItem,
  SaleRecord,
  AccountRecord,
  PersonnelRecord,
  ViewType,
  FilterState
} from './types';
import {
  InventoryAPI,
  SalesAPI,
  AccountAPI,
  SecurityAPI,
  PersonnelAPI,
  computeStats,
  statusForStock,
  formatPeso,
  isValidNameInput,
  barcodeExceedsLimit,
  BARCODE_MAX_LENGTH,
  MAX_PURCHASE_AMOUNT,
  SEED_ITEMS
} from './services/data';
import { lookupProduct } from './services/lookup';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { BrowserMultiFormatReader } from '@zxing/library';
import {
  LayoutGrid,
  Package,
  ScanLine,
  ReceiptText,
  FileSpreadsheet,
  Users,
  ShieldCheck,
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  Box,
  Layers,
  AlertTriangle,
  MapPin,
  ChevronRight,
  Minus,
  X,
  Camera,
  Sparkles,
  Lock,
  Menu,
  Check,
  Tag
} from 'lucide-react';

export default function App() {
  // Navigation & session state
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [currentUser, setCurrentUser] = useState<AccountRecord | null>(null);
  const [currentStaff, setCurrentStaff] = useState<PersonnelRecord | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);

  // Data state
  const [items, setItems] = useState<PerfumeItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [personnelList, setPersonnelList] = useState<PersonnelRecord[]>([]);

  // Modals state
  const [editingItem, setEditingItem] = useState<{
    item: PerfumeItem | null;
    prefill?: Partial<PerfumeItem>;
  } | null>(null);
  const [isRecordSaleOpen, setIsRecordSaleOpen] = useState(false);
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  };

  // PIN modal prompt
  const [pinPrompt, setPinPrompt] = useState<{
    message: string;
    resolve: (val: boolean) => void;
  } | null>(null);
  const [pinInput, setPinInput] = useState('');

  const requestPin = (message: string): Promise<boolean> => {
    return new Promise(resolve => {
      setPinInput('');
      setPinPrompt({ message, resolve });
    });
  };

  const handlePinConfirm = async () => {
    if (!pinPrompt) return;
    const ok = await SecurityAPI.verifyPin(pinInput);
    if (ok) {
      pinPrompt.resolve(true);
      setPinPrompt(null);
    } else {
      showToast('Incorrect PIN');
      setPinInput('');
    }
  };

  const handlePinCancel = () => {
    if (pinPrompt) {
      pinPrompt.resolve(false);
      setPinPrompt(null);
    }
  };

  // Load initial data & session
  const refreshAllData = async () => {
    const it = await InventoryAPI.list();
    const sl = await SalesAPI.list();
    const pl = await PersonnelAPI.list();
    setItems(it);
    setSales(sl);
    setPersonnelList(pl);

    const staff = await PersonnelAPI.currentSession();
    setCurrentStaff(staff);
    if (!staff) {
      const acct = await AccountAPI.current();
      setCurrentUser(acct);
    } else {
      setCurrentUser(null);
    }
    setIsAuthLoaded(true);
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  const handleLogout = async () => {
    if (currentStaff) {
      await PersonnelAPI.logout();
    } else {
      await AccountAPI.logout();
    }
    setCurrentUser(null);
    setCurrentStaff(null);
    setIsMobileMoreOpen(false);
    showToast('Signed out of terminal');
  };

  const isAdmin = !currentStaff;

  // Stock quick adjustment helper (+1 or -1 or +5)
  const adjustItemStock = async (itemId: string, delta: number) => {
    const target = items.find(i => i.id === itemId);
    if (!target) return;
    const newStock = Math.max(0, Number(target.stock || 0) + delta);
    await InventoryAPI.update(itemId, { stock: newStock });
    setItems(prev =>
      prev.map(i => (i.id === itemId ? { ...i, stock: newStock } : i))
    );
    showToast(`${target.name} stock: ${newStock}`);
  };

  const navigateTo = (view: ViewType) => {
    setCurrentView(view);
    setIsMobileMoreOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#faf8f5] text-[#1c1917] flex flex-col lg:flex-row antialiased selection:bg-[#f3ede2]">
      {/* =========================================================
          Desktop & Tablet Sidebar
      ========================================================= */}
      <aside className="hidden lg:flex w-64 bg-[#faf8f5] border-r border-[#ece7de] flex-col h-screen sticky top-0 p-6 overflow-y-auto select-none shrink-0">
        {/* Brand & Logo */}
        <div className="flex items-center gap-3 mb-8 cursor-pointer" onClick={() => navigateTo('dashboard')}>
          <div className="w-10 h-10 rounded-full bg-[#1c1917] flex items-center justify-center text-white shrink-0 shadow-sm">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 3h6M10 3v3.2c0 .5-.15.9-.45 1.25L8 9.4c-.55.65-.85 1.5-.85 2.4v6.7c0 1.4 1.1 2.5 2.5 2.5h4.7c1.4 0 2.5-1.1 2.5-2.5V11.8c0-.9-.3-1.75-.85-2.4l-1.55-1.95A2 2 0 0114 6.2V3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M8.3 13.5h7.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="font-serif text-[17px] font-bold text-[#1c1917] leading-tight">
              Aura Parfums
            </div>
            <div className="text-[9.5px] font-bold tracking-[0.16em] uppercase text-[#8c827a]">
              Boutique Inventory
            </div>
          </div>
        </div>

        {/* Menu Navigation (Exact Titles Preserved) */}
        <nav className="flex flex-col gap-1.5 flex-1">
          <button
            type="button"
            className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all text-left ${
              currentView === 'dashboard'
                ? 'bg-[#f0ebd8] text-[#1c1917] font-semibold shadow-2xs'
                : 'text-[#78716c] hover:text-[#1c1917] hover:bg-[#f4efe6]'
            }`}
            onClick={() => navigateTo('dashboard')}
          >
            <LayoutGrid className="w-4 h-4 shrink-0 opacity-80" />
            Dashboard
          </button>

          <button
            type="button"
            className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all text-left ${
              currentView === 'inventory'
                ? 'bg-[#f0ebd8] text-[#1c1917] font-semibold shadow-2xs'
                : 'text-[#78716c] hover:text-[#1c1917] hover:bg-[#f4efe6]'
            }`}
            onClick={() => navigateTo('inventory')}
          >
            <Package className="w-4 h-4 shrink-0 opacity-80" />
            Perfume Inventory
          </button>

          <button
            type="button"
            className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all text-left ${
              currentView === 'scanner'
                ? 'bg-[#f0ebd8] text-[#1c1917] font-semibold shadow-2xs'
                : 'text-[#78716c] hover:text-[#1c1917] hover:bg-[#f4efe6]'
            }`}
            onClick={() => navigateTo('scanner')}
          >
            <ScanLine className="w-4 h-4 shrink-0 opacity-80" />
            Barcode Scanner
          </button>

          <button
            type="button"
            className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all text-left ${
              currentView === 'sales'
                ? 'bg-[#f0ebd8] text-[#1c1917] font-semibold shadow-2xs'
                : 'text-[#78716c] hover:text-[#1c1917] hover:bg-[#f4efe6]'
            }`}
            onClick={() => navigateTo('sales')}
          >
            <ReceiptText className="w-4 h-4 shrink-0 opacity-80" />
            Purchase History
          </button>

          <button
            type="button"
            className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all text-left ${
              currentView === 'reports'
                ? 'bg-[#f0ebd8] text-[#1c1917] font-semibold shadow-2xs'
                : 'text-[#78716c] hover:text-[#1c1917] hover:bg-[#f4efe6]'
            }`}
            onClick={() => navigateTo('reports')}
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0 opacity-80" />
            Reports &amp; Export
          </button>

          <button
            type="button"
            className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all text-left ${
              currentView === 'staff'
                ? 'bg-[#f0ebd8] text-[#1c1917] font-semibold shadow-2xs'
                : 'text-[#78716c] hover:text-[#1c1917] hover:bg-[#f4efe6]'
            }`}
            onClick={() => navigateTo('staff')}
          >
            <Users className="w-4 h-4 shrink-0 opacity-80" />
            Staff &amp; Accounts
          </button>

          <button
            type="button"
            className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all text-left ${
              currentView === 'system'
                ? 'bg-[#f0ebd8] text-[#1c1917] font-semibold shadow-2xs'
                : 'text-[#78716c] hover:text-[#1c1917] hover:bg-[#f4efe6]'
            }`}
            onClick={() => navigateTo('system')}
          >
            <ShieldCheck className="w-4 h-4 shrink-0 opacity-80" />
            System &amp; PIN
          </button>
        </nav>

        {/* Bottom Actions & Session Info */}
        <div className="pt-4 border-t border-[#ece7de] flex flex-col gap-3">
          <button
            type="button"
            className="w-full bg-[#1c1917] text-white py-2.5 px-4 rounded-xl text-xs font-semibold tracking-wide flex items-center justify-center gap-2 hover:bg-[#2e2a27] active:scale-[0.98] transition-all shadow-sm"
            onClick={() => setEditingItem({ item: null })}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#c8aa76]" />
            + Add Perfume Item
          </button>

          <div
            className="p-3 bg-white border border-[#ece7de] rounded-xl flex items-center justify-between cursor-pointer hover:border-[#9c8f6f] transition-all"
            onClick={() => navigateTo('staff')}
          >
            <div>
              <div className="text-[9px] uppercase tracking-wider text-[#a8a29e] font-bold">
                Active Session
              </div>
              <div className="font-serif text-[13.5px] font-bold text-[#1c1917] leading-tight">
                {currentStaff ? currentStaff.name : currentUser ? currentUser.username : 'Boutique Director'}
              </div>
              <div className="text-[9px] font-semibold tracking-wider text-[#8c827a] uppercase">
                {currentStaff ? 'Staff Member' : 'Director (Admin)'}
              </div>
            </div>
            <Users className="w-4 h-4 text-[#a8a29e]" />
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#8c827a] font-medium">
            <span className="w-2 h-2 rounded-full bg-[#57795c] animate-pulse"></span>
            <span>Persistent client storage synced</span>
          </div>
        </div>
      </aside>

      {/* =========================================================
          Mobile Header (iPhone & Android)
      ========================================================= */}
      <header className="lg:hidden sticky top-0 z-30 bg-[#faf8f5]/95 backdrop-blur-md border-b border-[#ece7de] px-4 py-3 flex items-center justify-between safe-top">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigateTo('dashboard')}>
          <div className="w-8 h-8 rounded-full bg-[#1c1917] flex items-center justify-center text-white shrink-0">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 3h6M10 3v3.2c0 .5-.15.9-.45 1.25L8 9.4c-.55.65-.85 1.5-.85 2.4v6.7c0 1.4 1.1 2.5 2.5 2.5h4.7c1.4 0 2.5-1.1 2.5-2.5V11.8c0-.9-.3-1.75-.85-2.4l-1.55-1.95A2 2 0 0114 6.2V3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <span className="font-serif text-sm font-bold text-[#1c1917] block leading-none">
              Aura Parfums
            </span>
            <span className="text-[8.5px] font-bold tracking-[0.14em] uppercase text-[#8c827a]">
              Boutique Inventory
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="bg-[#1c1917] text-white text-[11px] font-semibold py-1.5 px-3 rounded-full flex items-center gap-1 active:scale-95 transition-all shadow-xs"
            onClick={() => setEditingItem({ item: null })}
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
          <button
            type="button"
            className="w-8 h-8 rounded-lg border border-[#ece7de] bg-white flex items-center justify-center text-[#1c1917] active:scale-95"
            onClick={() => setIsMobileMoreOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* =========================================================
          Main Content View
      ========================================================= */}
      <main className="flex-1 p-4 md:p-8 lg:p-10 max-w-[1280px] w-full mx-auto pb-28 lg:pb-12 overflow-x-hidden">
        {currentView === 'dashboard' && (
          <DashboardView
            items={items}
            sales={sales}
            navigateTo={navigateTo}
            onAddNew={() => setEditingItem({ item: null })}
            onRecordSale={() => setIsRecordSaleOpen(true)}
            onQuickAddStock={(id, qty) => adjustItemStock(id, qty)}
            onOpenBreakdown={() => setIsBreakdownModalOpen(true)}
          />
        )}

        {currentView === 'inventory' && (
          <InventoryView
            items={items}
            onAddNew={() => setEditingItem({ item: null })}
            onSelectItem={item => setEditingItem({ item })}
            onAdjustStock={(id, delta) => adjustItemStock(id, delta)}
          />
        )}

        {currentView === 'scanner' && (
          <ScannerView
            items={items}
            showToast={showToast}
            onAddStock={async (item, qty) => {
              await adjustItemStock(item.id, qty);
            }}
            onAddNewWithBarcode={(code, found) => {
              setEditingItem({ item: null, prefill: { barcode: code, ...found } });
            }}
            onViewItem={item => setEditingItem({ item })}
          />
        )}

        {currentView === 'sales' && (
          <SalesView
            sales={sales}
            showToast={showToast}
            onAddSale={async newSale => {
              await SalesAPI.create(newSale);
              await refreshAllData();
              showToast('Purchase recorded');
            }}
          />
        )}

        {currentView === 'reports' && (
          <ReportsView
            items={items}
            showToast={showToast}
            onLocationsUpdated={refreshAllData}
          />
        )}

        {currentView === 'staff' && (
          <StaffView
            personnelList={personnelList}
            currentUser={currentUser}
            currentStaff={currentStaff}
            isAdmin={isAdmin}
            showToast={showToast}
            requestPin={requestPin}
            onRefresh={refreshAllData}
          />
        )}

        {currentView === 'system' && (
          <SystemView
            items={items}
            isAdmin={isAdmin}
            showToast={showToast}
            requestPin={requestPin}
            onNavigateToStaff={() => navigateTo('staff')}
            onResetDemoData={async () => {
              await InventoryAPI.reset();
              await SalesAPI.reset();
              await refreshAllData();
              showToast('System reset to demo data');
            }}
          />
        )}
      </main>

      {/* =========================================================
          Mobile Bottom Navigation (iOS & Android Phone App Bar)
      ========================================================= */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#ece7de] px-2 py-1.5 flex items-center justify-around safe-bottom shadow-lg">
        <button
          type="button"
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-[10px] font-semibold transition-all ${
            currentView === 'dashboard' ? 'text-[#1c1917]' : 'text-[#8c827a]'
          }`}
          onClick={() => navigateTo('dashboard')}
        >
          <LayoutGrid className="w-5 h-5" />
          Dashboard
        </button>

        <button
          type="button"
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-[10px] font-semibold transition-all ${
            currentView === 'inventory' ? 'text-[#1c1917]' : 'text-[#8c827a]'
          }`}
          onClick={() => navigateTo('inventory')}
        >
          <Package className="w-5 h-5" />
          Inventory
        </button>

        {/* Center Scanner Action Button */}
        <button
          type="button"
          className="flex flex-col items-center justify-center -mt-4 bg-[#1c1917] text-white w-12 h-12 rounded-full shadow-md active:scale-95 transition-transform"
          onClick={() => navigateTo('scanner')}
          aria-label="Scan barcode"
        >
          <ScanLine className="w-5 h-5 text-[#f3ede2]" />
        </button>

        <button
          type="button"
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-[10px] font-semibold transition-all ${
            currentView === 'sales' ? 'text-[#1c1917]' : 'text-[#8c827a]'
          }`}
          onClick={() => navigateTo('sales')}
        >
          <ReceiptText className="w-5 h-5" />
          Sales
        </button>

        <button
          type="button"
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-[10px] font-semibold transition-all ${
            currentView === 'reports' || currentView === 'staff' || currentView === 'system'
              ? 'text-[#1c1917]'
              : 'text-[#8c827a]'
          }`}
          onClick={() => setIsMobileMoreOpen(true)}
        >
          <Menu className="w-5 h-5" />
          More
        </button>
      </nav>

      {/* =========================================================
          Mobile "More" Slide-up Sheet
      ========================================================= */}
      {isMobileMoreOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex flex-col justify-end"
          onClick={() => setIsMobileMoreOpen(false)}
        >
          <div
            className="bg-white rounded-t-3xl p-6 safe-bottom max-h-[85vh] overflow-y-auto animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-[#ece7de] rounded-full mx-auto mb-6"></div>

            <div className="flex items-center justify-between mb-4">
              <span className="font-serif text-lg font-bold">More Options</span>
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-[#f4efe6] flex items-center justify-center"
                onClick={() => setIsMobileMoreOpen(false)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 mb-6">
              <button
                type="button"
                className="w-full flex items-center gap-3.5 p-3.5 rounded-xl bg-[#faf8f5] border border-[#ece7de] text-left text-sm font-semibold active:bg-[#f4efe6]"
                onClick={() => navigateTo('reports')}
              >
                <FileSpreadsheet className="w-5 h-5 text-[#9c8f6f]" />
                Reports &amp; Export
              </button>

              <button
                type="button"
                className="w-full flex items-center gap-3.5 p-3.5 rounded-xl bg-[#faf8f5] border border-[#ece7de] text-left text-sm font-semibold active:bg-[#f4efe6]"
                onClick={() => navigateTo('staff')}
              >
                <Users className="w-5 h-5 text-[#9c8f6f]" />
                Staff &amp; Accounts
              </button>

              <button
                type="button"
                className="w-full flex items-center gap-3.5 p-3.5 rounded-xl bg-[#faf8f5] border border-[#ece7de] text-left text-sm font-semibold active:bg-[#f4efe6]"
                onClick={() => navigateTo('system')}
              >
                <ShieldCheck className="w-5 h-5 text-[#9c8f6f]" />
                System &amp; PIN
              </button>
            </div>

            <div className="p-3 bg-[#faf8f5] border border-[#ece7de] rounded-xl text-xs text-[#78716c]">
              <div className="font-semibold text-[#1c1917] mb-1">Active Session</div>
              <div>
                {currentStaff ? currentStaff.name : currentUser ? currentUser.username : 'Boutique Director'} (
                {currentStaff ? 'Staff' : 'Admin'})
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          Add / Edit Perfume Item Modal
      ========================================================= */}
      {editingItem && (
        <ItemModal
          item={editingItem.item}
          prefill={editingItem.prefill}
          onClose={() => setEditingItem(null)}
          onSaved={async () => {
            await refreshAllData();
            setEditingItem(null);
          }}
          onDeleted={async () => {
            await refreshAllData();
            setEditingItem(null);
          }}
          requestPin={requestPin}
          showToast={showToast}
        />
      )}

      {/* =========================================================
          Record Sale Modal
      ========================================================= */}
      {isRecordSaleOpen && (
        <RecordSaleModal
          onClose={() => setIsRecordSaleOpen(false)}
          onSaved={async newSale => {
            await SalesAPI.create(newSale);
            await refreshAllData();
            showToast('Sale recorded successfully');
            setIsRecordSaleOpen(false);
          }}
          showToast={showToast}
        />
      )}

      {/* =========================================================
          Detailed Size Breakdown Modal
      ========================================================= */}
      {isBreakdownModalOpen && (
        <SizeBreakdownModal
          items={items}
          onClose={() => setIsBreakdownModalOpen(false)}
        />
      )}

      {/* =========================================================
          Global Protection PIN Modal
      ========================================================= */}
      {pinPrompt && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 border border-[#ece7de] shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#9c8f6f]" />
                <h3 className="font-serif text-lg font-bold">Verify PIN</h3>
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-full bg-[#f4efe6] flex items-center justify-center text-[#78716c]"
                onClick={handlePinCancel}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-[#78716c] mb-4">{pinPrompt.message}</p>
            <input
              type="password"
              inputMode="numeric"
              placeholder="••••"
              className="w-full text-center tracking-[0.4em] font-mono text-xl py-3 border border-[#ece7de] rounded-xl mb-5 focus:outline-none focus:border-[#9c8f6f]"
              value={pinInput}
              autoFocus
              onChange={e => setPinInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handlePinConfirm();
              }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl border border-[#ece7de] text-xs font-semibold hover:bg-[#faf8f5]"
                onClick={handlePinCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl bg-[#a63a2a] text-white text-xs font-semibold hover:bg-[#8f3022]"
                onClick={handlePinConfirm}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          Global Toast
      ========================================================= */}
      <div id="toast" className={toastMessage ? 'show' : ''}>
        <Check className="w-4 h-4 text-[#c8aa76]" />
        <span>{toastMessage}</span>
      </div>
    </div>
  );
}

/* =========================================================
   DASHBOARD VIEW (Exact match to Screenshot 1)
========================================================= */
function DashboardView({
  items,
  sales,
  navigateTo,
  onAddNew,
  onRecordSale,
  onQuickAddStock,
  onOpenBreakdown
}: {
  items: PerfumeItem[];
  sales: SaleRecord[];
  navigateTo: (view: ViewType) => void;
  onAddNew: () => void;
  onRecordSale: () => void;
  onQuickAddStock: (id: string, qty: number) => void;
  onOpenBreakdown: () => void;
}) {
  const stats = computeStats(items);

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div>
        <div className="text-[10px] md:text-[11px] font-bold tracking-[0.16em] uppercase text-[#8c827a] mb-1">
          OVERVIEW &amp; METRICS
        </div>
        <h1 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold text-[#1c1917]">
          Fragrance Inventory Dashboard
        </h1>
      </div>

      {/* 4 Metric Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-4">
        {/* TOTAL STOCK */}
        <div className="bg-white border border-[#ece7de] rounded-2xl p-4 md:p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] md:text-[11px] font-bold tracking-wider uppercase text-[#8c827a]">
              TOTAL STOCK
            </span>
            <Box className="w-4 h-4 text-[#9c8f6f]" />
          </div>
          <div className="my-2">
            <div className="font-serif text-2xl md:text-3xl font-bold text-[#1c1917]">
              {stats.totalItems}
            </div>
            <div className="text-[11px] md:text-xs text-[#8c827a]">Bottles across all shelves</div>
          </div>
        </div>

        {/* UNIQUE FRAGRANCES */}
        <div className="bg-white border border-[#ece7de] rounded-2xl p-4 md:p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] md:text-[11px] font-bold tracking-wider uppercase text-[#8c827a]">
              UNIQUE FRAGRANCES
            </span>
            <Layers className="w-4 h-4 text-[#9c8f6f]" />
          </div>
          <div className="my-2">
            <div className="font-serif text-2xl md:text-3xl font-bold text-[#1c1917]">
              {stats.skus}
            </div>
            <div className="text-[11px] md:text-xs text-[#8c827a]">Active catalog formulas</div>
          </div>
        </div>

        {/* INVENTORY VALUE (In PHP Currency) */}
        <div className="bg-white border border-[#ece7de] rounded-2xl p-4 md:p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] md:text-[11px] font-bold tracking-wider uppercase text-[#8c827a]">
              INVENTORY VALUE
            </span>
            <span className="text-xs font-bold text-[#9c8f6f]">₱</span>
          </div>
          <div className="my-2">
            <div className="font-serif text-2xl md:text-3xl font-bold text-[#1c1917]">
              {formatPeso(stats.inventoryValue)}
            </div>
            <div className="text-[11px] md:text-xs text-[#8c827a]">Calculated at current retail</div>
          </div>
        </div>

        {/* STOCK ALERTS */}
        <div className="bg-white border border-[#ece7de] rounded-2xl p-4 md:p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] md:text-[11px] font-bold tracking-wider uppercase text-[#8c827a]">
              STOCK ALERTS
            </span>
            <AlertTriangle className="w-4 h-4 text-[#a46d1b]" />
          </div>
          <div className="my-2">
            <div className="font-serif text-2xl md:text-3xl font-bold text-[#1c1917]">
              {stats.lowStockCount + stats.depletedCount}
            </div>
            <div className="text-[11px] md:text-xs text-[#8c827a]">
              {stats.depletedCount} depleted · {stats.lowStockCount} low threshold
            </div>
          </div>
        </div>
      </div>

      {/* 4 Quick Action Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* Scan Barcode */}
        <button
          type="button"
          className="bg-white border border-[#ece7de] hover:border-[#9c8f6f] rounded-2xl p-4 text-left transition-all shadow-2xs flex items-center gap-3.5 group active:scale-[0.98]"
          onClick={() => navigateTo('scanner')}
        >
          <div className="w-10 h-10 rounded-xl bg-[#f4efe6] group-hover:bg-[#f0ebd8] flex items-center justify-center text-[#1c1917] shrink-0 transition-colors">
            <ScanLine className="w-5 h-5 text-[#7c7156]" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-xs md:text-sm text-[#1c1917] truncate">Scan Barcode</div>
            <div className="text-[11px] text-[#8c827a] truncate">Camera reader &amp; lookup</div>
          </div>
        </button>

        {/* Add Perfume Item */}
        <button
          type="button"
          className="bg-white border border-[#ece7de] hover:border-[#9c8f6f] rounded-2xl p-4 text-left transition-all shadow-2xs flex items-center gap-3.5 group active:scale-[0.98]"
          onClick={onAddNew}
        >
          <div className="w-10 h-10 rounded-xl bg-[#f4efe6] group-hover:bg-[#f0ebd8] flex items-center justify-center text-[#1c1917] shrink-0 transition-colors">
            <Plus className="w-5 h-5 text-[#7c7156]" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-xs md:text-sm text-[#1c1917] truncate">Add Perfume Item</div>
            <div className="text-[11px] text-[#8c827a] truncate">Ingest bottle into shelf</div>
          </div>
        </button>

        {/* Record Sale */}
        <button
          type="button"
          className="bg-white border border-[#ece7de] hover:border-[#9c8f6f] rounded-2xl p-4 text-left transition-all shadow-2xs flex items-center gap-3.5 group active:scale-[0.98]"
          onClick={onRecordSale}
        >
          <div className="w-10 h-10 rounded-xl bg-[#f4efe6] group-hover:bg-[#f0ebd8] flex items-center justify-center text-[#1c1917] shrink-0 transition-colors">
            <ReceiptText className="w-5 h-5 text-[#7c7156]" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-xs md:text-sm text-[#1c1917] truncate">Record Sale</div>
            <div className="text-[11px] text-[#8c827a] truncate">Log client purchase</div>
          </div>
        </button>

        {/* Reports & Export */}
        <button
          type="button"
          className="bg-white border border-[#ece7de] hover:border-[#9c8f6f] rounded-2xl p-4 text-left transition-all shadow-2xs flex items-center gap-3.5 group active:scale-[0.98]"
          onClick={() => navigateTo('reports')}
        >
          <div className="w-10 h-10 rounded-xl bg-[#f4efe6] group-hover:bg-[#f0ebd8] flex items-center justify-center text-[#1c1917] shrink-0 transition-colors">
            <FileSpreadsheet className="w-5 h-5 text-[#7c7156]" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-xs md:text-sm text-[#1c1917] truncate">Reports &amp; Export</div>
            <div className="text-[11px] text-[#8c827a] truncate">Valuation &amp; CSV backups</div>
          </div>
        </button>
      </div>

      {/* Main Grid: Priority Fragrances + Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols wide on desktop) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Low Stock & Depleted Fragrances Card */}
          <div className="bg-white border border-[#ece7de] rounded-2xl p-5 md:p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#a46d1b] block">
                  INVENTORY PRIORITY
                </span>
                <h3 className="font-serif text-lg md:text-xl font-bold text-[#1c1917]">
                  Low Stock &amp; Depleted Fragrances
                </h3>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-[#1c1917] hover:text-[#9c8f6f] flex items-center gap-1 transition-colors"
                onClick={() => navigateTo('inventory')}
              >
                View All <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {stats.lowStockItems.length > 0 ? (
                stats.lowStockItems.map(item => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-[#ece7de] bg-[#faf8f5]/60 hover:bg-white flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-[#f4efe6] flex items-center justify-center shrink-0">
                        <Box className="w-5 h-5 text-[#7c7156]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[9.5px] uppercase tracking-wider font-bold text-[#8c827a]">
                          {item.brand}
                        </div>
                        <div className="font-serif text-sm md:text-base font-bold text-[#1c1917] truncate">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-[#78716c] flex items-center gap-1.5 flex-wrap">
                          <span>{item.size}ml</span>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            <MapPin className="w-3 h-3 text-[#9c8f6f]" />
                            {item.location || 'Unassigned'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-[11px] font-semibold text-[#a46d1b] bg-[#fdf6ec] border border-[#fae6cb] px-2.5 py-1 rounded-full whitespace-nowrap">
                        {item.stock} left
                      </span>
                      <button
                        type="button"
                        className="bg-[#1c1917] text-white text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-[#2e2a27] active:scale-95 transition-all shadow-xs"
                        onClick={() => onQuickAddStock(item.id, 5)}
                      >
                        +5 Stock
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-[#8c827a]">
                  All catalog fragrances are currently adequately stocked.
                </div>
              )}
            </div>
          </div>

          {/* Recent Purchase Ledger Card */}
          <div className="bg-white border border-[#ece7de] rounded-2xl p-5 md:p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#8c827a] block">
                  AUDIT TRAIL
                </span>
                <h3 className="font-serif text-lg md:text-xl font-bold text-[#1c1917]">
                  Recent Purchase Ledger
                </h3>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-[#1c1917] hover:text-[#9c8f6f] flex items-center gap-1 transition-colors"
                onClick={() => navigateTo('sales')}
              >
                All Transactions <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-[#ece7de]">
              {sales.slice(0, 4).map(sale => (
                <div key={sale.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-[#1c1917]">{sale.name}</div>
                    <div className="text-[11px] text-[#8c827a]">
                      {new Date(sale.date + 'T00:00:00').toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                      {sale.note ? ` · ${sale.note}` : ''}
                    </div>
                  </div>
                  <div className="font-bold text-[#2e6b38] text-sm">
                    {formatPeso(sale.amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Stock by Bottle Size */}
        <div className="space-y-6">
          <div className="bg-white border border-[#ece7de] rounded-2xl p-5 md:p-6 shadow-2xs">
            <div className="mb-4">
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#8c827a] block">
                DISTRIBUTION
              </span>
              <h3 className="font-serif text-lg md:text-xl font-bold text-[#1c1917]">
                Stock by Bottle Size
              </h3>
            </div>

            <div className="space-y-4 my-6">
              {stats.sizeBreakdown.map(entry => (
                <div key={entry.size} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#1c1917]">
                    <span>{entry.size} mL</span>
                    <span className="text-[#78716c]">
                      {entry.count} bottles ({entry.pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[#f4efe6] overflow-hidden">
                    <div
                      className="h-full bg-[#9c8f6f] rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(4, entry.pct))}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="w-full py-2.5 px-4 rounded-xl border border-[#ece7de] hover:border-[#9c8f6f] text-xs font-semibold text-[#1c1917] flex items-center justify-center gap-1.5 hover:bg-[#faf8f5] transition-all"
              onClick={onOpenBreakdown}
            >
              Detailed Inventory Breakdown →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   PERFUME INVENTORY VIEW (Exact match to Screenshot 2)
========================================================= */
function InventoryView({
  items,
  onAddNew,
  onSelectItem,
  onAdjustStock
}: {
  items: PerfumeItem[];
  onAddNew: () => void;
  onSelectItem: (item: PerfumeItem) => void;
  onAdjustStock: (id: string, delta: number) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    brand: 'all',
    size: 'all',
    type: 'all',
    gender: 'all',
    sort: 'name-asc'
  });

  const brands = [...new Set(items.map(i => i.brand))].sort();
  const sizes = [...new Set(items.map(i => i.size))].sort((a, b) => a - b);
  const types = [...new Set(items.map(i => i.type))].sort();
  const genders = [...new Set(items.map(i => i.gender))].sort();

  const filteredItems = items.filter(item => {
    const name = String(item.name || '').toLowerCase();
    const brand = String(item.brand || '').toLowerCase();
    const loc = String(item.location || '').toLowerCase();
    const barcode = String(item.barcode || '').toLowerCase();
    const st = searchTerm.trim().toLowerCase();

    const matchesSearch =
      !st ||
      name.includes(st) ||
      brand.includes(st) ||
      loc.includes(st) ||
      barcode.includes(st) ||
      String(item.size).includes(st);

    const matchesBrand = filters.brand === 'all' || item.brand === filters.brand;
    const matchesSize = filters.size === 'all' || String(item.size) === filters.size;
    const matchesType = filters.type === 'all' || item.type === filters.type;
    const matchesGender = filters.gender === 'all' || item.gender === filters.gender;

    return matchesSearch && matchesBrand && matchesSize && matchesType && matchesGender;
  });

  const [sortKey, sortDirection] = filters.sort.split('-');
  filteredItems.sort((a, b) => {
    let av: any = a[sortKey as keyof PerfumeItem];
    let bv: any = b[sortKey as keyof PerfumeItem];
    if (sortKey === 'stock' || sortKey === 'size' || sortKey === 'price') {
      av = Number(av);
      bv = Number(bv);
    } else {
      av = String(av || '').toLowerCase();
      bv = String(bv || '').toLowerCase();
    }
    if (av < bv) return sortDirection === 'asc' ? -1 : 1;
    if (av > bv) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => k !== 'sort' && v !== 'all'
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] md:text-[11px] font-bold tracking-[0.16em] uppercase text-[#8c827a] mb-1">
            BOUTIQUE STOCK
          </div>
          <h1 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold text-[#1c1917]">
            Perfume Inventory
          </h1>
        </div>

        <button
          type="button"
          className="self-start sm:self-center bg-[#1c1917] text-white text-xs md:text-sm font-semibold py-2.5 px-5 rounded-full flex items-center gap-2 hover:bg-[#2e2a27] active:scale-95 transition-all shadow-sm shrink-0"
          onClick={onAddNew}
        >
          <Plus className="w-4 h-4" />
          Add Perfume Item
        </button>
      </div>

      {/* Search & Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#8c827a] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            className="w-full bg-white border border-[#ece7de] rounded-xl pl-10 pr-4 py-2.5 text-xs md:text-sm text-[#1c1917] placeholder:text-[#a8a29e] focus:outline-none focus:border-[#9c8f6f] shadow-2xs"
            placeholder="Search by fragrance, house, barcode, or shelf..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold bg-white shadow-2xs transition-all ${
              activeFilterCount > 0
                ? 'border-[#9c8f6f] text-[#1c1917] bg-[#fbf9f4]'
                : 'border-[#ece7de] text-[#78716c] hover:text-[#1c1917]'
            }`}
            onClick={() => setIsFilterModalOpen(true)}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#1c1917] text-white text-[10px] flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="relative">
            <select
              className="appearance-none bg-white border border-[#ece7de] rounded-xl px-3.5 py-2.5 pr-8 text-xs font-semibold text-[#1c1917] focus:outline-none focus:border-[#9c8f6f] shadow-2xs"
              value={filters.sort}
              onChange={e => setFilters(f => ({ ...f, sort: e.target.value }))}
            >
              <option value="name-asc">Sort: Name (A-Z)</option>
              <option value="name-desc">Sort: Name (Z-A)</option>
              <option value="stock-desc">Sort: Stock (High-Low)</option>
              <option value="stock-asc">Sort: Stock (Low-High)</option>
              <option value="price-desc">Sort: Price (High-Low)</option>
              <option value="price-asc">Sort: Price (Low-High)</option>
            </select>
            <ArrowUpDown className="w-3.5 h-3.5 text-[#8c827a] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Fragrance Cards Grid (Matches Screenshot 2) */}
      {filteredItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {filteredItems.map(item => {
            const status = statusForStock(item.stock);
            return (
              <div
                key={item.id}
                className="bg-white border border-[#ece7de] hover:border-[#9c8f6f] rounded-2xl p-5 shadow-2xs transition-all flex flex-col justify-between group cursor-pointer"
                onClick={() => onSelectItem(item)}
              >
                <div>
                  {/* Top row: Brand & Status Badge */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#78716c]">
                      {item.brand}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                        status.cls === 'success'
                          ? 'bg-[#eef5ee] text-[#2e6b38] border-[#d4e7d7]'
                          : status.cls === 'warn'
                          ? 'bg-[#fdf6ec] text-[#a46d1b] border-[#fae6cb]'
                          : 'bg-[#fdf0ed] text-[#a63a2a] border-[#fad5cf]'
                      }`}
                    >
                      {status.label}
                    </span>
                  </div>

                  {/* Title & Spec */}
                  <h3 className="font-serif text-lg md:text-xl font-bold text-[#1c1917] group-hover:text-[#9c8f6f] transition-colors leading-snug">
                    {item.name}
                  </h3>
                  <div className="text-xs text-[#78716c] mt-1">
                    {item.type} · {item.gender} · {item.size}ml
                  </div>

                  {/* Location */}
                  <div className="text-[11.5px] text-[#8c827a] mt-2 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#9c8f6f]" />
                    <span>{item.location || 'Shelf unassigned'}</span>
                  </div>
                </div>

                {/* Bottom Row: Price & Quantity Stepper */}
                <div
                  className="mt-6 pt-4 border-t border-[#f4efe6] flex items-center justify-between gap-3"
                  onClick={e => e.stopPropagation()}
                >
                  <div>
                    <div className="text-[9.5px] uppercase tracking-wider font-bold text-[#a8a29e]">
                      PRICE
                    </div>
                    <div className="font-semibold text-base text-[#1c1917]">
                      {formatPeso(item.price)}
                    </div>
                  </div>

                  {/* Stepper pill */}
                  <div className="flex items-center gap-2 bg-[#faf8f5] border border-[#ece7de] rounded-full px-2 py-1">
                    <button
                      type="button"
                      className="w-6 h-6 rounded-full bg-white border border-[#ece7de] hover:border-[#1c1917] flex items-center justify-center text-[#1c1917] active:scale-90 transition-all"
                      onClick={() => onAdjustStock(item.id, -1)}
                      aria-label="Decrease stock"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-semibold text-xs text-[#1c1917] min-w-[20px] text-center">
                      {item.stock}
                    </span>
                    <button
                      type="button"
                      className="w-6 h-6 rounded-full bg-white border border-[#ece7de] hover:border-[#1c1917] flex items-center justify-center text-[#1c1917] active:scale-90 transition-all"
                      onClick={() => onAdjustStock(item.id, 1)}
                      aria-label="Increase stock"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-[#ece7de] rounded-2xl p-12 text-center space-y-3">
          <Package className="w-8 h-8 text-[#c9c4b4] mx-auto" />
          <h3 className="font-serif text-lg font-bold text-[#1c1917]">No perfumes found</h3>
          <p className="text-xs text-[#78716c] max-w-sm mx-auto">
            Try adjusting your search query or filters, or add a new fragrance to the catalog.
          </p>
          <button
            type="button"
            className="bg-[#1c1917] text-white text-xs font-semibold py-2 px-4 rounded-full inline-flex items-center gap-1.5"
            onClick={onAddNew}
          >
            <Plus className="w-3.5 h-3.5" /> Add Perfume
          </button>
        </div>
      )}

      {/* Filter Modal */}
      {isFilterModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsFilterModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 border border-[#ece7de] shadow-2xl animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-lg font-bold">Filter Catalog</h2>
              <button
                type="button"
                className="w-7 h-7 rounded-full bg-[#f4efe6] flex items-center justify-center text-[#78716c]"
                onClick={() => setIsFilterModalOpen(false)}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1.5">
                  Brand / House
                </label>
                <select
                  className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#9c8f6f]"
                  value={filters.brand}
                  onChange={e => setFilters(f => ({ ...f, brand: e.target.value }))}
                >
                  <option value="all">All Brands</option>
                  {brands.map(b => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1.5">
                  Bottle Size (mL)
                </label>
                <select
                  className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#9c8f6f]"
                  value={filters.size}
                  onChange={e => setFilters(f => ({ ...f, size: e.target.value }))}
                >
                  <option value="all">All Sizes</option>
                  {sizes.map(s => (
                    <option key={s} value={String(s)}>
                      {s} mL
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1.5">
                  Fragrance Type
                </label>
                <select
                  className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#9c8f6f]"
                  value={filters.type}
                  onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
                >
                  <option value="all">All Types</option>
                  {types.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1.5">
                  Gender Target
                </label>
                <select
                  className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#9c8f6f]"
                  value={filters.gender}
                  onChange={e => setFilters(f => ({ ...f, gender: e.target.value }))}
                >
                  <option value="all">All Genders</option>
                  {genders.map(g => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2.5 mt-6 pt-4 border-t border-[#ece7de]">
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl border border-[#ece7de] text-xs font-semibold hover:bg-[#faf8f5]"
                onClick={() => {
                  setFilters({
                    brand: 'all',
                    size: 'all',
                    type: 'all',
                    gender: 'all',
                    sort: 'name-asc'
                  });
                  setIsFilterModalOpen(false);
                }}
              >
                Reset
              </button>
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl bg-[#1c1917] text-white text-xs font-semibold hover:bg-[#2e2a27]"
                onClick={() => setIsFilterModalOpen(false)}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   BARCODE SCANNER VIEW
========================================================= */
function ScannerView({
  items,
  showToast,
  onAddStock,
  onAddNewWithBarcode,
  onViewItem
}: {
  items: PerfumeItem[];
  showToast: (msg: string) => void;
  onAddStock: (item: PerfumeItem, qty: number) => Promise<void>;
  onAddNewWithBarcode: (code: string, found?: any) => void;
  onViewItem: (item: PerfumeItem) => void;
}) {
  const [manualCode, setManualCode] = useState('');
  const [manualCodeWarn, setManualCodeWarn] = useState(false);
  const [qrWarn, setQrWarn] = useState(false);
  const [cameraHint, setCameraHint] = useState('Starting boutique camera scanner…');

  const [addStockMatch, setAddStockMatch] = useState<PerfumeItem | null>(null);
  const [addStockQty, setAddStockQty] = useState(1);

  const [notFoundModal, setNotFoundModal] = useState<{
    code: string;
    status: string;
    found?: any;
  } | null>(null);

  const [lastScanned, setLastScanned] = useState<{
    item: PerfumeItem;
    added: number;
    newTotal: number;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isBusyRef = useRef(false);
  const ignoreUntilRef = useRef(0);

  const handleManualCodeChange = (val: string) => {
    setManualCode(val);
    setManualCodeWarn(barcodeExceedsLimit(val));
  };

  const handleBarcodeIdentified = async (raw: string) => {
    if (isBusyRef.current || Date.now() < ignoreUntilRef.current) return;
    isBusyRef.current = true;
    const code = String(raw).trim();
    setLastScanned(null);

    const match = items.find(i => String(i.barcode).trim() === code);
    if (match) {
      setAddStockQty(1);
      setAddStockMatch(match);
    } else {
      setNotFoundModal({ code, status: 'Querying global beauty & fragrance databases…' });
      lookupProduct(code).then(res => {
        setNotFoundModal(prev => {
          if (!prev || prev.code !== code) return prev;
          return {
            ...prev,
            status: res
              ? `Identified: ${[res.fields.name, res.fields.brand, res.fields.size ? res.fields.size + ' mL' : ''].filter(Boolean).join(' · ')}`
              : 'No online records found — enter bottle formula manually.',
            found: res?.fields
          };
        });
      });
    }
  };

  useEffect(() => {
    let active = true;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    const startCamera = async () => {
      try {
        const devices = await reader.listVideoInputDevices();
        if (!active) return;
        const deviceId = devices.length > 0 ? devices[devices.length - 1].deviceId : null;

        await reader.decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
          if (!active) return;
          if (result) {
            const txt = result.getText();
            if (result.getBarcodeFormat() === 11) {
              setQrWarn(true);
            } else {
              setQrWarn(false);
              handleBarcodeIdentified(txt);
            }
          }
        });
        if (active) setCameraHint('Align barcode within frame');
      } catch {
        if (active) setCameraHint('Camera inactive — use photo upload or manual lookup below.');
      }
    };

    startCamera();

    return () => {
      active = false;
      try {
        reader.reset();
      } catch {}
    };
  }, [items]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    await new Promise(resolve => {
      img.onload = resolve;
    });

    try {
      const r = readerRef.current || new BrowserMultiFormatReader();
      const res = await r.decodeFromImageElement(img);
      if (res) {
        if (res.getBarcodeFormat() === 11) {
          setQrWarn(true);
        } else {
          setQrWarn(false);
          handleBarcodeIdentified(res.getText());
        }
      }
    } catch {
      showToast('No readable barcode in image — try closer framing');
    }
  };

  const closeModals = () => {
    setAddStockMatch(null);
    setNotFoundModal(null);
    isBusyRef.current = false;
    ignoreUntilRef.current = Date.now() + 2500;
  };

  // Barcode product samples from client for finals
  const clientFinalsSamples = [
    { code: '888066000000', name: 'Tom Ford Oud Wood', brand: 'Tom Ford', size: '50ml' },
    { code: '812256022345', name: 'Ariana Grande Cloud', brand: 'Ariana Grande', size: '100ml' },
    { code: '3349668529513', name: 'Paco Rabanne One Million', brand: 'Paco Rabanne', size: '100ml' },
    { code: '3145891265478', name: 'Chanel Chance', brand: 'Chanel', size: '100ml' },
    { code: '3348901250158', name: 'Dior Sauvage', brand: 'Dior', size: '100ml' },
    { code: '3145891267229', name: 'Bleu de Chanel', brand: 'Chanel', size: '150ml' },
    { code: '8011003835521', name: 'Versace Dylan Blue', brand: 'Versace', size: '100ml' },
    { code: '3614272562481', name: 'YSL Libre', brand: 'YSL', size: '90ml' }
  ];

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <div className="text-[10px] md:text-[11px] font-bold tracking-[0.16em] uppercase text-[#8c827a] mb-1">
          FAST INGEST
        </div>
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#1c1917]">
          Barcode Scanner
        </h1>
      </div>

      {/* Video Viewfinder Frame */}
      <div className="bg-white border border-[#ece7de] rounded-3xl p-6 shadow-sm flex flex-col items-center">
        <div className="w-full max-w-sm aspect-4/3 rounded-2xl overflow-hidden bg-black relative border-2 border-dashed border-[#ece7de] flex items-center justify-center">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
          <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-[#9c8f6f]/80 shadow-[0_0_8px_#9c8f6f] pointer-events-none"></div>
        </div>

        <p className="text-xs text-[#78716c] mt-4 font-medium text-center">{cameraHint}</p>

        {/* Warning sign of QR code: "bawal qr" */}
        {qrWarn && (
          <div className="mt-3 bg-[#fdf0ed] text-[#a63a2a] border border-[#fad5cf] text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2.5 w-full max-w-sm justify-center shadow-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#a63a2a]" />
            <span>Bawal QR! Product barcodes only — bawal po ang QR code.</span>
          </div>
        )}

        <button
          type="button"
          className="mt-4 py-2 px-4 rounded-xl border border-[#ece7de] hover:border-[#9c8f6f] text-xs font-semibold text-[#1c1917] flex items-center gap-2 bg-[#faf8f5] active:scale-95 transition-all"
          onClick={() => fileInputRef.current?.click()}
        >
          <Camera className="w-4 h-4 text-[#7c7156]" />
          Take / Upload Photo Instead
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoUpload}
        />
      </div>

      {/* Success Ingest Card */}
      {lastScanned && (
        <div className="bg-white border border-[#d4e7d7] rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3 animate-fade-in">
          <div>
            <div className="text-[10px] font-bold text-[#2e6b38] uppercase tracking-wider">
              +{lastScanned.added} Bottles Added
            </div>
            <div className="font-serif font-bold text-sm text-[#1c1917]">{lastScanned.item.name}</div>
            <div className="text-[11px] text-[#78716c]">
              New stock level: <strong>{lastScanned.newTotal} pcs</strong>
            </div>
          </div>
          <button
            type="button"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#ece7de] hover:bg-[#faf8f5]"
            onClick={() => onViewItem(lastScanned.item)}
          >
            View
          </button>
        </div>
      )}

      {/* Manual Barcode Look Up with barcode length warning */}
      <div className="bg-white border border-[#ece7de] rounded-2xl p-5 shadow-2xs space-y-3">
        <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block">
          Manual Barcode Input
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 font-mono text-xs md:text-sm bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#9c8f6f]"
            placeholder="e.g. 3145891265478"
            value={manualCode}
            onChange={e => handleManualCodeChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && manualCode.trim()) {
                if (barcodeExceedsLimit(manualCode.trim())) {
                  showToast(`Barcode exceeds the maximum of ${BARCODE_MAX_LENGTH} digits`);
                  return;
                }
                handleBarcodeIdentified(manualCode.trim());
              }
            }}
          />
          <button
            type="button"
            className="bg-[#1c1917] text-white px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-[#2e2a27] shrink-0 active:scale-95 transition-all"
            onClick={() => {
              if (!manualCode.trim()) return showToast('Enter a barcode number');
              if (barcodeExceedsLimit(manualCode.trim())) {
                showToast(`Barcode exceeds the maximum of ${BARCODE_MAX_LENGTH} digits`);
                return;
              }
              handleBarcodeIdentified(manualCode.trim());
            }}
          >
            Lookup
          </button>
        </div>
        {manualCodeWarn && (
          <div className="text-[11.5px] font-semibold text-[#a63a2a] bg-[#fdf0ed] border border-[#fad5cf] px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Barcode exceeds the maximum of {BARCODE_MAX_LENGTH} digits for a standard barcode.</span>
          </div>
        )}
      </div>

      {/* Barcode product samples from client for finals demo */}
      <div className="bg-white border border-[#ece7de] rounded-2xl p-5 shadow-2xs space-y-3">
        <div className="flex items-center gap-1.5">
          <Tag className="w-4 h-4 text-[#9c8f6f]" />
          <span className="text-xs font-bold text-[#1c1917]">
            Barcode Product Samples from Client (For Finals Demo)
          </span>
        </div>
        <p className="text-[11px] text-[#78716c]">
          Tap any client barcode sample to immediately trigger scan &amp; stock management:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {clientFinalsSamples.map(sample => (
            <button
              key={sample.code}
              type="button"
              className="p-2.5 rounded-xl border border-[#ece7de] hover:border-[#9c8f6f] bg-[#faf8f5] hover:bg-white text-left transition-all active:scale-[0.98] group"
              onClick={() => handleBarcodeIdentified(sample.code)}
            >
              <div className="flex items-center justify-between text-[11px] font-mono text-[#78716c] group-hover:text-[#1c1917]">
                <span>{sample.code}</span>
                <span className="text-[10px] text-[#9c8f6f] font-sans font-semibold">Simulate Scan</span>
              </div>
              <div className="font-semibold text-xs text-[#1c1917] truncate">{sample.name}</div>
              <div className="text-[10px] text-[#8c827a]">{sample.brand} · {sample.size}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Add Stock Modal */}
      {addStockMatch && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 border border-[#ece7de] shadow-2xl animate-fade-in">
            <h3 className="font-serif text-lg font-bold text-[#1c1917]">Found in Catalog</h3>
            <p className="text-xs text-[#78716c] mt-1 mb-4">
              <strong>{addStockMatch.name}</strong> ({addStockMatch.brand}) · Currently{' '}
              {addStockMatch.stock} in shelf.
            </p>

            <div className="mb-5">
              <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1.5">
                Quantity to Ingest
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="w-10 h-10 rounded-xl bg-[#faf8f5] border border-[#ece7de] text-lg font-bold flex items-center justify-center"
                  onClick={() => setAddStockQty(q => Math.max(1, q - 1))}
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  className="flex-1 text-center font-bold text-lg py-2 bg-[#faf8f5] border border-[#ece7de] rounded-xl"
                  value={addStockQty}
                  onChange={e => setAddStockQty(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <button
                  type="button"
                  className="w-10 h-10 rounded-xl bg-[#faf8f5] border border-[#ece7de] text-lg font-bold flex items-center justify-center"
                  onClick={() => setAddStockQty(q => q + 1)}
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl border border-[#ece7de] text-xs font-semibold"
                onClick={closeModals}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl bg-[#1c1917] text-white text-xs font-semibold"
                onClick={async () => {
                  const item = addStockMatch;
                  const qty = addStockQty;
                  closeModals();
                  await onAddStock(item, qty);
                  setLastScanned({
                    item,
                    added: qty,
                    newTotal: Number(item.stock || 0) + qty
                  });
                }}
              >
                Add Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Barcode Modal */}
      {notFoundModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 border border-[#ece7de] shadow-2xl animate-fade-in">
            <h3 className="font-serif text-lg font-bold text-[#1c1917]">Barcode Not In Shelf</h3>
            <div className="font-mono text-xs bg-[#faf8f5] p-2.5 rounded-xl my-2 border border-[#ece7de]">
              {notFoundModal.code}
            </div>
            <p className="text-xs text-[#78716c] mb-5">{notFoundModal.status}</p>

            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl border border-[#ece7de] text-xs font-semibold"
                onClick={closeModals}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl bg-[#1c1917] text-white text-xs font-semibold"
                onClick={() => {
                  const code = notFoundModal.code;
                  const found = notFoundModal.found;
                  closeModals();
                  onAddNewWithBarcode(code, found);
                }}
              >
                Add to Inventory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   PURCHASE HISTORY VIEW
========================================================= */
function SalesView({
  sales,
  showToast,
  onAddSale
}: {
  sales: SaleRecord[];
  showToast: (msg: string) => void;
  onAddSale: (sale: { name: string; date: string; amount: number; note: string }) => Promise<void>;
}) {
  // Periods: Daily, Weekly, Monthly, Quarterly
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'quarter'>('day');

  // Form states: Name above date, max amount, optional note, letters only warning for name
  const [custName, setCustName] = useState('');
  const [custNameWarn, setCustNameWarn] = useState(false);
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saleAmount, setSaleAmount] = useState('');
  const [saleAmountWarn, setSaleAmountWarn] = useState(false);
  const [saleNote, setSaleNote] = useState('');

  const totalRev = sales.reduce((sum, s) => sum + Number(s.amount || 0), 0);

  const handleNameChange = (val: string) => {
    if (!isValidNameInput(val)) {
      setCustName(val.replace(/[^A-Za-z\u00C0-\u017F .'-]/g, ''));
      setCustNameWarn(true);
    } else {
      setCustName(val);
      setCustNameWarn(false);
    }
  };

  const handleAmountChange = (val: string) => {
    setSaleAmount(val);
    setSaleAmountWarn(Number(val) > MAX_PURCHASE_AMOUNT);
  };

  const handleInlineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cName = custName.trim();
    const amt = Number(saleAmount);

    if (!isValidNameInput(cName)) return showToast('Name can only contain letters');
    if (amt > MAX_PURCHASE_AMOUNT) return showToast(`Amount cannot exceed ${formatPeso(MAX_PURCHASE_AMOUNT)}`);
    if (isNaN(amt) || amt <= 0) return showToast('Enter valid purchase amount');

    await onAddSale({
      name: cName || 'Walk-in Customer',
      date: saleDate,
      amount: amt,
      note: saleNote.trim()
    });

    setCustName('');
    setSaleAmount('');
    setSaleNote('');
    setSaleDate(new Date().toISOString().slice(0, 10));
  };

  const printSaleReceipt = (sale: SaleRecord) => {
    const doc = new jsPDF({ unit: 'mm', format: [80, 75] });
    const w = 80;
    let y = 10;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('AURA PARFUMS', w / 2, y, { align: 'center' });
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text('Boutique Receipt', w / 2, y, { align: 'center' });
    y += 6;
    doc.setDrawColor(200);
    doc.line(5, y, w - 5, y);
    y += 6;

    doc.setTextColor(30);
    doc.setFontSize(9);
    doc.text(`Customer: ${sale.name || 'Walk-in Guest'}`, 5, y);
    y += 5;
    doc.text(
      `Date: ${new Date(sale.date + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })}`,
      5,
      y
    );
    y += 5;
    if (sale.note) {
      doc.text(`Details: ${sale.note}`, 5, y);
      y += 5;
    }
    y += 2;
    doc.setDrawColor(200);
    doc.line(5, y, w - 5, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Total: ${formatPeso(sale.amount)}`, w / 2, y, { align: 'center' });
    doc.save(`receipt-${sale.date}.pdf`);
    showToast('Receipt PDF downloaded');
  };

  const isoWeek = (dInput: Date) => {
    const d = new Date(Date.UTC(dInput.getFullYear(), dInput.getMonth(), dInput.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return { year: d.getUTCFullYear(), week };
  };

  const bucketFor = (dateString: string, p: 'day' | 'week' | 'month' | 'quarter') => {
    const date = new Date(dateString + 'T00:00:00');
    if (p === 'day') return dateString;
    if (p === 'week') {
      const { year: wYear, week } = isoWeek(date);
      return `${wYear}-W${String(week).padStart(2, '0')}`;
    }
    if (p === 'quarter') {
      const q = Math.floor(date.getMonth() / 3) + 1;
      return `${date.getFullYear()}-Q${q}`;
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  // Month label format: "Sept 1–30, 2026", Quarter format: "Q4 2026 (Oct 1 – Dec 31)"
  const labelFor = (bucketKey: string, p: 'day' | 'week' | 'month' | 'quarter') => {
    if (p === 'day') {
      return new Date(bucketKey + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
    if (p === 'week') {
      const [year, week] = bucketKey.split('-W');
      return `Week ${week}, ${year}`;
    }
    if (p === 'quarter') {
      const [year, q] = bucketKey.split('-Q');
      const qNum = Number(q);
      const startMonth = (qNum - 1) * 3;
      const endMonth = startMonth + 2;
      const startMonthName = new Date(Number(year), startMonth, 1).toLocaleDateString(undefined, { month: 'short' });
      const endMonthName = new Date(Number(year), endMonth, 1).toLocaleDateString(undefined, { month: 'short' });
      const lastDay = new Date(Number(year), endMonth + 1, 0).getDate();
      return `Q${qNum} ${year} (${startMonthName} 1 – ${endMonthName} ${lastDay})`;
    }
    const [year, month] = bucketKey.split('-').map(Number);
    const monthName = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short' });
    const lastDay = new Date(year, month, 0).getDate();
    return `${monthName} 1–${lastDay}, ${year}`;
  };

  const grouped = sales.reduce((groups: Record<string, SaleRecord[]>, s) => {
    const b = bucketFor(s.date, period);
    groups[b] = groups[b] || [];
    groups[b].push(s);
    return groups;
  }, {});

  const buckets = Object.keys(grouped).sort().reverse();

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] md:text-[11px] font-bold tracking-[0.16em] uppercase text-[#8c827a] mb-1">
          BOUTIQUE REVENUE
        </div>
        <h1 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold text-[#1c1917]">
          Purchase History
        </h1>
      </div>

      {/* Revenue Stat Card */}
      <div className="bg-white border border-[#ece7de] rounded-2xl p-6 shadow-2xs">
        <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#8c827a] block">
          TOTAL REVENUE
        </span>
        <div className="font-serif text-3xl md:text-4xl font-bold text-[#1c1917] my-1">
          {formatPeso(totalRev)}
        </div>
        <div className="text-xs text-[#78716c]">Revenue recorded across all purchase entries.</div>
      </div>

      {/* Add Purchase Form (Name above Date, Max Amount, Optional Note) */}
      <div className="bg-white border border-[#ece7de] rounded-2xl p-5 md:p-6 shadow-2xs space-y-4">
        <h3 className="font-serif text-lg font-bold text-[#1c1917]">Add Purchase</h3>
        <div className="h-0.5 w-12 bg-[#9c8f6f] rounded-full"></div>

        <form onSubmit={handleInlineSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
          {/* 1. Name above Date */}
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
              Name
            </label>
            <input
              type="text"
              placeholder="Customer name"
              required
              className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs md:text-sm focus:outline-none focus:border-[#9c8f6f]"
              value={custName}
              onChange={e => handleNameChange(e.target.value)}
            />
            {custNameWarn && (
              <span className="text-[10.5px] text-[#a63a2a] block mt-1">
                Only letters are allowed in the name.
              </span>
            )}
          </div>

          {/* 2. Date */}
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
              Date
            </label>
            <input
              type="date"
              required
              className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs md:text-sm focus:outline-none focus:border-[#9c8f6f]"
              value={saleDate}
              onChange={e => setSaleDate(e.target.value)}
            />
          </div>

          {/* 3. Amount with Maximum limit ceiling */}
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
              Amount (₱)
            </label>
            <input
              type="number"
              min="0.01"
              max={MAX_PURCHASE_AMOUNT}
              step="0.01"
              placeholder="0.00"
              required
              className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs md:text-sm focus:outline-none focus:border-[#9c8f6f]"
              value={saleAmount}
              onChange={e => handleAmountChange(e.target.value)}
            />
            {saleAmountWarn && (
              <span className="text-[10.5px] text-[#a63a2a] block mt-1">
                Amount cannot exceed {formatPeso(MAX_PURCHASE_AMOUNT)}.
              </span>
            )}
          </div>

          {/* 4. Note (optional) + Submit Button */}
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
              Note <span className="normal-case font-normal text-[#8c827a]">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Perfume or customer note"
                className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs md:text-sm focus:outline-none focus:border-[#9c8f6f]"
                value={saleNote}
                onChange={e => setSaleNote(e.target.value)}
              />
              <button
                type="submit"
                className="bg-[#1c1917] text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-[#2e2a27] shrink-0 active:scale-95 transition-all"
              >
                Add Sale
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Periodic Groupings Card (Daily, Weekly, Monthly, Quarterly) */}
      <div className="bg-white border border-[#ece7de] rounded-2xl p-5 md:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-serif text-lg font-bold text-[#1c1917]">
            Revenue &amp; Purchases — {period === 'day' ? 'Daily' : period === 'week' ? 'Weekly' : period === 'month' ? 'Monthly' : 'Quarterly'}
          </h3>

          <div className="flex items-center gap-1.5 p-1 bg-[#faf8f5] border border-[#ece7de] rounded-xl self-start flex-wrap">
            <button
              type="button"
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                period === 'day' ? 'bg-[#1c1917] text-white shadow-xs' : 'text-[#78716c] hover:text-[#1c1917]'
              }`}
              onClick={() => setPeriod('day')}
            >
              Daily
            </button>
            <button
              type="button"
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                period === 'week' ? 'bg-[#1c1917] text-white shadow-xs' : 'text-[#78716c] hover:text-[#1c1917]'
              }`}
              onClick={() => setPeriod('week')}
            >
              Weekly
            </button>
            <button
              type="button"
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                period === 'month' ? 'bg-[#1c1917] text-white shadow-xs' : 'text-[#78716c] hover:text-[#1c1917]'
              }`}
              onClick={() => setPeriod('month')}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                period === 'quarter' ? 'bg-[#1c1917] text-white shadow-xs' : 'text-[#78716c] hover:text-[#1c1917]'
              }`}
              onClick={() => setPeriod('quarter')}
            >
              Quarterly
            </button>
          </div>
        </div>

        <div className="divide-y divide-[#ece7de]">
          {buckets.length > 0 ? (
            buckets.map(b => {
              const bAmt = grouped[b].reduce((sum, s) => sum + Number(s.amount || 0), 0);
              return (
                <div key={b} className="py-3.5 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-sm text-[#1c1917]">{labelFor(b, period)}</div>
                    <div className="text-[11px] text-[#8c827a]">
                      {grouped[b].length} purchase{grouped[b].length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="font-bold text-base text-[#2e6b38]">{formatPeso(bAmt)}</div>
                </div>
              );
            })
          ) : (
            <div className="py-6 text-center text-xs text-[#8c827a]">No purchases recorded yet.</div>
          )}
        </div>
      </div>

      {/* All Purchases List with Receipt download button */}
      <div className="bg-white border border-[#ece7de] rounded-2xl p-5 md:p-6 shadow-2xs">
        <h3 className="font-serif text-lg font-bold text-[#1c1917] mb-4">All Purchases</h3>
        <div className="divide-y divide-[#ece7de]">
          {sales.length > 0 ? (
            sales
              .slice()
              .sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`))
              .map(s => (
                <div key={s.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-sm text-[#1c1917]">{s.name}</div>
                    <div className="text-[11px] text-[#8c827a]">
                      {new Date(s.date + 'T00:00:00').toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                      {s.note ? ` · ${s.note}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm text-[#1c1917]">{formatPeso(s.amount)}</span>
                    <button
                      type="button"
                      className="text-xs px-2.5 py-1 rounded-lg border border-[#ece7de] hover:bg-[#faf8f5] font-semibold flex items-center gap-1 active:scale-95 transition-all"
                      onClick={() => printSaleReceipt(s)}
                    >
                      <ReceiptText className="w-3.5 h-3.5 text-[#9c8f6f]" />
                      Receipt
                    </button>
                  </div>
                </div>
              ))
          ) : (
            <div className="py-6 text-center text-xs text-[#8c827a]">No purchases logged.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   REPORTS & EXPORT VIEW (With Receipt option, Shelf Location editor, 1-inch PDF margins)
========================================================= */
function ReportsView({
  items,
  showToast,
  onLocationsUpdated
}: {
  items: PerfumeItem[];
  showToast: (msg: string) => void;
  onLocationsUpdated: () => Promise<void>;
}) {
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({
    name: true,
    barcode: true,
    brand: true,
    size: true,
    stock: true,
    location: true
  });
  const [format, setFormat] = useState<'pdf' | 'xlsx' | 'receipt'>('pdf');
  const [locations, setLocations] = useState<Record<string, string>>({});

  useEffect(() => {
    const map: Record<string, string> = {};
    items.forEach(i => {
      map[i.id] = i.location || '';
    });
    setLocations(map);
  }, [items]);

  const FIELDS = [
    { key: 'name', label: 'Item Details', locked: true },
    { key: 'barcode', label: 'Barcode' },
    { key: 'brand', label: 'Category / Brand' },
    { key: 'size', label: 'Size (mL)' },
    { key: 'stock', label: 'Stock Quantity' },
    { key: 'location', label: 'Location' }
  ];

  const handleExport = () => {
    const active = FIELDS.filter(f => selectedFields[f.key]);

    if (format === 'xlsx') {
      const rows = items.map(i => {
        const row: Record<string, any> = {};
        active.forEach(f => {
          row[f.label] = f.key === 'size' ? `${i.size} mL` : (i as any)[f.key];
        });
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
      XLSX.writeFile(wb, 'perfume-inventory-report.xlsx');
      showToast('Excel file downloaded');
    } else if (format === 'receipt') {
      const doc = new jsPDF({ unit: 'mm', format: [80, 40 + items.length * 14] });
      const pw = 80;
      let y = 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Perfume Inventory', pw / 2, y, { align: 'center' });
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text('Stock Receipt', pw / 2, y, { align: 'center' });
      y += 4;
      doc.text(new Date().toLocaleString(), pw / 2, y, { align: 'center' });
      y += 4;
      doc.setDrawColor(200);
      doc.line(5, y, pw - 5, y);
      y += 5;
      doc.setTextColor(30);

      items.forEach(it => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(it.name, 5, y);
        y += 4;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100);
        const parts = active
          .filter(f => f.key !== 'name')
          .map(f => `${f.label}: ${f.key === 'size' ? it.size + ' mL' : (it as any)[f.key]}`);
        parts.forEach(p => {
          doc.text(p, 5, y);
          y += 3.6;
        });
        doc.setTextColor(30);
        y += 2;
      });

      doc.setDrawColor(200);
      doc.line(5, y, pw - 5, y);
      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`${items.length} item${items.length === 1 ? '' : 's'} listed`, pw / 2, y, { align: 'center' });
      doc.save('perfume-inventory-receipt.pdf');
      showToast('Receipt downloaded');
    } else {
      // PDF Document with margin 1 inch (25.4 mm) on all sides
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const margin = 25.4; // 1 inch on all sides
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('Perfume Inventory Report', margin, margin + 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(110);
      doc.text(`Generated ${new Date().toLocaleDateString()} · ${items.length} SKUs`, margin, margin + 11);

      const head = [active.map(f => f.label)];
      const body = items.map(i =>
        active.map(f => (f.key === 'size' ? `${i.size} mL` : String((i as any)[f.key] ?? '')))
      );

      autoTable(doc, {
        head,
        body,
        startY: margin + 18,
        margin: { top: margin, right: margin, bottom: margin, left: margin },
        headStyles: { fillColor: [36, 33, 25] },
        styles: { fontSize: 9, overflow: 'linebreak' }
      });
      doc.save('perfume-inventory-report.pdf');
      showToast('PDF downloaded');
    }
  };

  const handleSaveLocations = async () => {
    let changed = 0;
    for (const it of items) {
      const cur = locations[it.id] || '';
      if ((it.location || '') !== cur.trim()) {
        await InventoryAPI.update(it.id, { location: cur.trim() });
        changed++;
      }
    }
    await onLocationsUpdated();
    showToast(changed ? `Updated ${changed} location${changed === 1 ? '' : 's'}` : 'No changes to save');
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] md:text-[11px] font-bold tracking-[0.16em] uppercase text-[#8c827a] mb-1">
          REPORTS
        </div>
        <h1 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold text-[#1c1917]">
          Generate Report
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Configuration Card */}
        <div className="bg-white border border-[#ece7de] rounded-2xl p-5 md:p-6 shadow-2xs space-y-5">
          <div>
            <h3 className="font-serif text-lg font-bold text-[#1c1917]">Include in Report</h3>
            <div className="h-0.5 w-12 bg-[#9c8f6f] rounded-full my-2"></div>
          </div>

          <div className="space-y-2.5">
            {FIELDS.map(f => (
              <label
                key={f.key}
                className="flex items-center gap-3 text-xs font-medium text-[#1c1917] cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="rounded text-[#1c1917] focus:ring-0 w-4 h-4 accent-[#1c1917]"
                  checked={selectedFields[f.key] || false}
                  disabled={f.locked}
                  onChange={e => {
                    setSelectedFields(p => ({ ...p, [f.key]: e.target.checked }));
                  }}
                />
                <span>{f.label}</span>
              </label>
            ))}
          </div>

          <div className="pt-2">
            <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1.5">
              File Format
            </label>
            <select
              className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-[#9c8f6f]"
              value={format}
              onChange={e => setFormat(e.target.value as any)}
            >
              <option value="pdf">PDF Document (.pdf)</option>
              <option value="xlsx">Excel Spreadsheet (.xlsx)</option>
              <option value="receipt">Receipt (.pdf)</option>
            </select>
          </div>

          <button
            type="button"
            className="w-full py-3 rounded-xl bg-[#1c1917] text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#2e2a27] active:scale-95 transition-all shadow-sm"
            onClick={handleExport}
          >
            <FileSpreadsheet className="w-4 h-4 text-[#c8aa76]" />
            {format === 'xlsx'
              ? 'Generate & Export Excel'
              : format === 'receipt'
              ? 'Generate Receipt'
              : 'Generate & Export PDF'}
          </button>
          <div className="text-[11px] text-[#8c827a] text-center">
            Downloads directly to your device with 1-inch margins.
          </div>
        </div>

        {/* Edit Shelf Location section */}
        <div className="bg-white border border-[#ece7de] rounded-2xl p-5 md:p-6 shadow-2xs space-y-4">
          <div>
            <h3 className="font-serif text-lg font-bold text-[#1c1917]">Edit Shelf Location</h3>
            <div className="h-0.5 w-12 bg-[#9c8f6f] rounded-full my-2"></div>
            <p className="text-xs text-[#78716c]">
              Update where an item sits on the shelf directly from the report view.
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1 divide-y divide-[#ece7de]">
            {items.map(it => (
              <div key={it.id} className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[#1c1917] truncate">{it.name}</div>
                  <div className="text-[11px] text-[#8c827a] truncate">
                    {it.brand} · {it.size} mL
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="e.g. Shelf A - Row 2"
                  className="w-40 sm:w-48 bg-[#faf8f5] border border-[#ece7de] rounded-lg px-2.5 py-1.5 text-xs text-[#1c1917] focus:outline-none focus:border-[#9c8f6f]"
                  value={locations[it.id] ?? (it.location || '')}
                  onChange={e => {
                    const val = e.target.value;
                    setLocations(p => ({ ...p, [it.id]: val }));
                  }}
                  aria-label={`Shelf location for ${it.name}`}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            className="w-full py-2.5 rounded-xl bg-[#9c8f6f] text-white text-xs font-semibold hover:bg-[#7c7156] active:scale-95 transition-all shadow-xs"
            onClick={handleSaveLocations}
          >
            Save Location Changes
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   STAFF & ACCOUNTS VIEW (Dedicated UI Design from User Specs)
========================================================= */
function StaffView({
  personnelList,
  currentUser,
  currentStaff,
  isAdmin,
  showToast,
  requestPin,
  onRefresh
}: {
  personnelList: PersonnelRecord[];
  currentUser: AccountRecord | null;
  currentStaff: PersonnelRecord | null;
  isAdmin: boolean;
  showToast: (msg: string) => void;
  requestPin: (msg: string) => Promise<boolean>;
  onRefresh: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [nameWarn, setNameWarn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [isStaffLogin, setIsStaffLogin] = useState(false);

  const handleNameChange = (val: string) => {
    if (!isValidNameInput(val)) {
      setName(val.replace(/[^A-Za-z\u00C0-\u017F .'-]/g, ''));
      setNameWarn(true);
    } else {
      setName(val);
      setNameWarn(false);
    }
  };

  const handleAddPersonnel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidNameInput(name)) {
      showToast('Only letters are allowed in the name.');
      return;
    }

    const res = await PersonnelAPI.create({
      name: name.trim(),
      username: username.trim(),
      password,
      status
    });

    if (!res.ok) {
      showToast(res.error || 'Failed to add personnel');
      return;
    }

    showToast('Personnel account created');
    setName('');
    setUsername('');
    setPassword('');
    setStatus('active');
    await onRefresh();
  };

  const handleToggleStatus = async (p: PersonnelRecord) => {
    const next = p.status === 'inactive' ? 'active' : 'inactive';
    await PersonnelAPI.setStatus(p.id, next);
    showToast(`${p.name} marked ${next}`);
    await onRefresh();
  };

  const handleRemove = async (p: PersonnelRecord) => {
    if (!window.confirm(`Remove ${p.name}'s account?`)) return;
    const ok = await requestPin('Enter your protection PIN to remove this account');
    if (!ok) return;
    await PersonnelAPI.remove(p.id);
    showToast('Personnel removed');
    await onRefresh();
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStaffLogin) {
      const res = await PersonnelAPI.login(loginUser, loginPass);
      if (!res.ok) return showToast(res.error || 'Staff login failed');
      showToast('Logged in as staff');
    } else {
      const has = await AccountAPI.hasAccount();
      if (!has) {
        const reg = await AccountAPI.register(loginUser, loginPass);
        if (!reg.ok) return showToast(reg.error || 'Registration failed');
        showToast('Director account created');
      } else {
        const log = await AccountAPI.login(loginUser, loginPass);
        if (!log.ok) return showToast(log.error || 'Login failed');
        showToast('Logged in as Director');
      }
    }
    setLoginUser('');
    setLoginPass('');
    await onRefresh();
  };

  const handleLogout = async () => {
    if (currentStaff) {
      await PersonnelAPI.logout();
    } else {
      await AccountAPI.logout();
    }
    showToast('Logged out');
    await onRefresh();
  };

  const initials = (n: string) => {
    return String(n || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase() || '')
      .join('');
  };

  return (
    <div className="space-y-6">
      {/* Dedicated Admin Console Banner (From User's Custom Design) */}
      <div className="bg-[#1c1917] rounded-3xl p-6 md:p-8 text-white shadow-md">
        <span className="text-[10px] md:text-[11px] font-bold tracking-[0.16em] uppercase text-[#c8aa76] block mb-1">
          ADMIN CONSOLE
        </span>
        <h1 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold text-white">
          Personnel Accounts
        </h1>
      </div>

      {/* Active Session Status */}
      <div className="bg-white border border-[#ece7de] rounded-2xl p-5 shadow-2xs flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-[#8c827a]">
            ACTIVE SESSION
          </div>
          <div className="font-serif text-lg font-bold text-[#1c1917]">
            {currentStaff ? currentStaff.name : currentUser ? currentUser.username : 'Boutique Director'}
          </div>
          <div className="text-xs text-[#78716c]">
            Status: <strong>{currentStaff ? 'Staff Member' : 'Boutique Director (Admin)'}</strong>
          </div>
        </div>
        {(currentStaff || currentUser) && (
          <button
            type="button"
            className="text-xs font-semibold py-1.5 px-3.5 rounded-lg border border-[#a63a2a] text-[#a63a2a] hover:bg-[#fdf0ed]"
            onClick={handleLogout}
          >
            Log Out
          </button>
        )}
      </div>

      {/* Admin Personnel Creation & Management */}
      {isAdmin ? (
        <div className="space-y-6">
          {/* Add Personnel Card (Name, Username, Password, Active/Inactive) */}
          <div className="bg-white border border-[#ece7de] rounded-2xl p-5 md:p-6 shadow-2xs space-y-4">
            <div>
              <h3 className="font-serif text-lg font-bold text-[#1c1917]">Add Personnel</h3>
              <div className="h-0.5 w-12 bg-[#9c8f6f] rounded-full my-2"></div>
            </div>

            <form onSubmit={handleAddPersonnel} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
                  Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ana Cruz"
                  required
                  className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#9c8f6f]"
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
                  Username
                </label>
                <input
                  type="text"
                  placeholder="e.g. ana.cruz"
                  required
                  className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#9c8f6f]"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  required
                  className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#9c8f6f]"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
                  Status
                </label>
                <div className="flex gap-1 p-1 bg-[#faf8f5] border border-[#ece7de] rounded-xl">
                  <button
                    type="button"
                    className={`flex-1 text-[11px] font-semibold py-1.5 rounded-lg transition-all ${
                      status === 'active' ? 'bg-[#2e6b38] text-white shadow-xs' : 'text-[#78716c]'
                    }`}
                    onClick={() => setStatus('active')}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    className={`flex-1 text-[11px] font-semibold py-1.5 rounded-lg transition-all ${
                      status === 'inactive' ? 'bg-[#78716c] text-white shadow-xs' : 'text-[#78716c]'
                    }`}
                    onClick={() => setStatus('inactive')}
                  >
                    Inactive
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="bg-[#1c1917] text-white px-5 py-2.5 rounded-xl text-xs font-semibold hover:bg-[#2e2a27] active:scale-95 transition-all"
              >
                Add
              </button>
            </form>

            {nameWarn && (
              <div className="text-[11.5px] font-semibold text-[#a63a2a] bg-[#fdf0ed] border border-[#fad5cf] px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Only letters are allowed in the name.</span>
              </div>
            )}
          </div>

          {/* Personnel Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {personnelList.length > 0 ? (
              personnelList.map(p => (
                <div
                  key={p.id}
                  className={`bg-white border border-[#ece7de] rounded-2xl p-5 shadow-2xs flex flex-col justify-between relative overflow-hidden ${
                    p.status === 'inactive' ? 'opacity-80' : ''
                  }`}
                >
                  <div
                    className={`absolute top-0 left-0 right-0 h-1 ${
                      p.status === 'active' ? 'bg-[#9c8f6f]' : 'bg-[#d6d3d1]'
                    }`}
                  ></div>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-full bg-[#f4efe6] text-[#7c7156] font-serif font-bold text-sm flex items-center justify-center shrink-0">
                      {initials(p.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-[#1c1917] truncate">{p.name}</div>
                      <div className="font-mono text-xs text-[#8c827a] truncate">@{p.username}</div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-block ${
                        p.status === 'active'
                          ? 'bg-[#eef5ee] text-[#2e6b38]'
                          : 'bg-[#faf8f5] text-[#8c827a]'
                      }`}
                    >
                      {p.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex gap-2 pt-3 border-t border-[#ece7de]">
                    <button
                      type="button"
                      className="flex-1 text-[11px] font-semibold py-1.5 rounded-lg border border-[#ece7de] hover:bg-[#faf8f5]"
                      onClick={() => handleToggleStatus(p)}
                    >
                      {p.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      className="flex-1 text-[11px] font-semibold py-1.5 rounded-lg border border-[#fad5cf] text-[#a63a2a] hover:bg-[#fdf0ed]"
                      onClick={() => handleRemove(p)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-8 text-center text-xs text-[#8c827a] bg-white border border-[#ece7de] rounded-2xl">
                No personnel accounts yet. Add your first staff member above.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#ece7de] rounded-2xl p-6 text-xs text-[#78716c]">
          This section is limited to admin accounts. Log in as the owner from the Account page to manage personnel.
        </div>
      )}

      {/* Login Toggle when logged out */}
      {!currentUser && !currentStaff && (
        <div className="bg-white border border-[#ece7de] rounded-2xl p-6 shadow-2xs max-w-md mx-auto space-y-4">
          <div className="flex gap-2 p-1 bg-[#faf8f5] rounded-xl border border-[#ece7de]">
            <button
              type="button"
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                !isStaffLogin ? 'bg-[#1c1917] text-white' : 'text-[#78716c]'
              }`}
              onClick={() => setIsStaffLogin(false)}
            >
              Owner Account
            </button>
            <button
              type="button"
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                isStaffLogin ? 'bg-[#1c1917] text-white' : 'text-[#78716c]'
              }`}
              onClick={() => setIsStaffLogin(true)}
            >
              Staff Login
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-3">
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
                Username
              </label>
              <input
                type="text"
                required
                className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs"
                value={loginUser}
                onChange={e => setLoginUser(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
                Password
              </label>
              <input
                type="password"
                required
                className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs"
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#1c1917] text-white text-xs font-semibold"
            >
              {isStaffLogin ? 'Sign In as Staff' : 'Sign In as Owner'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   SYSTEM & PIN / SETTINGS VIEW (With Accounts section & PIN protection)
========================================================= */
function SystemView({
  items,
  isAdmin,
  showToast,
  requestPin,
  onNavigateToStaff,
  onResetDemoData
}: {
  items: PerfumeItem[];
  isAdmin: boolean;
  showToast: (msg: string) => void;
  requestPin: (msg: string) => Promise<boolean>;
  onNavigateToStaff: () => void;
  onResetDemoData: () => Promise<void>;
}) {
  const stats = computeStats(items);

  const handleChangePin = async () => {
    const ok = await requestPin('Enter your current PIN to change it');
    if (!ok) return;

    const newPin = window.prompt('Enter a new 4-8 digit PIN:');
    if (!newPin) return;

    const res = await SecurityAPI.setPin(newPin);
    if (!res.ok) return showToast(res.error || 'PIN must be 4-8 digits');
    showToast('PIN updated');
  };

  const handleReset = async () => {
    if (window.confirm('Reset inventory to the sample data? This removes anything you’ve added.')) {
      const ok = await requestPin('Enter your protection PIN to reset all data');
      if (!ok) return;
      await onResetDemoData();
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <div className="text-[10px] md:text-[11px] font-bold tracking-[0.16em] uppercase text-[#8c827a] mb-1">
          SETTINGS
        </div>
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#1c1917]">
          Data &amp; Storage
        </h1>
      </div>

      <div className="bg-white border border-[#ece7de] rounded-2xl p-5 md:p-6 shadow-2xs divide-y divide-[#ece7de]">
        <div className="py-3.5 first:pt-0 flex items-center justify-between gap-3 text-xs">
          <div>
            <div className="font-semibold text-sm text-[#1c1917]">Storage backend</div>
            <div className="text-[#78716c]">
              Built-in persistent storage — data survives closing this tab.
            </div>
          </div>
          <span className="w-2.5 h-2.5 rounded-full bg-[#2e6b38]"></span>
        </div>

        <div className="py-3.5 flex items-center justify-between gap-3 text-xs">
          <div>
            <div className="font-semibold text-sm text-[#1c1917]">Items tracked</div>
            <div className="text-[#78716c]">
              {stats.skus} SKUs, {stats.totalItems} units total.
            </div>
          </div>
        </div>

        <div className="py-3.5 flex items-center justify-between gap-3 text-xs">
          <div>
            <div className="font-semibold text-sm text-[#1c1917]">Connect a real database</div>
            <div className="text-[#78716c]">
              All reads/writes flow through the InventoryAPI in services/data.ts. Point its methods at a REST API to move off built-in storage.
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="py-3.5 last:pb-0 flex items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-semibold text-sm text-[#a63a2a]">Reset demo data</div>
              <div className="text-[#78716c]">Clears everything and restores the sample perfumes.</div>
            </div>
            <button
              type="button"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#a63a2a] text-[#a63a2a] hover:bg-[#fdf0ed]"
              onClick={handleReset}
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Settings: Accounts Section (Explicitly Requested) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] md:text-[11px] font-bold tracking-[0.16em] uppercase text-[#8c827a]">
            ADMIN
          </span>
          <h2 className="font-serif text-xl font-bold text-[#1c1917]">Accounts</h2>
        </div>

        <div className="bg-white border border-[#ece7de] rounded-2xl p-5 md:p-6 shadow-2xs divide-y divide-[#ece7de]">
          <div className="py-3.5 first:pt-0 flex items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-semibold text-sm text-[#1c1917]">Personnel accounts</div>
              <div className="text-[#78716c]">Create and manage staff logins with active/inactive status.</div>
            </div>
            <button
              type="button"
              className="text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-[#9c8f6f] text-white hover:bg-[#7c7156] active:scale-95 transition-all"
              onClick={onNavigateToStaff}
            >
              Manage
            </button>
          </div>

          <div className="py-3.5 last:pb-0 flex items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-semibold text-sm text-[#1c1917]">Deletion protection PIN</div>
              <div className="text-[#78716c]">
                A PIN is required before any product can be deleted. Default is 1234.
              </div>
            </div>
            <button
              type="button"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#ece7de] hover:bg-[#faf8f5]"
              onClick={handleChangePin}
            >
              Change PIN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ADD / EDIT PERFUME MODAL (With letters-only name warning & barcode length warning)
========================================================= */
function ItemModal({
  item,
  prefill,
  onClose,
  onSaved,
  onDeleted,
  requestPin,
  showToast
}: {
  item: PerfumeItem | null;
  prefill?: Partial<PerfumeItem>;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  requestPin: (msg: string) => Promise<boolean>;
  showToast: (msg: string) => void;
}) {
  const isNew = !item;

  const [name, setName] = useState(item?.name || prefill?.name || '');
  const [brand, setBrand] = useState(item?.brand || prefill?.brand || '');
  const [type, setType] = useState(item?.type || prefill?.type || 'Eau de Parfum');
  const [size, setSize] = useState<number | string>(item?.size || prefill?.size || 100);
  const [gender, setGender] = useState(item?.gender || prefill?.gender || 'For Women');
  const [stock, setStock] = useState<number | string>(item?.stock ?? 1);
  const [price, setPrice] = useState<number | string>(item?.price !== undefined ? item.price : 0);
  const [location, setLocation] = useState(item?.location || '');
  const [barcode, setBarcode] = useState(item?.barcode || prefill?.barcode || '');

  const [nameWarn, setNameWarn] = useState(false);
  const [barcodeWarn, setBarcodeWarn] = useState(false);

  const handleNameChange = (val: string) => {
    if (!isValidNameInput(val)) {
      setName(val.replace(/[^A-Za-z\u00C0-\u017F .'-]/g, ''));
      setNameWarn(true);
    } else {
      setName(val);
      setNameWarn(false);
    }
  };

  const handleBarcodeChange = (val: string) => {
    setBarcode(val);
    setBarcodeWarn(barcodeExceedsLimit(val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cName = name.trim();
    const cBrand = brand.trim();
    const cBarcode = barcode.trim();
    const numPrice = Number(price);

    if (!cName || !cBrand || !cBarcode) return showToast('Name, brand, and barcode are required');
    if (!isValidNameInput(cName)) return showToast('Name can only contain letters');
    if (barcodeExceedsLimit(cBarcode)) {
      return showToast(`Barcode exceeds the maximum of ${BARCODE_MAX_LENGTH} digits`);
    }

    const payload = {
      name: cName,
      brand: cBrand,
      type,
      size: Number(size) || 100,
      gender,
      stock: Number(stock) || 0,
      price: numPrice >= 0 ? numPrice : 0,
      location: location.trim(),
      barcode: cBarcode
    };

    if (isNew) {
      await InventoryAPI.create(payload);
      showToast('Added to inventory');
    } else {
      await InventoryAPI.update(item.id, payload);
      showToast('Changes saved');
    }
    onSaved();
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!window.confirm(`Remove ${item.name} from inventory?`)) return;
    const ok = await requestPin('Enter your protection PIN to delete this item');
    if (!ok) return;
    await InventoryAPI.remove(item.id);
    showToast('Item removed');
    onDeleted();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 border border-[#ece7de] shadow-2xl animate-fade-in my-8 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#8c827a] block">
              {isNew ? 'NEW ENTRY' : 'ITEM DETAILS'}
            </span>
            <h2 className="font-serif text-xl md:text-2xl font-bold text-[#1c1917]">
              {isNew ? 'Add Perfume' : item.name}
            </h2>
          </div>
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-[#faf8f5] flex items-center justify-center text-[#78716c]"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
                Name
              </label>
              <input
                type="text"
                placeholder="e.g. Chanel Chance"
                required
                className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-medium focus:outline-none focus:border-[#9c8f6f]"
                value={name}
                onChange={e => handleNameChange(e.target.value)}
              />
              {nameWarn && (
                <div className="text-[11px] font-semibold text-[#a63a2a] mt-1 flex items-center gap-1">
                  <span>⚠ Only letters are allowed in the name — numbers were removed from your input.</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
                Brand
              </label>
              <input
                type="text"
                placeholder="e.g. Chanel"
                required
                className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-medium focus:outline-none focus:border-[#9c8f6f]"
                value={brand}
                onChange={e => setBrand(e.target.value)}
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
                Type
              </label>
              <select
                className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-medium focus:outline-none focus:border-[#9c8f6f]"
                value={type}
                onChange={e => setType(e.target.value)}
              >
                <option>Eau de Parfum</option>
                <option>Eau de Toilette</option>
                <option>Cologne</option>
                <option>Perfume Oil</option>
                <option>Eau Fraiche</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
                Size (mL)
              </label>
              <input
                type="number"
                min="1"
                required
                className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-medium focus:outline-none focus:border-[#9c8f6f]"
                value={size}
                onChange={e => setSize(e.target.value)}
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
                Gender
              </label>
              <select
                className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-medium focus:outline-none focus:border-[#9c8f6f]"
                value={gender}
                onChange={e => setGender(e.target.value)}
              >
                <option>For Women</option>
                <option>For Men</option>
                <option>Unisex</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
                Stock Quantity
              </label>
              <input
                type="number"
                min="0"
                required
                className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-medium focus:outline-none focus:border-[#9c8f6f]"
                value={stock}
                onChange={e => setStock(e.target.value)}
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
                Price (₱)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                placeholder="0.00"
                className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-medium focus:outline-none focus:border-[#9c8f6f]"
                value={price}
                onChange={e => setPrice(e.target.value)}
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
                Shelf Location
              </label>
              <input
                type="text"
                placeholder="e.g. Shelf A - Row 2"
                className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-medium focus:outline-none focus:border-[#9c8f6f]"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
                Barcode Number
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 3145891265478"
                className="w-full font-mono bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3.5 py-2.5 text-xs md:text-sm focus:outline-none focus:border-[#9c8f6f]"
                value={barcode}
                onChange={e => handleBarcodeChange(e.target.value)}
              />
              {barcodeWarn && (
                <div className="text-[11px] font-semibold text-[#a63a2a] mt-1 flex items-center gap-1">
                  <span>⚠ Barcode exceeds the maximum of {BARCODE_MAX_LENGTH} digits for a standard barcode.</span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 flex gap-2.5">
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-[#1c1917] text-white text-xs md:text-sm font-semibold hover:bg-[#2e2a27]"
            >
              {isNew ? 'Add to Inventory' : 'Save Changes'}
            </button>
            {!isNew && (
              <button
                type="button"
                className="px-4 py-3 rounded-xl border border-[#a63a2a] text-[#a63a2a] text-xs md:text-sm font-semibold hover:bg-[#fdf0ed]"
                onClick={handleDelete}
              >
                Delete
              </button>
            )}
            <button
              type="button"
              className="px-4 py-3 rounded-xl border border-[#ece7de] text-xs md:text-sm font-semibold"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   RECORD SALE MODAL (Name above Date, Max ceiling, Note optional)
========================================================= */
function RecordSaleModal({
  onClose,
  onSaved,
  showToast
}: {
  onClose: () => void;
  onSaved: (sale: { name: string; date: string; amount: number; note: string }) => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [nameWarn, setNameWarn] = useState(false);
  const [amountWarn, setAmountWarn] = useState(false);

  const handleNameChange = (val: string) => {
    if (!isValidNameInput(val)) {
      setName(val.replace(/[^A-Za-z\u00C0-\u017F .'-]/g, ''));
      setNameWarn(true);
    } else {
      setName(val);
      setNameWarn(false);
    }
  };

  const handleAmountChange = (val: string) => {
    setAmount(val);
    setAmountWarn(Number(val) > MAX_PURCHASE_AMOUNT);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cName = name.trim();
    const amt = Number(amount);

    if (!isValidNameInput(cName)) return showToast('Name can only contain letters');
    if (amt > MAX_PURCHASE_AMOUNT) {
      return showToast(`Amount cannot exceed ${formatPeso(MAX_PURCHASE_AMOUNT)}`);
    }
    if (isNaN(amt) || amt <= 0) return showToast('Enter valid sale amount');

    await onSaved({
      name: cName || 'Walk-in Customer',
      date,
      amount: amt,
      note: note.trim()
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-md w-full p-6 md:p-8 border border-[#ece7de] shadow-2xl animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#8c827a] block">
              POS TRANSACTION
            </span>
            <h2 className="font-serif text-xl font-bold text-[#1c1917]">Add Purchase</h2>
          </div>
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-[#faf8f5] flex items-center justify-center text-[#78716c]"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* 1. Name above Date */}
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
              Name
            </label>
            <input
              type="text"
              placeholder="Customer name"
              required
              className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs md:text-sm font-medium focus:outline-none focus:border-[#9c8f6f]"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
            />
            {nameWarn && (
              <span className="text-[10.5px] font-semibold text-[#a63a2a] block mt-1">
                ⚠ Only letters are allowed in the name.
              </span>
            )}
          </div>

          {/* 2. Date */}
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
              Date
            </label>
            <input
              type="date"
              required
              className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs md:text-sm font-medium focus:outline-none focus:border-[#9c8f6f]"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          {/* 3. Amount with Maximum limit */}
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
              Amount (₱)
            </label>
            <input
              type="number"
              min="0.01"
              max={MAX_PURCHASE_AMOUNT}
              step="0.01"
              placeholder="0.00"
              required
              className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs md:text-sm font-medium focus:outline-none focus:border-[#9c8f6f]"
              value={amount}
              onChange={e => handleAmountChange(e.target.value)}
            />
            {amountWarn && (
              <span className="text-[10.5px] font-semibold text-[#a63a2a] block mt-1">
                ⚠ Amount cannot exceed {formatPeso(MAX_PURCHASE_AMOUNT)}.
              </span>
            )}
          </div>

          {/* 4. Note (optional) */}
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-[#78716c] block mb-1">
              Note <span className="normal-case font-normal text-[#8c827a]">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="Perfume or customer note"
              className="w-full bg-[#faf8f5] border border-[#ece7de] rounded-xl px-3 py-2 text-xs md:text-sm font-medium focus:outline-none focus:border-[#9c8f6f]"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          <div className="pt-3 flex gap-2">
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-[#1c1917] text-white text-xs font-semibold hover:bg-[#2e2a27]"
            >
              Add Sale
            </button>
            <button
              type="button"
              className="px-4 py-2.5 rounded-xl border border-[#ece7de] text-xs font-semibold"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   SIZE BREAKDOWN MODAL
========================================================= */
function SizeBreakdownModal({
  items,
  onClose
}: {
  items: PerfumeItem[];
  onClose: () => void;
}) {
  const stats = computeStats(items);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-md w-full p-6 border border-[#ece7de] shadow-2xl animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg font-bold text-[#1c1917]">Detailed Volume Breakdown</h2>
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-[#faf8f5] flex items-center justify-center text-[#78716c]"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 my-4">
          {stats.sizeBreakdown.map(entry => {
            const itemsOfSize = items.filter(i => Number(i.size) === entry.size);
            return (
              <div key={entry.size} className="p-3 bg-[#faf8f5] border border-[#ece7de] rounded-xl space-y-2">
                <div className="flex items-center justify-between font-bold text-sm text-[#1c1917]">
                  <span>{entry.size} mL Bottles</span>
                  <span>{entry.count} total ({entry.pct}%)</span>
                </div>
                <div className="text-xs text-[#78716c]">
                  {itemsOfSize.map(it => `${it.name} (${it.stock})`).join(', ')}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="w-full py-2.5 rounded-xl bg-[#1c1917] text-white text-xs font-semibold"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
