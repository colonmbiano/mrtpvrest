"use client";

import { usePOSStore } from "@/store/usePOSStore";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, SunMoon, ShoppingCart, User, Store, LogOut, ChevronRight, Search, Plus, Minus, X, Trash2, Receipt, Settings } from "lucide-react";
import TicketConfigModal from "@/components/modals/TicketConfigModal";

export default function POS_SPA() {
  const { isAuthenticated, login, theme, setTheme } = usePOSStore() as any;
  const [mounted, setMounted] = useState(false);
  const [showTicketConfig, setShowTicketConfig] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  if (!mounted) return null;

  return (
    <div className="w-full h-screen bg-bgApp text-tx-main flex flex-col font-sans overflow-hidden">
      <AnimatePresence mode="wait">
        {!isAuthenticated ? (
          <LoginScreen key="login" />
        ) : (
          <MainPOS key="pos" onOpenTickets={() => setShowTicketConfig(true)} />
        )}
      </AnimatePresence>
      <TicketConfigModal isOpen={showTicketConfig} onClose={() => setShowTicketConfig(false)} />
    </div>
  );
}

function LoginScreen() {
  const { login, theme, setTheme } = usePOSStore();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const themes = [
    { id: 'dark', label: 'Dark Inmersivo', color: '#7c3aed' },
    { id: 'concepto-1', label: 'Teal Moderno', color: '#34d399' },
    { id: 'concepto-2', label: 'Indigo Urbano', color: '#818cf8' },
    { id: 'concepto-3', label: 'Emerald Minimal', color: '#10b981' },
    { id: 'naranja', label: 'Naranja Corp', color: '#ea580c' },
    { id: 'amarillo', label: 'Alta Visibilidad', color: '#ca8a04' },
  ];

  const handlePin = (n: string) => {
    if (pin.length < 4) setPin(p => p + n);
  };

  const handleClear = () => setPin("");

  const handleSubmit = async () => {
    const success = await login(pin);
    if (success) {
      setError(false);
    } else {
      setError(true);
      setPin("");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center justify-center w-full h-full p-4"
    >
      <div className="flex gap-4 mb-8">
        {themes.map(t => (
          <button 
            key={t.id} 
            onClick={() => setTheme(t.id)}
            className={`w-10 h-10 rounded-full border-2 transition-all ${theme === t.id ? 'border-accent scale-110' : 'border-bd-main hover:scale-105'}`}
            style={{ backgroundColor: t.color }}
            title={t.label}
          />
        ))}
      </div>

      <div className="glass-panel p-8 rounded-[2rem] w-full max-w-sm flex flex-col items-center">
        <Lock className="w-12 h-12 text-accent mb-4" />
        <h2 className="text-2xl font-black mb-6">Acceso TPV</h2>

        <div className="flex gap-4 mb-8 h-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full transition-all ${i < pin.length ? 'bg-accent pos-shadow' : 'bg-surf-3'}`} />
          ))}
        </div>

        {error && <p className="text-err text-sm font-bold mb-4">PIN Incorrecto</p>}

        <div className="grid grid-cols-3 gap-4 w-full">
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} onClick={() => handlePin(n.toString())} className="h-16 rounded-2xl bg-surf-2 hover:bg-surf-3 text-xl font-bold transition-colors">
              {n}
            </button>
          ))}
          <button onClick={handleClear} className="h-16 rounded-2xl bg-surf-2 hover:bg-surf-3 text-tx-mut font-bold transition-colors">C</button>
          <button onClick={() => handlePin('0')} className="h-16 rounded-2xl bg-surf-2 hover:bg-surf-3 text-xl font-bold transition-colors">0</button>
          <button onClick={handleSubmit} className="h-16 rounded-2xl bg-accent text-white font-bold transition-colors pos-shadow flex items-center justify-center">
            <ChevronRight />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function MainPOS({ onOpenTickets }: { onOpenTickets: () => void }) {
  const { logout } = usePOSStore();
  
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full w-full">
      {/* Sidebar */}
      <aside className="w-20 lg:w-24 bg-surf-1 border-r border-bd-main flex flex-col items-center py-6 gap-8 z-10 shrink-0">
        <div className="w-12 h-12 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
          <Store className="w-6 h-6" />
        </div>
        
        <nav className="flex-1 flex flex-col gap-6 w-full items-center">
          <button className="p-3 rounded-2xl bg-accent text-white pos-shadow">
            <ShoppingCart className="w-6 h-6" />
          </button>
          <button className="p-3 rounded-2xl text-tx-mut hover:text-tx-main hover:bg-surf-2 transition-all">
            <Receipt className="w-6 h-6" />
          </button>
          <button className="p-3 rounded-2xl text-tx-mut hover:text-tx-main hover:bg-surf-2 transition-all">
            <User className="w-6 h-6" />
          </button>
        </nav>

        <button onClick={onOpenTickets} className="p-3 rounded-2xl text-tx-mut hover:text-accent hover:bg-accent/10 transition-all">
          <Settings className="w-6 h-6" />
        </button>

        <button onClick={logout} className="p-3 rounded-2xl text-err/70 hover:text-err hover:bg-err/10 transition-all">
          <LogOut className="w-6 h-6" />
        </button>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full bg-bgApp relative">
        <POSGrid />
      </div>

      {/* Cart Drawer */}
      <div className="w-full lg:w-[400px] h-full bg-surf-1 border-l border-bd-main shrink-0 flex flex-col">
        <CartPanel />
      </div>
    </motion.div>
  );
}

