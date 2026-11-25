import React, { useEffect, useState, useCallback } from 'react';
import { storageService } from '../services/storageService';
import { authService } from '../services/authService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  IndianRupee, HeartHandshake, LogOut, ShieldCheck, Bus, BadgeCheck,
  FileSpreadsheet, Printer, Share2, Calendar, RefreshCcw, Timer,
  TrendingUp, Clock, CheckCircle2, XCircle, Banknote, PowerOff, ArrowLeft
} from 'lucide-react';
import { DailyStats, ShiftStats, Conductor, ShiftData } from '../types';

// Task 15.3: Elapsed time formatter — always returns HH:MM
const formatElapsed = (startTime: number): string => {
  const ms = Math.max(0, Date.now() - startTime);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

interface DashboardProps {
  showToast?: (message: string, tone?: 'error' | 'success' | 'info') => void;
}

const Dashboard: React.FC<DashboardProps> = ({ showToast }) => {
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [shiftStats, setShiftStats] = useState<ShiftStats | null>(null);
  const [conductor, setConductor] = useState<Conductor | null>(null);
  const [shift, setShift] = useState<ShiftData | null>(null);
  const [shiftHistory, setShiftHistory] = useState<ShiftData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Task 15.1: Today count and elapsed time state
  const [todayCount, setTodayCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState('--:--');
  // Task 16.1: Shift summary modal state
  const [showShiftSummary, setShowShiftSummary] = useState(false);

  const loadData = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => {
      const stats = storageService.getCurrentShiftStats();
      setDailyStats(storageService.getDailyStats());
      setShiftStats(stats);
      setConductor(authService.getConductor());
      setShift(storageService.getShift());
      setShiftHistory(storageService.getShiftHistory());

      // Task 15.2: Compute today count
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const count = storageService.getRecords()
        .filter(r => r.status === 'SUCCESS' && r.timestamp >= todayStart.getTime()).length;
      setTodayCount(count);

      // Update elapsed time immediately on load
      if (stats?.startTime) {
        setElapsedTime(formatElapsed(stats.startTime));
      } else {
        setElapsedTime('--:--');
      }

      setIsRefreshing(false);
    }, 600);
  }, []);

  useEffect(() => {
    loadData();
    storageService.cleanupOldConductorData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Task 15.4: 60-second interval to update elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      if (shiftStats?.startTime) {
        setElapsedTime(formatElapsed(shiftStats.startTime));
      } else {
        setElapsedTime('--:--');
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [shiftStats?.startTime]);

  const handleLogout = () => {
    authService.logout();
    storageService.clearShift();
    window.location.reload();
  };

  // Task 16.5: Confirm end shift
  const handleConfirmEndShift = () => {
    authService.logout();
    storageService.clearShift();
    window.location.reload();
  };

  const handlePrint = () => window.print();
  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'APSRTC Performance Audit',
        text: `Performance for ${conductor?.employeeId}: ${shiftStats?.ticketsIssued || 0} tickets verified in current session.`
      });
    }
  };

  const totalLifetimeSavings = dailyStats.reduce((acc, curr) => acc + curr.totalSavings, 0);

  return (
    <div className="p-6 flex flex-col gap-6 pb-32 font-sans no-print-padding">

      {/* Task 16.4: Shift Summary Modal */}
      {showShiftSummary && (
        <div className="fixed inset-0 z-[100] bg-brand-dark/80 backdrop-blur-sm flex items-end justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="bg-brand-red p-6 text-white relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,214,0,0.2),transparent_40%)]" />
              <div className="relative z-10">
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-brand-yellow mb-1">Shift Summary</p>
                <h3 className="text-2xl font-black tracking-tighter italic">{shift?.vehicleNo || 'N/A'}</h3>
                <p className="text-[10px] font-black text-white/70 uppercase mt-1">Conductor: {conductor?.employeeId || 'N/A'}</p>
              </div>
              <Bus size={80} className="absolute -right-4 -bottom-4 text-white/10 rotate-12" />
            </div>

            {/* Stats Grid */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-brand-cream rounded-2xl p-4 border border-brand-yellow/20">
                  <p className="text-[8px] font-black text-gray-400 uppercase mb-1">Total Issued</p>
                  <p className="text-2xl font-black text-brand-dark">{shiftStats?.ticketsIssued || 0}</p>
                </div>
                <div className="bg-brand-cream rounded-2xl p-4 border border-brand-yellow/20">
                  <p className="text-[8px] font-black text-gray-400 uppercase mb-1">Shift Duration</p>
                  <p className="text-2xl font-black text-brand-dark font-mono">{elapsedTime}</p>
                </div>
                <div className="bg-emerald-50 rounded-2xl p-4 border border-brand-green/20">
                  <p className="text-[8px] font-black text-brand-green uppercase mb-1">Free Tickets</p>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-brand-green" />
                    <p className="text-xl font-black text-brand-green">{shiftStats?.freeCount || 0}</p>
                  </div>
                </div>
                <div className="bg-rose-50 rounded-2xl p-4 border border-brand-red/20">
                  <p className="text-[8px] font-black text-brand-red uppercase mb-1">Paid Tickets</p>
                  <div className="flex items-center gap-2">
                    <Banknote size={16} className="text-brand-red" />
                    <p className="text-xl font-black text-brand-red">{shiftStats?.paidCount || 0}</p>
                  </div>
                </div>
                <div className="bg-brand-cream rounded-2xl p-4 border border-brand-yellow/20">
                  <p className="text-[8px] font-black text-gray-400 uppercase mb-1">Collections</p>
                  <div className="flex items-center gap-1">
                    <IndianRupee size={14} className="text-brand-dark" />
                    <p className="text-xl font-black text-brand-dark">{shiftStats?.totalCollections || 0}</p>
                  </div>
                </div>
                <div className="bg-brand-cream rounded-2xl p-4 border border-brand-yellow/20">
                  <p className="text-[8px] font-black text-gray-400 uppercase mb-1">Welfare Savings</p>
                  <div className="flex items-center gap-1">
                    <IndianRupee size={14} className="text-brand-green" />
                    <p className="text-xl font-black text-brand-green">{shiftStats?.totalSavings || 0}</p>
                  </div>
                </div>
              </div>

              {/* Task 16.5 + 16.6: Action buttons */}
              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={handleConfirmEndShift}
                  className="w-full bg-brand-red text-white font-black py-4 rounded-2xl uppercase text-xs flex items-center justify-center gap-2 shadow-lg"
                >
                  <PowerOff size={16} /> Confirm End Shift
                </button>
                <button
                  onClick={() => setShowShiftSummary(false)}
                  className="w-full bg-white text-brand-dark border-2 border-gray-100 font-black py-4 rounded-2xl uppercase text-xs flex items-center justify-center gap-2"
                >
                  <ArrowLeft size={16} /> Continue Shift
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-start no-print">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-brand-dark tracking-tighter uppercase leading-none">Conductor Hub</h2>
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-brand-green" />
            <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest">STAFF: {conductor?.employeeId}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {/* Task 3.1/3.2: animate-spin moved to icon only, button keeps hover:bg-yellow-400 */}
          <button
            onClick={loadData}
            className="bg-brand-yellow p-3 rounded-2xl text-brand-dark shadow-sm border border-brand-yellow/20 hover:bg-yellow-400 transition-colors"
          >
            <RefreshCcw size={20} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleShare} className="bg-white p-3 rounded-2xl text-gray-400 shadow-sm border border-gray-100 hover:text-brand-red transition-colors">
            <Share2 size={20} />
          </button>
          {/* Task 16.2: End Shift button — visually distinct from logout */}
          <button
            onClick={() => setShowShiftSummary(true)}
            className="bg-brand-red text-white p-3 rounded-2xl shadow-sm hover:bg-red-700 transition-colors"
            title="End Shift"
          >
            <PowerOff size={20} />
          </button>
          <button onClick={handleLogout} className="bg-white p-3 rounded-2xl text-gray-400 shadow-sm border border-gray-100 hover:text-brand-red transition-colors">
            <LogOut size={22} />
          </button>
        </div>
      </div>

      {/* Current Active Shift Card */}
      <div className="bg-brand-dark p-6 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden animate-in slide-in-from-bottom duration-500">
        <div className="relative z-10 space-y-4">
          <div className="flex justify-between items-center border-b border-white/10 pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"/>
                <p className="text-[8px] font-black uppercase tracking-[0.2em] opacity-60">Live Session Stats</p>
              </div>
              <h3 className="text-3xl font-black tracking-tighter mt-1 italic">{shift?.vehicleNo || "N/A"}</h3>
            </div>
            <div className="text-right">
              <p className="text-[8px] font-black uppercase opacity-60">Started At</p>
              <div className="flex items-center gap-1 justify-end">
                <Timer size={10} className="text-brand-yellow" />
                <p className="text-xs font-bold font-mono">
                  {shiftStats?.startTime ? new Date(shiftStats.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}
                </p>
              </div>
              {/* Task 15.6: Elapsed time display */}
              <div className="flex items-center gap-1 justify-end mt-1">
                <Clock size={10} className="text-brand-yellow/70" />
                <p className="text-[9px] font-mono font-bold text-white/70">{elapsedTime}</p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
             <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                <p className="text-[7px] font-black uppercase opacity-60 mb-1">Session Free</p>
                <div className="flex items-center gap-2">
                   <BadgeCheck size={16} className="text-brand-green" />
                   <p className="text-xl font-black">{shiftStats?.freeCount || 0}</p>
                </div>
             </div>
             <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                <p className="text-[7px] font-black uppercase opacity-60 mb-1">Collections</p>
                <div className="flex items-center gap-2">
                   <IndianRupee size={16} className="text-brand-yellow" />
                   <p className="text-xl font-black">{shiftStats?.totalCollections || 0}</p>
                </div>
             </div>
             {/* Task 15.5: Today count prominently displayed */}
             <div className="bg-brand-yellow/10 p-3 rounded-2xl border border-brand-yellow/20">
                <p className="text-[7px] font-black uppercase opacity-60 mb-1 text-brand-yellow">Today</p>
                <div className="flex items-center gap-2">
                   <TrendingUp size={16} className="text-brand-yellow" />
                   <p className="text-xl font-black text-brand-yellow">{todayCount}</p>
                </div>
             </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
        <Bus size={120} className="absolute -bottom-4 -right-4 text-white/5 rotate-12 pointer-events-none" />
      </div>

      {/* Lifetime Stats Card */}
      <div className="bg-brand-red p-6 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden group">
        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Lifetime Welfare Impact</p>
          <div className="flex items-center gap-1 mt-2">
            <IndianRupee size={32} className="text-brand-yellow" />
            <p className="text-4xl font-black tracking-tighter text-white">{totalLifetimeSavings.toLocaleString()}</p>
          </div>
          <div className="flex gap-2 mt-4 no-print">
            {/* Task 5.5: Pass onEmpty callback to export functions */}
            <button
              onClick={() => storageService.downloadCSV(() => showToast?.('No records to export', 'info'))}
              className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/20 transition-all flex items-center gap-2"
            >
               <FileSpreadsheet size={14} /> Full Export
            </button>
            <button onClick={handlePrint} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/20 transition-all flex items-center gap-2">
               <Printer size={14} /> Print Stats
            </button>
          </div>
        </div>
        <HeartHandshake size={140} className="absolute -right-4 -bottom-6 opacity-10 rotate-12 pointer-events-none" />
      </div>

      {/* Monthly Shift History Section */}
      <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
           <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
             <Calendar size={14} className="text-brand-red" /> Monthly Shift Records
           </h3>
           <button
             onClick={() => storageService.downloadShiftHistoryCSV(() => showToast?.('No shift history to export', 'info'))}
             className="text-[8px] font-black text-brand-red uppercase border border-brand-red/20 px-3 py-1 rounded-full no-print hover:bg-brand-red hover:text-white transition-colors"
           >
             Export History
           </button>
        </div>
        {/* Task 20.2: Improved empty state for shift history */}
        {shiftHistory.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Bus size={40} className="text-gray-200" />
            <p className="text-[10px] font-black text-gray-300 uppercase">No prior shifts on this device</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="py-3 text-[8px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                  <th className="py-3 text-[8px] font-black text-gray-400 uppercase tracking-widest">Bus</th>
                  <th className="py-3 text-[8px] font-black text-gray-400 uppercase tracking-widest">Driver</th>
                </tr>
              </thead>
              <tbody>
                {shiftHistory.slice().reverse().map((s, idx) => (
                  <tr key={idx} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="py-3 text-[10px] font-bold text-brand-dark">{new Date(s.startTime).toLocaleDateString()}</td>
                    <td className="py-3 text-[10px] font-black text-brand-red uppercase">{s.vehicleNo}</td>
                    <td className="py-3 text-[10px] font-bold text-gray-400">{s.driverId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Analytics Chart */}
      <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
           <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Audit Analytics</h3>
        </div>
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyStats}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="date" fontSize={9} axisLine={false} tickLine={false} />
              <YAxis fontSize={9} axisLine={false} tickLine={false} />
              <Tooltip 
                cursor={{fill: '#fcfcfc'}} 
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.05)', fontSize: '12px' }} 
              />
              <Bar dataKey="freeTicketsCount" fill="#D32F2F" radius={[6, 6, 0, 0]} name="Free" />
              <Bar dataKey="paidTicketsCount" fill="#1A1A1A" radius={[6, 6, 0, 0]} name="Paid" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
