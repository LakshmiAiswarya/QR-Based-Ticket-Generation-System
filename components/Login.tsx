
import React, { useState, useEffect } from 'react';
import { User, Lock, LogIn, ShieldCheck, Bus, AlertCircle, CheckCircle2, UserPlus, Briefcase, Loader2, Settings, Server, Globe, Database, ScanSearch, Fingerprint, FileCheck2, Cpu, X } from 'lucide-react';
import { authService } from '../services/authService';
import { getApiBaseUrl, getDefaultApiUrl, migrateLegacyApiUrlIfNeeded, persistApiBaseUrl } from '../services/configService';
import ServerHelp from './ServerHelp';

interface LoginProps {
  onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'RESET'>('LOGIN');
  const [username, setUsername] = useState('conductor_test');
  const [password, setPassword] = useState('test123');
  const [employeeId, setEmployeeId] = useState('EMP001');
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [appMode, setAppMode] = useState<'OFFLINE' | 'LIVE'>('OFFLINE');
  const [serverUrl, setServerUrl] = useState(getDefaultApiUrl());
  const [showServerHelp, setShowServerHelp] = useState(false);

  // Reset flow states
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Initialize with default OFFLINE mode
    if (!localStorage.getItem('app_mode')) {
      localStorage.setItem('app_mode', 'OFFLINE');
      setAppMode('OFFLINE');
    } else {
      const savedMode = localStorage.getItem('app_mode') as 'OFFLINE' | 'LIVE';
      setAppMode(savedMode || 'OFFLINE');
    }
    
    // Initialize with test account for local testing
    const AUTH_DB_KEY = 'stree_shakti_auth_db_v3';
    const localDb = JSON.parse(localStorage.getItem(AUTH_DB_KEY) || '{}');
    if (!localDb['conductor_test']) {
      localDb['conductor_test'] = {
        username: 'conductor_test',
        passwordHash: btoa('test123'),
        employeeId: 'EMP001',
        lastLogin: Date.now()
      };
      localStorage.setItem(AUTH_DB_KEY, JSON.stringify(localDb));
    }
    
