
import { Conductor, ShiftData } from '../types';
import { getApiBaseUrl, isLiveMode } from './configService';

const AUTH_DB_KEY = 'stree_shakti_auth_db_v3';
const SESSION_KEY = 'logged_in_session_user'; 

type LogoutOptions = {
  purgeConductorData?: boolean;
};

export const authService = {
  _simulateNetworkDelay: async () => new Promise(resolve => setTimeout(resolve, 800)),

  getConductor: (): Conductor | null => {
    // 1. Check active session
    const username = localStorage.getItem(SESSION_KEY);
    if (!username) return null;
    
    // 2. Try to get cached user data
    // In live mode, this cache is populated after a successful API login
    // In offline mode, this is populated from localStorage DB
    const cached = localStorage.getItem('cached_live_user');
    if (cached) {
        return JSON.parse(cached);
    }
    
    // 3. Offline Fallback Check
    const localDb = JSON.parse(localStorage.getItem(AUTH_DB_KEY) || '{}');
    if (localDb[username]) return localDb[username];

    return null;
  },

  register: async (username: string, password: string, employeeId: string): Promise<{ success: boolean; message?: string }> => {
    // A: Try Live Server Registration (Google Cloud)
    if (isLiveMode()) {
      try {
        const response = await fetch(`${getApiBaseUrl()}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, employeeId })
        });
        const data = await response.json();
        if (response.ok) {
            return { success: true, message: "Registered on Cloud Server." };
        }
        return { success: false, message: data.message || "Cloud Registration Failed" };
      } catch (e) {
        return { success: false, message: `Could not connect to Cloud (${getApiBaseUrl()}). Check URL or internet.` };
      }
    } 
    
    // B: Local Storage Registration (Offline Persistence)
    await authService._simulateNetworkDelay();
    const localDb = JSON.parse(localStorage.getItem(AUTH_DB_KEY) || '{}');
    
    if (localDb[username]) {
      return { success: false, message: "User already exists on this device." };
    }

    const newConductor: Conductor = {
      username,
      passwordHash: btoa(password), // Simple encoding for demo persistence
      employeeId,
      lastLogin: Date.now()
    };
    
    localDb[username] = newConductor;
    localStorage.setItem(AUTH_DB_KEY, JSON.stringify(localDb));
    return { success: true };
  },

  login: async (username: string, password: string): Promise<{ success: boolean; needsBiometric: boolean; message?: string }> => {
    // A: Try Live Server Login (Google Cloud)
    if (isLiveMode()) {
      try {
        const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        
        if (response.ok) {
           localStorage.setItem(SESSION_KEY, username);
           // Cache user profile for offline access/speed
           const user: Conductor = {
               username,
               employeeId: data.employeeId,
               passwordHash: 'HIDDEN', // Don't store hash from server
               masterPhoto: data.masterPhoto 
           };
           localStorage.setItem('cached_live_user', JSON.stringify(user));
           return { success: true, needsBiometric: !!data.masterPhoto };
        }
        return { success: false, needsBiometric: false, message: data.message || "Invalid Cloud Credentials" };
      } catch (e) {
        console.error(e);
        return { success: false, needsBiometric: false, message: `Connection Timeout to ${getApiBaseUrl()}` };
      }
    } 
    
    // B: Local Storage Login (Persistent Offline)
    await authService._simulateNetworkDelay();
    const localDb = JSON.parse(localStorage.getItem(AUTH_DB_KEY) || '{}');
    const conductor = localDb[username];

    if (!conductor) {
      return { success: false, needsBiometric: false, message: "User not found on this device." };
    }
    
    const passMatch = conductor.passwordHash === btoa(password);
    if (passMatch) {
      localStorage.setItem(SESSION_KEY, username);
      conductor.lastLogin = Date.now();
      // Update DB with last login
      localDb[username] = conductor;
      localStorage.setItem(AUTH_DB_KEY, JSON.stringify(localDb));
      
      // Also cache for consistency
      localStorage.setItem('cached_live_user', JSON.stringify(conductor));
      
      return { success: true, needsBiometric: !!conductor.masterPhoto };
    }

    return { success: false, needsBiometric: false, message: "Invalid Password" };
  },

  resetPassword: async (oldPassword: string, newPassword: string): Promise<boolean> => {
    // For now, reset only supported locally or via specific API endpoint
    await authService._simulateNetworkDelay();
    const conductor = authService.getConductor();
    if (!conductor) return false;

    // Check against local DB for offline mode
    const localDb = JSON.parse(localStorage.getItem(AUTH_DB_KEY) || '{}');
    const storedUser = localDb[conductor.username];

    if (storedUser && storedUser.passwordHash === btoa(oldPassword)) {
      storedUser.passwordHash = btoa(newPassword);
      localDb[conductor.username] = storedUser;
      localStorage.setItem(AUTH_DB_KEY, JSON.stringify(localDb));
      return true;
    }
    return false;
  },

  updateConductor: async (updatedConductor: Conductor) => {
    // 1. Update Cache
    localStorage.setItem('cached_live_user', JSON.stringify(updatedConductor));
    
    // 2. Update Local DB (for persistence across logouts)
    const localDb = JSON.parse(localStorage.getItem(AUTH_DB_KEY) || '{}');
    if (localDb[updatedConductor.username]) {
        localDb[updatedConductor.username] = updatedConductor;
        localStorage.setItem(AUTH_DB_KEY, JSON.stringify(localDb));
    }

    // 3. Try Cloud Update (Fire and forget)
    if (isLiveMode()) {
        try {
            fetch(`${getApiBaseUrl()}/user/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedConductor)
            });
        } catch (e) { console.error("Cloud update sync failed"); }
    }
  },

  checkCloudShift: async (conductorId: string): Promise<ShiftData | null> => {
    // 1. Try Cloud
    if (isLiveMode()) {
        try {
            const response = await fetch(`${getApiBaseUrl()}/shift/active?conductorId=${conductorId}`);
            if (response.ok) {
                return await response.json();
            }
        } catch (e) {
            console.log("Cloud shift check failed, falling back to local");
        }
    }

    // 2. Local Persistence Check
    // We check the standard shift key. If the user logged out, this might still exist in storage
    // if we don't clear it on logout.
    // However, to be safe, we also check a "Persistent Last Shift" key that survives logout.
    const persistedShift = localStorage.getItem(`shift_persist_${conductorId}`);
    if (persistedShift) {
        const parsed = JSON.parse(persistedShift);
        // Only return if it started within last 12 hours
        if (Date.now() - parsed.startTime < (12 * 60 * 60 * 1000)) {
            return parsed;
        }
    }

    return null;
  },

  logout: (options: LogoutOptions = {}) => {
    const { purgeConductorData = true } = options;
    const conductor = authService.getConductor();

    // Clear session authentication
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('cached_live_user');
    
    // ✅ FIX: Remove only THIS conductor's records to prevent data mixing
    // when multiple conductors use the same device
    if (purgeConductorData && conductor) {
      try {
        // Remove this conductor's ticket records
        const allRecords = JSON.parse(localStorage.getItem('stree_shakti_records') || '[]');
        const filteredRecords = allRecords.filter((r: any) => r.conductorId !== conductor.employeeId);
        if (filteredRecords.length !== allRecords.length) {
          localStorage.setItem('stree_shakti_records', JSON.stringify(filteredRecords));
        }
        
        // Remove this conductor's shift history
        const allShifts = JSON.parse(localStorage.getItem('stree_shakti_shift_history') || '[]');
        const filteredShifts = allShifts.filter((s: any) => s.conductorId !== conductor.employeeId);
        if (filteredShifts.length !== allShifts.length) {
          localStorage.setItem('stree_shakti_shift_history', JSON.stringify(filteredShifts));
        }
        
        // Clear usage tracker (specific to session)
        localStorage.removeItem('stree_shakti_usage');
        localStorage.removeItem(`shift_persist_${conductor.employeeId}`);
      } catch (e) {
        console.warn("Error clearing conductor-specific data:", e);
      }
    }
    
    // Always clear current shift context
    localStorage.removeItem('stree_shakti_current_shift');
  }
};