const mockProducts = [
  { id: '1', name: 'Burger Clásica', price: 120, category: 'Burgers' },
  { id: '2', name: 'Doble Queso', price: 150, category: 'Burgers', isPromo: true },
  { id: '3', name: 'Papas Fritas', price: 60, category: 'Sides' },
  { id: '4', name: 'Refresco Cola', price: 35, category: 'Drinks' },
  { id: '5', name: 'Malteada Fresa', price: 80, category: 'Drinks' },
];

function POSGrid() {
  const { addItemToActiveTicket } = usePOSStore();
  const [search, setSearch] = useState("");

  const filtered = mockProducts.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-black italic">TPV</h1>
        <div className="relative w-64">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-tx-mut" />
          <input 
            type="text" 
            placeholder="Buscar producto..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-surf-2 border border-bd-main rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-accent transition-colors text-tx-main"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-20 scrollbar-hide">
        {filtered.map(p => (
          <motion.div 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            key={p.id} 
            onClick={() => addItemToActiveTicket(p)}
            className="bg-surf-1 border border-bd-main rounded-[1.5rem] p-4 cursor-pointer relative overflow-hidden group hover:border-accent/50 transition-colors"
          >
            {p.isPromo && (
              <span className="absolute top-0 right-0 bg-accent text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">
                PROMO
              </span>
            )}
            <div className="w-full aspect-square bg-surf-2 rounded-xl mb-4 flex items-center justify-center text-4xl">
              🍔
            </div>
            <h3 className="font-bold text-sm mb-1 line-clamp-1">{p.name}</h3>
            <p className="text-accent font-black">${p.price.toFixed(2)}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function CartPanel() {
  const { tickets, activeTicketId, setActiveTicket, addTicket, removeTicket, updateItemQuantity, clearActiveTicket } = usePOSStore();
  
  const activeTicket = tickets.find(t => t.id === activeTicketId) || tickets[0]!;
  const total = activeTicket.items.reduce((acc: number, item) => acc + (item.price * item.quantity), 0);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Tabs */}
      <div className="flex items-center overflow-x-auto scrollbar-hide border-b border-bd-main p-2 gap-2 shrink-0">
        {tickets.map(t => (
          <div key={t.id} className="relative group flex shrink-0">
            <button
              onClick={() => setActiveTicket(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTicketId === t.id ? 'bg-accent text-white pos-shadow' : 'bg-surf-2 text-tx-mut hover:bg-surf-3'}`}
            >
              {t.name}
            </button>
            {tickets.length > 1 && (
              <button 
                onClick={(e) => { e.stopPropagation(); removeTicket(t.id); }}
                className="absolute -top-2 -right-2 w-5 h-5 bg-err text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <button onClick={addTicket} className="w-10 h-10 rounded-xl bg-surf-2 text-tx-main flex items-center justify-center hover:bg-surf-3 shrink-0">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-hide">
        <AnimatePresence>
          {activeTicket!.items.map(item => (
            <motion.div 
              key={item.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-surf-2 rounded-[1.5rem] p-3 flex items-center justify-between border border-bd-main"
            >
              <div className="flex-1 min-w-0 pr-4">
                <p className="font-bold text-sm truncate">{item.name}</p>
                <p className="text-accent text-xs font-black">${(item.price * item.quantity).toFixed(2)}</p>
              </div>
              
              <div className="flex items-center bg-surf-1 rounded-xl border border-bd-main">
                <button onClick={() => updateItemQuantity(item.id, -1)} className="p-2 text-tx-mut hover:text-tx-main">
                  {item.quantity === 1 ? <Trash2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                </button>
                <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                <button onClick={() => updateItemQuantity(item.id, 1)} className="p-2 text-tx-mut hover:text-tx-main">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {activeTicket!.items.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-tx-mut opacity-50">
            <ShoppingCart className="w-12 h-12 mb-4" />
            <p className="font-bold">Ticket vacío</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-6 bg-surf-2 border-t border-bd-main shrink-0">
        <div className="flex justify-between mb-4">
          <span className="text-tx-mut font-bold">Total</span>
          <span className="text-2xl font-black italic">${total.toFixed(2)}</span>
        </div>
        <div className="flex gap-3">
          <button onClick={clearActiveTicket} className="p-4 rounded-2xl bg-surf-3 hover:bg-surf-1 text-tx-main font-bold border border-bd-main transition-colors flex items-center justify-center">
            <Trash2 className="w-5 h-5" />
          </button>
          <button className="flex-1 p-4 rounded-2xl bg-accent text-white font-black italic pos-shadow transition-transform hover:scale-[1.02] active:scale-[0.98]">
            COBRAR
          </button>
        </div>
      </div>
    </div>
  );
}
