import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from './components/Layout';
import Scanner from './components/Scanner';
import Ticket from './components/Ticket';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import ShiftSetup from './components/ShiftSetup';
import { storageService } from './services/storageService';
import { authService } from './services/authService';
import { hasMinimumIssuableIdentity } from './services/aadhaarValidationService';
import { AadharData, TicketRecord, ShiftData } from './types';
import { Clock, Zap, FileSpreadsheet, Bus, XCircle, FileSearch, X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

type ToastTone = 'error' | 'success' | 'info';
type Toast = { id: number; message: string; tone: ToastTone };

// Task 2.1: Guaranteed non-undefined, non-empty key for scan queue items
const getScanQueueKey = (item: AadharData): string => {
  const id = item.id;
  if (id) return id;
  return `${item.timestamp ?? Date.now()}-${item.name || 'unknown'}`;
};

// ─── Premium Toast Card ────────────────────────────────────────────────────────
// Compact, icon-led, bottom-anchored. No uppercase shouting. Subtle border-left
// accent instead of full background fill so it never feels like a modal.
interface ToastCardProps {
  toast: Toast;
  onDismiss: (id: number) => void;
}

const TOAST_META = {
  error:   { Icon: AlertCircle,   accent: '#D32F2F', bg: 'rgba(255,255,255,0.97)', text: '#1A1A1A', sub: '#D32F2F' },
  success: { Icon: CheckCircle2,  accent: '#2E7D32', bg: 'rgba(255,255,255,0.97)', text: '#1A1A1A', sub: '#2E7D32' },
  info:    { Icon: Info,          accent: '#FFD600', bg: 'rgba(255,255,255,0.97)', text: '#1A1A1A', sub: '#7A6500' },
} as const;

const ToastCard: React.FC<ToastCardProps> = ({ toast, onDismiss }) => {
  const meta = TOAST_META[toast.tone];
  const { Icon } = meta;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-center gap-3 pr-2 pl-4 py-3 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-md animate-in slide-in-from-bottom-3 duration-300 ease-out"
      style={{
        background: meta.bg,
        borderLeft: `3px solid ${meta.accent}`,
        minHeight: '52px',
      }}
    >
      <Icon size={16} style={{ color: meta.accent, flexShrink: 0 }} />
      <p
        className="flex-1 text-[11px] font-semibold leading-snug"
        style={{ color: meta.text }}
      >
        {toast.message}
      </p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl transition-colors hover:bg-black/5 shrink-0"
        aria-label="Dismiss"
        style={{ color: '#9CA3AF' }}
      >
        <X size={13} />
      </button>
    </div>
  );
};

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [shiftData, setShiftData] = useState<ShiftData | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'admin'>('home');
  const [scanQueue, setScanQueue] = useState<AadharData[]>([]);
  const [viewingTicket, setViewingTicket] = useState<AadharData | null>(null);
  const [isAppReady, setIsAppReady] = useState(false);
  // Task 8.1: Replace single toast with array queue
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Task 14.1: History filter and search state
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'SUCCESS' | 'DENIED'>('ALL');
  const [historySearch, setHistorySearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setIsAppReady(true), 1200);

    // SECURITY/OFFLINE DEFAULT:
    // Prevent Aadhaar upload/scan from triggering cloud ML evaluation when the
    // operator didn't explicitly switch to LIVE for this session.
    const savedMode = localStorage.getItem('app_mode');
    if (savedMode !== 'LIVE' && savedMode !== 'OFFLINE') {
      localStorage.setItem('app_mode', 'OFFLINE');
    }

    // SECURITY: Force a fresh session on reload without discarding local audit history.
    authService.logout({ purgeConductorData: false });
    setIsLoggedIn(false);
    setShiftData(null);

    return () => clearTimeout(timer);
  }, []);

  // Sync data when login state changes to TRUE
  useEffect(() => {
    if (isLoggedIn) {
      storageService.fetchRemoteRecords();
    }
  }, [isLoggedIn]);

  // Task 8.3: Per-toast auto-dismiss with 3200ms timeout
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map(toast =>
      window.setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, 3200)
    );
    return () => timers.forEach(t => window.clearTimeout(t));
  }, [toasts.map(t => t.id).join(',')]);

  // Task 8.2: showToast prepends and caps at 3
  const showToast = useCallback((message: string, tone: ToastTone = 'error') => {
    setToasts(prev => [{ id: Date.now(), message, tone }, ...prev].slice(0, 3));
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Task 14.2: Derived filtered records with status filter + search
  const filteredRecords = useMemo(() => {
    return storageService.getRecords()
      .slice()
      .reverse()
      .filter(r => historyFilter === 'ALL' || r.status === historyFilter)
      .filter(r => !historySearch || r.name.toLowerCase().includes(historySearch.toLowerCase()));
  }, [historyFilter, historySearch, activeTab]);

  const handleDataExtracted = useCallback((data: AadharData, method: 'QR' | 'AI_OCR' | 'MANUAL_OFFLINE') => {
    const conductor = authService.getConductor();
    if (!shiftData || !conductor) return;

    const isValidIdentity =
      data.isAuthentic !== false &&
      (data.documentType ? data.documentType.toUpperCase() === 'AADHAAR' : true) &&
      hasMinimumIssuableIdentity(data);

    if (!isValidIdentity) {
      showToast(data.authenticityReason || 'Invalid document uploaded. Ticket issuance terminated.', 'error');
      return;
    }

    const ticketId = `RTC-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const isFree = data.gender === 'F' && data.isEligible;
    const usageCount = storageService.getPassengerUsageCount(data.name, data.pincode) + 1;

    const newEntry: AadharData = { 
      ...data, 
      id: ticketId,
      timestamp: Date.now(),
      vehicleNo: shiftData.vehicleNo,
      conductorId: conductor.employeeId,
      driverId: shiftData.driverId,
      usageCount
    };
    // biometric confidence may be undefined on QR/manual flows
    if (data.biometricConfidence !== undefined) {
      newEntry.biometricConfidence = data.biometricConfidence;
    }
    
    setScanQueue(prev => [newEntry, ...prev].slice(0, 10));

    let eligibilityReason = "Standard Passenger";
    if (isFree) {
      eligibilityReason = "Stree Shakti: AP Resident Female";
    } else if (data.gender === 'M') {
      eligibilityReason = "Paid: Male Passenger";
    } else if (data.gender === 'F' && !data.isEligible) {
      eligibilityReason = "Paid: Non-AP Resident";
    }

    const record: TicketRecord = {
      id: Math.random().toString(36).substr(2, 9),
      name: data.name,
      gender: data.gender,
      pincode: data.pincode,
      timestamp: Date.now(),
      ticketId: ticketId,
      status: 'SUCCESS',
      route: data.route,
      verificationMethod: method,
      syncStatus: navigator.onLine ? 'synced' : 'pending',
      passengerPhoto: data.passengerPhoto,
      biometricConfidence: data.biometricConfidence || 0,
      faceSimilarityScore: data.faceSimilarityScore || data.biometricConfidence || 0,
      face_similarity_score: data.faceSimilarityScore || data.biometricConfidence || 0,
      livenessScore: data.livenessScore || 0,
      liveness_score: data.livenessScore || 0,
      ocrAccuracy: data.ocrConfidence || (method === 'QR' ? data.qrConfidence || 0.99 : 0),
      ocr_confidence: data.ocrConfidence || (method === 'QR' ? data.qrConfidence || 0.99 : 0),
      qrValidationFlag: Boolean(data.qrValidationFlag),
      qr_validation_flag: Boolean(data.qrValidationFlag),
      documentType: data.documentType || 'AADHAAR',
      savingsAmount: isFree ? 55 : 0,
      paidAmount: isFree ? 0 : 55,
      distance: data.distanceAtIssue,
      conductorId: conductor.employeeId,
      driverId: shiftData.driverId,
      vehicleNo: shiftData.vehicleNo,
      usageCount,
      eligibilityReason,
      retryCount: data.retryCount || 0,
      retry_count: data.retryCount || 0,
      timeBetweenAttempts: data.timeBetweenAttempts || 0,
      time_between_attempts: data.timeBetweenAttempts || 0,
      deviceFingerprintEntropy: data.deviceFingerprintEntropy || 0,
      device_fingerprint_entropy: data.deviceFingerprintEntropy || 0,
      ipRiskScore: data.ipRiskScore || 0,
      ip_risk_score: data.ipRiskScore || 0,
      geoLocationShiftFlag: Boolean(data.geoLocationShiftFlag),
      geo_location_shift_flag: Boolean(data.geoLocationShiftFlag),
      eventRiskLevel: data.eventRiskLevel || 0,
      event_risk_level: data.eventRiskLevel || 0,
      mlTrustScore: data.mlTrustScore,
      mlDecision: data.mlDecision,
      mlDecisionSource: data.mlDecisionSource,
      mlDecisionReason: data.mlDecisionReason,
      mlAnomalyScore: data.mlAnomalyScore,
      mlAnomalyFlag: data.mlAnomalyFlag
    };
    
    storageService.saveRecord(record);
    setViewingTicket(newEntry);
  }, [shiftData, showToast]);

  // Handle Denial / Fraud Reports
  const handleDataDenied = useCallback((data: AadharData, reason: string) => {
    const conductor = authService.getConductor();
    if (!shiftData || !conductor) return;

    // Create a record marked as DENIED for audit
    const record: TicketRecord = {
      id: Math.random().toString(36).substr(2, 9),
      ticketId: "DENIED",
      name: data.name,
      gender: data.gender,
      pincode: data.pincode,
      timestamp: Date.now(),
      status: 'DENIED',
      route: data.route,
      verificationMethod: 'AI_OCR',
      syncStatus: navigator.onLine ? 'synced' : 'pending',
      passengerPhoto: data.passengerPhoto || data.imageProof,
      biometricConfidence: data.biometricConfidence || 0,
      faceSimilarityScore: data.faceSimilarityScore || data.biometricConfidence || 0,
      face_similarity_score: data.faceSimilarityScore || data.biometricConfidence || 0,
      livenessScore: data.livenessScore || 0,
      liveness_score: data.livenessScore || 0,
      ocrAccuracy: data.ocrConfidence || 0,
      ocr_confidence: data.ocrConfidence || 0,
      qrValidationFlag: Boolean(data.qrValidationFlag),
      qr_validation_flag: Boolean(data.qrValidationFlag),
      documentType: data.documentType || 'UNKNOWN',
      savingsAmount: 0,
      paidAmount: 0,
      conductorId: conductor.employeeId,
      driverId: shiftData.driverId,
      vehicleNo: shiftData.vehicleNo,
      eligibilityReason: `DENIED: ${reason}`,
      retryCount: data.retryCount || 0,
      retry_count: data.retryCount || 0,
      timeBetweenAttempts: data.timeBetweenAttempts || 0,
      time_between_attempts: data.timeBetweenAttempts || 0,
      deviceFingerprintEntropy: data.deviceFingerprintEntropy || 0,
      device_fingerprint_entropy: data.deviceFingerprintEntropy || 0,
      ipRiskScore: data.ipRiskScore || 0,
      ip_risk_score: data.ipRiskScore || 0,
      geoLocationShiftFlag: Boolean(data.geoLocationShiftFlag),
      geo_location_shift_flag: Boolean(data.geoLocationShiftFlag),
      eventRiskLevel: data.eventRiskLevel || 0,
      event_risk_level: data.eventRiskLevel || 0,
      mlTrustScore: data.mlTrustScore,
      mlDecision: data.mlDecision,
      mlDecisionSource: data.mlDecisionSource,
      mlDecisionReason: data.mlDecisionReason,
      mlAnomalyScore: data.mlAnomalyScore,
      mlAnomalyFlag: data.mlAnomalyFlag
    };

    storageService.saveRecord(record);
    // We don't show the ticket, but we log it.
  }, [shiftData]);

  if (!isAppReady) {
    return (
      <div className="min-h-screen bg-brand-cream flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 mb-8 relative">
          <div className="absolute inset-0 rounded-full border-4 border-brand-yellow/30 border-t-brand-red animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Bus className="w-12 h-12 text-brand-red animate-pulse" />
          </div>
        </div>
        <h2 className="text-xl font-black text-brand-dark uppercase tracking-tighter italic">Terminal Hub</h2>
      </div>
    );
  }

  if (!isLoggedIn) return <Login onLoginSuccess={() => setIsLoggedIn(true)} />;
  if (!shiftData) return <ShiftSetup onSetupComplete={setShiftData} />;

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {/* ── Toast queue: bottom-anchored, above nav, max 3 stacked ── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-[88px] left-1/2 z-[120] -translate-x-1/2 w-[calc(100%-2.5rem)] max-w-[380px] flex flex-col-reverse gap-1.5 pointer-events-none">
          {toasts.map(toast => (
            <div key={toast.id} className="pointer-events-auto">
              <ToastCard toast={toast} onDismiss={dismissToast} />
            </div>
          ))}
        </div>
      )}

      {activeTab === 'home' && (
        <div className="flex flex-col gap-2">
          {viewingTicket ? (
            <Ticket data={viewingTicket} onReset={() => setViewingTicket(null)} />
          ) : (
            <>
              <Scanner onDataExtracted={handleDataExtracted} onDataDenied={handleDataDenied} onToast={showToast} />
              <div className="px-6 pb-32 mt-6">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                  <Zap size={14} className="text-brand-red" /> Live Trip Audit
                </h3>
                {scanQueue.length === 0 ? (
                  <div className="bg-white border-2 border-dashed border-gray-100 rounded-[2rem] p-10 text-center flex flex-col items-center gap-3">
                    <Clock size={32} className="text-gray-200" />
                    <p className="text-[10px] font-black text-gray-300 uppercase">Awaiting verification</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {scanQueue.map((item) => {
                      const isFree = item.gender === 'F' && item.isEligible;
                      return (
                        // Task 2.2: Use getScanQueueKey for guaranteed non-undefined key
                        <div key={getScanQueueKey(item)} className="p-4 rounded-[1.8rem] border-2 flex items-center justify-between bg-white shadow-sm border-gray-50 animate-in slide-in-from-right duration-300">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-brand-cream border border-gray-100 overflow-hidden">
                              {item.passengerPhoto && <img src={item.passengerPhoto} className="w-full h-full object-cover" />}
                            </div>
                            <div>
                              <p className="text-xs font-black text-brand-dark uppercase truncate leading-tight">{item.name}</p>
                              <p className={`text-[8px] font-black mt-1 uppercase ${isFree ? 'text-brand-green' : 'text-brand-red'}`}>
                                {isFree ? 'FREE PASS' : '₹55.00 FARE'}
                              </p>
                            </div>
                          </div>
                          <button onClick={() => setViewingTicket(item)} className="bg-brand-dark text-white px-3 py-2 rounded-xl text-[9px] font-black uppercase">Review</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="p-6 pb-24">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-brand-dark uppercase">Audit Records</h2>
            {/* Task 5.4: Pass onEmpty callback to downloadCSV */}
            <button
              onClick={() => storageService.downloadCSV(() => showToast('No records to export', 'info'))}
              className="bg-brand-green text-white px-4 py-2 rounded-xl text-[10px] font-black flex items-center gap-2 shadow-lg"
            >
              <FileSpreadsheet size={16} /> Export CSV
            </button>
          </div>

          {/* Task 14.3: Filter toggle buttons */}
          <div className="flex gap-2 mb-4">
            {(['ALL', 'SUCCESS', 'DENIED'] as const).map(f => (
              <button
                key={f}
                onClick={() => setHistoryFilter(f)}
                className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                  historyFilter === f
                    ? f === 'DENIED' ? 'bg-brand-red text-white' : f === 'SUCCESS' ? 'bg-brand-green text-white' : 'bg-brand-dark text-white'
                    : 'bg-white text-gray-400 border border-gray-100'
                }`}
              >
                {f === 'ALL' ? 'All' : f === 'SUCCESS' ? 'Success' : 'Denied'}
              </button>
            ))}
            {/* Task 14.5: Record count */}
            <span className="ml-auto text-[9px] font-black text-gray-400 uppercase self-center">
              {filteredRecords.length} records
            </span>
          </div>

          {/* Task 14.4: Search input */}
          <div className="relative mb-6">
            <input
              type="text"
              placeholder="Search by name..."
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              className="w-full bg-white border border-gray-100 rounded-2xl py-3 px-5 text-xs font-bold text-brand-dark placeholder-gray-300 focus:outline-none focus:border-brand-yellow/40 transition-all shadow-sm"
            />
            {historySearch && (
              <button
                onClick={() => setHistorySearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-brand-red transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Task 14.6 + 14.7 + 20.1: Filtered records list with empty state */}
          {filteredRecords.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <FileSearch size={48} className="text-gray-200" />
              <p className="text-xs font-black text-gray-400 uppercase">
                {historyFilter !== 'ALL'
                  ? `No ${historyFilter} records found`
                  : historySearch
                    ? `No results for "${historySearch}"`
                    : 'No tickets issued yet this shift'}
              </p>
              <button
                onClick={() => setActiveTab('home')}
                className="bg-brand-red text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase"
              >
                Go to Scanner
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRecords.map(record => (
                <div key={record.id} className={`p-5 rounded-[2rem] border-2 bg-white ${record.status === 'DENIED' ? 'border-brand-red/20 bg-red-50/50' : 'border-gray-50'} shadow-sm flex flex-col gap-3`}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden relative">
                        {record.passengerPhoto ? (
                            <img src={record.passengerPhoto} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-200">
                                <Bus size={16} className="text-gray-400" />
                            </div>
                        )}
                        {record.status === 'DENIED' && (
                            <div className="absolute inset-0 bg-brand-red/60 flex items-center justify-center">
                                <XCircle size={20} className="text-white" />
                            </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase text-brand-dark leading-none">{record.name}</p>
                        <p className="text-[7px] text-gray-400 font-bold uppercase mt-1">
                            {record.status === 'DENIED' ? (
                                <span className="text-brand-red">{record.eligibilityReason}</span>
                            ) : (
                                `Trip #${record.usageCount} • ${record.route || 'Local'}`
                            )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                       {record.status === 'DENIED' ? (
                           <p className="text-xs font-black text-brand-red">DENIED</p>
                       ) : (
                           <p className={`text-xs font-black ${record.savingsAmount > 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                             {record.savingsAmount > 0 ? 'FREE' : `₹${record.paidAmount}`}
                           </p>
                       )}
                       <p className="text-[6px] text-gray-300 mt-1 uppercase font-black">{new Date(record.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'admin' && <Dashboard showToast={showToast} />}

    </Layout>
  );
};

export default App;
