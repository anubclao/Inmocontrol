import { useState } from 'react';
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2, LayoutDashboard, Users, Wallet, FileText, Bell, Settings, LogOut,
  Search, Menu, X, ClipboardCheck, Shield, FileSignature, Receipt,
} from 'lucide-react';
import { Button, Card, cn } from '../../shared/ui';
import { Role } from '../auth/permissions';

export type TabId = 'dashboard' | 'properties' | 'tenants' | 'contracts' | 'billing' | 'financial' | 'reports' | 'alerts' | 'settings';

export interface AppShellProps {
  user: { displayName?: string; email?: string } | null;
  role: Role | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeTab: TabId;
  onTabChange: (t: TabId) => void;
  onLogout: () => void;
  onRoleChange: (r: Role) => void;
  children: React.ReactNode;
  toast: { message: string; type: 'success' | 'error' } | null;
}

const SIDEBAR_ITEMS: { id: TabId; label: string; icon: any; roles: Role[] }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'propietario', 'inquilino'] },
  { id: 'properties', label: 'Propiedades', icon: Building2, roles: ['admin', 'propietario'] },
  { id: 'tenants', label: 'Arrendatarios', icon: Users, roles: ['admin'] },
  { id: 'contracts', label: 'Contratos', icon: FileSignature, roles: ['admin', 'propietario'] },
  { id: 'billing', label: 'Billing', icon: Receipt, roles: ['admin', 'propietario'] },
  { id: 'financial', label: 'Finanzas', icon: Wallet, roles: ['admin', 'propietario', 'inquilino'] },
  { id: 'reports', label: 'Reportes', icon: FileText, roles: ['admin', 'propietario'] },
  { id: 'alerts', label: 'Alertas', icon: Bell, roles: ['admin', 'propietario'] },
];

export function AppShell({
  user, role, searchQuery, onSearchChange, activeTab, onTabChange,
  onLogout, onRoleChange, children, toast,
}: AppShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const visibleItems = SIDEBAR_ITEMS.filter((item) => item.roles.includes(role || 'inquilino'));
  const canViewSettings = role === 'admin';

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-8 left-1/2 z-[200] px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 border ${
              toast.type === 'success' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-red-600 border-red-500 text-white'
            }`}
          >
            {toast.type === 'success' ? <ClipboardCheck className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
            <span className="font-bold text-sm tracking-wide">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[140] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-[150] w-64 bg-slate-900 text-white flex flex-col transition-transform duration-300 transform lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Inmocontrol</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { onTabChange(item.id); setIsSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === item.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          {canViewSettings && (
            <button
              onClick={() => { onTabChange('settings'); setIsSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'settings' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Settings className="w-4 h-4" />
              Configuración
            </button>
          )}
          <div className="mt-4 pt-4 border-t border-slate-800">
            <button onClick={onLogout} className="flex items-center gap-3 px-4 py-3 w-full text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all group">
              <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium">Cerrar Sesión</span>
            </button>

            {user?.email === 'tecnowebiacol@gmail.com' && (
              <div className="px-4 py-4 border-t border-slate-800 mt-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Simular Rol (Admin Only)</p>
                <div className="flex flex-wrap gap-2">
                  {(['admin', 'propietario', 'inquilino'] as Role[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => onRoleChange(r)}
                      className={`px-2 py-1 text-[10px] rounded font-bold uppercase transition-colors ${role === r ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden w-full">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shrink-0">
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
              <Menu className="w-6 h-6" />
            </button>
            <div className="relative w-full hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar inmueble, propietario o inquilino..."
                className="w-full pl-10 pr-4 py-2 bg-slate-100 border-transparent rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 lg:gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              Sistema Online
            </div>
            <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
              {user?.displayName?.split(' ').map((n) => n[0]).join('').slice(0, 2) || 'U'}
            </div>
          </div>
        </header>

        <div className="p-4 bg-white border-b border-slate-200 sm:hidden">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar..."
              className="w-full pl-10 pr-4 py-2 bg-slate-100 border-transparent rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