    const hasLegacyUrl = migrateLegacyApiUrlIfNeeded();
    setServerUrl(getApiBaseUrl());
    if (hasLegacyUrl) {
      setMessage('Cloud URL updated to current local server.');
      setTimeout(() => setMessage(''), 2500);
    }
  }, []);

  const saveSettings = () => {
    const cleanedUrl = serverUrl.trim() || getDefaultApiUrl();
    localStorage.setItem('app_mode', appMode);
    persistApiBaseUrl(cleanedUrl);
    setServerUrl(cleanedUrl);
    setShowSettings(false);
    setMessage("Configuration Saved.");
    setTimeout(() => setMessage(''), 2000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Access Secret Server Help (Type 'RECORDS' as User and 'SQL' as Pass)
    try {
      if (btoa(username) === 'UkVDT1JEUw==' && btoa(password) === 'U1FM') {
        setIsLoading(false);
        setShowServerHelp(true);
        setUsername('');
        setPassword('');
        return;
      }
    } catch(err) {}
    
    try {
      const result = await authService.login(username, password);
      if (result.success) {
        onLoginSuccess();
      } else {
        if (result.message?.includes("User not found")) {
             setError("Account not found. Please Register first.");
        } else {
             setError(result.message || "Invalid Credentials.");
        }
      }
    } catch (e) {
      setError("Connection Error. Please check your internet or server URL.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || !employeeId) {
      setError("All fields are required.");
      return;
    }
    
    setIsLoading(true);
    setError('');

    try {
      const result = await authService.register(username, password, employeeId);
      if (result.success) {
        setMessage("Registration Successful. Please Login.");
        setTimeout(() => {
          setMode('LOGIN');
          setError('');
          setMessage('');
          setPassword('');
        }, 1500);
      } else {
        setError(result.message || "Registration failed. User may already exist.");
      }
    } catch (e) {
      setError("Server Error.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const success = await authService.resetPassword(oldPassword, newPassword);
    setIsLoading(false);

    if (success) {
      setMessage("Password updated successfully.");
      setTimeout(() => {
        setMode('LOGIN');
        setOldPassword('');
        setNewPassword('');
      }, 1500);
    } else {
      setError("Update failed. Old password incorrect.");
    }
  };

  if (showServerHelp) {
    return <ServerHelp onClose={() => setShowServerHelp(false)} />;
  }

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col font-sans animate-in fade-in duration-500">

      {/* ── Settings backdrop ── */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 z-[60]" onClick={() => setShowSettings(false)} />
      )}

      {/* ── Settings drawer — slides in from right, stays within app column ── */}
      <div className={`fixed top-0 right-0 h-full w-72 bg-white z-[70] shadow-2xl transform transition-transform duration-300 ${showSettings ? 'translate-x-0' : 'translate-x-full'}`}
           style={{ maxWidth: '90vw' }}>
        <button onClick={() => setShowSettings(false)}
          className="absolute top-4 right-4 p-3 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-brand-red transition-colors">
          <X size={20} />
        </button>
        <div className="p-6 pt-16 h-full overflow-y-auto">
          <div className="flex items-center gap-2 mb-6">
            <Server size={18} className="text-brand-dark" />
            <h3 className="text-sm font-black uppercase text-brand-dark">Connection Config</h3>
          </div>
          <div className="space-y-4">
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setAppMode('OFFLINE')}
                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${appMode === 'OFFLINE' ? 'bg-white shadow text-brand-dark' : 'text-gray-400'}`}>
                Offline
              </button>
              <button onClick={() => setAppMode('LIVE')}
                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${appMode === 'LIVE' ? 'bg-brand-red shadow text-white' : 'text-gray-400'}`}>
                Cloud Server
              </button>
            </div>
            {appMode === 'LIVE' && (
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase ml-2">Google Cloud URL</label>
                <input type="text" value={serverUrl} onChange={e => setServerUrl(e.target.value)}
                  placeholder="https://your-api.run.app"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs font-bold" />
              </div>
            )}
            <button onClick={saveSettings} className="w-full bg-brand-dark text-white py-3 rounded-xl text-[10px] font-black uppercase">
              Save Configuration
            </button>
          </div>
        </div>
      </div>

      {/* ── Top bar: mode badge + settings gear ── */}
      <div className="flex items-center justify-between px-5 pt-8 pb-1 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${appMode === 'LIVE' ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
            {appMode === 'LIVE' ? 'Cloud Connected' : 'Local Offline Mode'}
          </span>
        </div>
        <button onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-xl border-2 transition-all ${showSettings ? 'border-brand-red bg-brand-red/5 text-brand-red' : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'}`}>
          <Settings size={17} className={showSettings ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Scrollable page body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pb-10 space-y-4">

          {/* Branding */}
          <div className="text-center pt-5 pb-1 space-y-3">
            <div className="relative inline-block">
              <div className="p-6 rounded-[2.5rem] bg-white shadow-xl border-4 border-brand-yellow relative z-10">
                <Bus size={52} className="text-brand-red animate-logo-shimmer" />
              </div>
              <div className="absolute inset-0 bg-brand-red/8 blur-3xl -z-10 rounded-full scale-150" />
            </div>
            <div>
              <h2 className="text-[26px] font-black text-brand-dark tracking-tighter uppercase leading-none">
                APSRTC CONDUCTOR
              </h2>
              <div className="flex items-center justify-center gap-2 mt-1.5">
                <div className="h-px w-6 bg-brand-red/40" />
                <p className="text-[9px] font-black text-brand-red uppercase tracking-[0.18em] flex items-center gap-1">
                  {appMode === 'LIVE'
                    ? <><Globe size={10} className="text-blue-500" /> Cloud Connected</>
                    : <><Database size={10} className="text-gray-400" /> Local Offline Mode</>}
                </p>
                <div className="h-px w-6 bg-brand-red/40" />
              </div>
            </div>
          </div>

          {/* Mission card */}
          <div className="bg-brand-dark text-white rounded-[2rem] p-5 shadow-xl relative overflow-hidden border border-brand-yellow/15">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,214,0,0.16),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.06),transparent_55%)]" />
            <div className="relative z-10">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-brand-yellow mb-1">Field Mission</p>
                  <h3 className="text-[14px] font-black tracking-tight leading-snug">AI-assisted Aadhaar ticket issuance for live RTC operations</h3>
                </div>
                <div className="shrink-0 rounded-2xl bg-white/10 p-2.5 border border-white/10">
                  <Cpu size={16} className="text-brand-yellow" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[
                  { Icon: ScanSearch, label: 'Aadhaar Scan' },
                  { Icon: Fingerprint, label: 'Face Match' },
                  { Icon: FileCheck2, label: 'Audit Save' },
                ].map(({ Icon, label }) => (
                  <div key={label} className="rounded-[1.25rem] bg-white/8 border border-white/10 px-2 py-2.5 text-center">
                    <Icon size={14} className="mx-auto text-brand-yellow" />
                    <p className="text-[7px] font-black uppercase tracking-[0.14em] mt-1.5 text-white/70 leading-tight">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main form card */}
          <div className="bg-white rounded-[2.5rem] shadow-[0_8px_40px_rgba(0,0,0,0.08)] border border-gray-100 relative overflow-hidden">
            {/* Tricolour accent */}
            <div className="absolute top-0 left-0 w-full h-1 flex">
              <div className="flex-1 bg-brand-red" />
              <div className="flex-1 bg-brand-yellow" />
              <div className="flex-1 bg-brand-green" />
            </div>

            <div className="p-6 pt-7">
              {/* Operator brief */}
              <div className="rounded-2xl bg-brand-cream border border-black/5 px-4 py-3 mb-5">
                <p className="text-[8px] font-black uppercase tracking-[0.18em] text-brand-red mb-1.5">Operator Brief</p>
                <p className="text-[11px] font-semibold text-brand-dark leading-relaxed">
                  Use this terminal to verify Aadhaar data, apply Stree Shakti fare rules, and issue tickets with document and biometric checks.
                </p>
                <div className="flex items-center gap-1.5 mt-2 text-[8px] font-bold uppercase tracking-[0.14em] text-gray-400">
                  <ShieldCheck size={10} className="text-brand-green shrink-0" />
                  <span>Conductor identity, passenger identity, and fare outcome are all logged.</span>
                </div>
              </div>

              <form onSubmit={mode === 'LOGIN' ? handleLogin : mode === 'REGISTER' ? handleRegister : handleReset}
                className="space-y-3">

                {/* REGISTER FIELDS */}
                {mode === 'REGISTER' && (
                  <div className="space-y-3 animate-in slide-in-from-right duration-300">
                    <div className="relative group">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-brand-red transition-colors" size={16} />
                      <input type="text" placeholder="Choose username" required value={username}
                        onChange={e => { setUsername(e.target.value); setError(''); }}
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-brand-yellow/50 rounded-2xl py-3.5 pl-11 pr-4 text-[12px] font-semibold text-brand-dark placeholder-gray-300 focus:outline-none transition-all focus:bg-white" />
                    </div>
                    <div className="relative group">
                      <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-brand-red transition-colors" size={16} />
                      <input type="text" placeholder="Employee ID" required value={employeeId}
                        onChange={e => { setEmployeeId(e.target.value); setError(''); }}
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-brand-yellow/50 rounded-2xl py-3.5 pl-11 pr-4 text-[12px] font-semibold text-brand-dark placeholder-gray-300 focus:outline-none transition-all focus:bg-white" />
                    </div>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-brand-red transition-colors" size={16} />
                      <input type="password" placeholder="Create password" required value={password}
                        onChange={e => { setPassword(e.target.value); setError(''); }}
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-brand-yellow/50 rounded-2xl py-3.5 pl-11 pr-4 text-[12px] font-semibold text-brand-dark placeholder-gray-300 focus:outline-none transition-all focus:bg-white" />
                    </div>
                  </div>
                )}

                {/* LOGIN FIELDS */}
                {mode === 'LOGIN' && (
                  <div className="space-y-3 animate-in slide-in-from-left duration-300">
                    <div className="relative group">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-brand-red transition-colors" size={16} />
                      <input type="text" placeholder="Conductor username" required value={username}
                        onChange={e => { setUsername(e.target.value); setError(''); }}
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-brand-yellow/50 rounded-2xl py-3.5 pl-11 pr-4 text-[12px] font-semibold text-brand-dark placeholder-gray-300 focus:outline-none transition-all focus:bg-white" />
                    </div>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-brand-red transition-colors" size={16} />
                      <input type="password" placeholder="Security password" required value={password}
                        onChange={e => { setPassword(e.target.value); setError(''); }}
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-brand-yellow/50 rounded-2xl py-3.5 pl-11 pr-4 text-[12px] font-semibold text-brand-dark placeholder-gray-300 focus:outline-none transition-all focus:bg-white" />
                    </div>
                  </div>
                )}

                {/* RESET FIELDS */}
                {mode === 'RESET' && (
                  <div className="space-y-3 animate-in slide-in-from-bottom duration-300">
                    <input type="password" placeholder="Current password" required value={oldPassword}
                      onChange={e => { setOldPassword(e.target.value); setError(''); }}
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-brand-yellow/50 rounded-2xl py-3.5 px-5 text-[12px] font-semibold text-brand-dark placeholder-gray-300 focus:outline-none transition-all focus:bg-white" />
                    <input type="password" placeholder="New password" required value={newPassword}
                      onChange={e => { setNewPassword(e.target.value); setError(''); }}
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-brand-yellow/50 rounded-2xl py-3.5 px-5 text-[12px] font-semibold text-brand-dark placeholder-gray-300 focus:outline-none transition-all focus:bg-white" />
                  </div>
                )}

                {/* Status messages */}
                {error && (
                  <div className="flex items-start gap-2.5 px-4 py-3 bg-rose-50 text-brand-red rounded-2xl border border-brand-red/10 animate-in zoom-in duration-200">
                    <AlertCircle size={13} className="shrink-0 mt-0.5" />
                    <p className="text-[11px] font-semibold leading-snug">{error}</p>
                  </div>
                )}
                {message && (
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-emerald-50 text-brand-green rounded-2xl animate-in zoom-in duration-200">
                    <CheckCircle2 size={13} className="shrink-0" />
                    <p className="text-[11px] font-semibold">{message}</p>
                  </div>
                )}

                {/* Submit */}
                <button type="submit" disabled={isLoading}
                  className={`w-full text-white font-black py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] text-[12px] tracking-wide uppercase mt-1
                    ${mode === 'REGISTER' ? 'bg-brand-dark hover:bg-gray-800' : 'bg-brand-red hover:bg-red-700'}
                    disabled:opacity-60 disabled:cursor-wait`}>
                  {isLoading
                    ? <Loader2 size={17} className="animate-spin" />
                    : mode === 'LOGIN' ? <LogIn size={17} />
                    : mode === 'REGISTER' ? <UserPlus size={17} />
                    : <ShieldCheck size={17} />}
                  <span>
                    {isLoading
                      ? (appMode === 'LIVE' ? 'Connecting...' : 'Verifying...')
                      : mode === 'LOGIN' ? 'Secure Login'
                      : mode === 'REGISTER' ? 'Register Account'
                      : 'Update Password'}
                  </span>
                </button>

                {/* Mode toggles */}
                <div className="flex flex-col items-center gap-2.5 pt-1">
                  {mode === 'LOGIN' && (
                    <>
                      <button type="button" onClick={() => setMode('REGISTER')}
                        className="text-[11px] font-bold text-brand-dark hover:text-brand-red transition-colors">
                        Register New Conductor
                      </button>
                      <button type="button" onClick={() => setMode('RESET')}
                        className="text-[11px] font-bold text-gray-400 hover:text-brand-dark transition-colors">
                        Forgot Password?
                      </button>
                    </>
                  )}
                  {mode !== 'LOGIN' && (
                    <button type="button" onClick={() => setMode('LOGIN')}
                      className="text-[11px] font-bold text-brand-red hover:text-brand-dark transition-colors">
                      ← Return to Login
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Login;
