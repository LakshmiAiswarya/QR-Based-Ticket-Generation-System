import React, { useState, useEffect, useMemo } from 'react';
import { Home, History, Wifi, WifiOff, Bus, ShieldCheck, ScanSearch, Cpu, Ticket, RadioTower, CheckCircle2, X } from 'lucide-react';
import { authService } from '../services/authService';
import { storageService } from '../services/storageService';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'home' | 'history' | 'admin';
  onTabChange: (tab: 'home' | 'history' | 'admin') => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  // Task 17.3: Separate reconnected toast from persistent offline badge
  const [showReconnectedToast, setShowReconnectedToast] = useState(false);
  const conductor = authService.getConductor();
  const shift = storageService.getShift();

  const tabMeta = useMemo(() => {
    if (activeTab === 'home') {
      return {
        title: 'Live Issuance',
        subtitle: 'Aadhaar-led ticket issue with AI validation',
        icon: ScanSearch
      };
    }

    if (activeTab === 'history') {
      return {
        title: 'Audit Trail',
        subtitle: 'Shift decisions, denied attempts, and fare history',
        icon: Ticket
      };
    }

    return {
      title: 'Control Desk',
      subtitle: 'Operational summaries for conductor performance',
      icon: Cpu
    };
  }, [activeTab]);

  const HeaderIcon = tabMeta.icon;

  useEffect(() => {
    // Task 17.1: handleOnline triggers 5-second auto-dismiss reconnected toast only
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnectedToast(true);
      setTimeout(() => setShowReconnectedToast(false), 5000);
    };
    // Task 17.1: handleOffline sets isOnline false with NO auto-dismiss — badge persists
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-brand-cream relative overflow-hidden font-sans">
      {/* ── Reconnection toast: compact, bottom-anchored, auto-dismisses ── */}
      {showReconnectedToast && (
        <div className="fixed bottom-[88px] left-1/2 -translate-x-1/2 z-[110] w-[calc(100%-2.5rem)] max-w-[380px] pointer-events-none">
          <div
            className="flex items-center gap-3 pr-2 pl-4 py-3 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-md animate-in slide-in-from-bottom-3 duration-300"
            style={{
              background: 'rgba(255,255,255,0.97)',
              borderLeft: '3px solid #2E7D32',
              minHeight: '52px',
            }}
          >
            <CheckCircle2 size={16} className="text-brand-green shrink-0" />
            <p className="flex-1 text-[11px] font-semibold text-brand-dark leading-snug">
              Back online — syncing records
            </p>
          </div>
        </div>
      )}

      {/* Professional Header */}
      <header className="bg-brand-red p-6 pt-12 text-white relative overflow-hidden rounded-b-[3rem] shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,214,0,0.18),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_45%)]" />
        <div className="absolute top-4 left-0 w-full overflow-hidden pointer-events-none opacity-10">
          <Bus size={32} className="animate-bus-drive" />
        </div>

        <div className="absolute -right-8 top-10 w-28 h-28 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute left-8 bottom-6 w-24 h-24 rounded-full bg-brand-yellow/20 blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-1 bg-white rounded-2xl shadow-lg border border-brand-yellow flex items-center justify-center w-14 h-14">
              <Bus size={36} className="text-brand-red animate-logo-shimmer" />
            </div>
            <div>
              <h1 className="font-black text-xl tracking-tighter leading-none uppercase">AP State RTC</h1>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-brand-yellow animate-pulse"></span>
                <p className="text-[10px] text-brand-yellow font-black uppercase tracking-widest">AI Ticket Operations</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Task 17.2: Persistent offline badge — only shown when offline, never auto-dismisses */}
            {!isOnline && (
              <div className="flex items-center gap-1.5 bg-white/20 text-white px-3 py-1.5 rounded-full text-[9px] font-black uppercase border border-white/30 animate-in fade-in duration-300">
                <WifiOff size={12} /> Offline
              </div>
            )}
            <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm border border-white/20">
              <ShieldCheck size={24} className="text-brand-yellow" />
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-white/70">{tabMeta.title}</p>
            <p className="text-sm font-bold text-white/95 mt-1 leading-relaxed">{tabMeta.subtitle}</p>
          </div>
          <div className="shrink-0 bg-white/12 border border-white/15 rounded-2xl p-3 backdrop-blur-sm">
            <HeaderIcon size={20} className="text-brand-yellow" />
          </div>
        </div>
      </header>

      <div className="px-6 -mt-5 relative z-20">
        <div className="rounded-[2rem] border border-white/70 bg-[rgba(255,255,255,0.92)] backdrop-blur-md shadow-[0_18px_45px_rgba(0,0,0,0.08)] p-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-[1.3rem] bg-brand-cream px-3 py-3 border border-black/5">
              <p className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400">Conductor</p>
              <p className="text-[11px] font-black text-brand-dark mt-1 truncate">{conductor?.employeeId || 'UNASSIGNED'}</p>
            </div>
            <div className="rounded-[1.3rem] bg-brand-cream px-3 py-3 border border-black/5">
              <p className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400">Shift Bus</p>
              <p className="text-[11px] font-black text-brand-dark mt-1 truncate">{shift?.vehicleNo || 'NOT STARTED'}</p>
            </div>
            <div className="rounded-[1.3rem] bg-brand-dark px-3 py-3 border border-brand-dark/20 text-white">
              <div className="flex items-center gap-1.5">
                <RadioTower size={11} className={isOnline ? 'text-brand-yellow' : 'text-white/80'} />
                <p className="text-[8px] font-black uppercase tracking-[0.18em] text-white/70">System</p>
              </div>
              <p className="text-[11px] font-black mt-1">{isOnline ? 'AI READY' : 'LOCAL MODE'}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-gray-500">
            <ScanSearch size={12} className="text-brand-red" />
            <span>Aadhaar scan, AI OCR, biometric checks, and fare audit in one conductor workflow.</span>
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto pb-20 relative">
        {children}
      </main>

      {/* Bottom Nav — stays within the app column */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[448px] bg-[rgba(255,255,255,0.96)] backdrop-blur-md border-t border-gray-100 px-4 py-2 flex justify-between items-center z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
        <button onClick={() => onTabChange('home')} className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl transition-all ${activeTab === 'home' ? 'bg-brand-red text-white shadow-md' : 'text-gray-400 hover:text-brand-red'}`}>
          <Home size={20} />
          <span className="text-[7px] font-black uppercase tracking-[0.2em]">Issue</span>
        </button>
        <button onClick={() => onTabChange('history')} className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl transition-all ${activeTab === 'history' ? 'bg-brand-red text-white shadow-md' : 'text-gray-400 hover:text-brand-red'}`}>
          <History size={20} />
          <span className="text-[7px] font-black uppercase tracking-[0.2em]">Audit</span>
        </button>
        <button onClick={() => onTabChange('admin')} className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl transition-all ${activeTab === 'admin' ? 'bg-brand-red text-white shadow-md' : 'text-gray-400 hover:text-brand-red'}`}>
          <ShieldCheck size={20} />
          <span className="text-[7px] font-black uppercase tracking-[0.2em]">Admin</span>
        </button>
      </nav>

      {/* Footer Branding Tag */}
      <div className="absolute bottom-1 right-6 pointer-events-none opacity-20">
         <ShieldCheck size={24} className="text-brand-red" />
      </div>
    </div>
  );
};

export default Layout;
