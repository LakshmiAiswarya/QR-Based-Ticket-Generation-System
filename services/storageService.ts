
import { TicketRecord, ShiftData, DailyStats, ShiftStats } from '../types';
import { authService } from './authService';
import { getApiBaseUrl, isLiveMode } from './configService';

const STORAGE_KEY = 'stree_shakti_records';
const USAGE_TRACKER = 'stree_shakti_usage';
const SHIFT_KEY = 'stree_shakti_current_shift';
const SHIFT_HISTORY_KEY = 'stree_shakti_shift_history';

const getStoredArray = <T,>(key: string): T[] => {
  const raw = localStorage.getItem(key);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const setStoredArray = <T,>(key: string, value: T[]): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError' && Array.isArray(value) && value.length > 0) {
      console.warn(`Quota exceeded for ${key}. Truncating oldest records.`);
      // Drop the oldest 30% of records
      const truncated = value.slice(Math.floor(value.length * 0.3));
      try {
        localStorage.setItem(key, JSON.stringify(truncated));
      } catch (retryErr) {
        console.error('Still exceeded quota after truncation:', retryErr);
      }
    } else {
      console.error('Error saving to localStorage:', err);
    }
  }
};

const buildUsageTracker = (records: TicketRecord[]): Record<string, number> => {
  return records.reduce<Record<string, number>>((tracker, record) => {
    const key = `${record.name.toLowerCase()}_${record.pincode}`;
    tracker[key] = (tracker[key] || 0) + 1;
    return tracker;
  }, {});
};

const refreshUsageTracker = (records: TicketRecord[]): void => {
  localStorage.setItem(USAGE_TRACKER, JSON.stringify(buildUsageTracker(records)));
};

const normalizeRecords = (records: TicketRecord[]): TicketRecord[] => {
  const deduped = new Map<string, TicketRecord>();
  records.forEach((record) => {
    deduped.set(record.id, record);
  });
  return Array.from(deduped.values()).sort((a, b) => a.timestamp - b.timestamp);
};

const replaceConductorRecords = (conductorId: string, incomingRecords: TicketRecord[]): TicketRecord[] => {
  const currentRecords = getStoredArray<TicketRecord>(STORAGE_KEY);
  const otherRecords = currentRecords.filter((record) => record.conductorId !== conductorId);
  const nextRecords = [...otherRecords, ...normalizeRecords(incomingRecords)];
  setStoredArray(STORAGE_KEY, nextRecords);
  refreshUsageTracker(nextRecords);
  return nextRecords;
};

const upsertRecord = (record: TicketRecord): TicketRecord[] => {
  const records = getStoredArray<TicketRecord>(STORAGE_KEY);
  // Remove bulky ID scan image before storing in local cache to prevent QuotaExceededError
  // (TicketRecord may or may not include imageProof depending on type evolution.)
  const localRecord = { ...record } as TicketRecord & { imageProof?: unknown };

  if ('imageProof' in localRecord) {
    delete localRecord.imageProof;
  }
  
  const nextRecords = normalizeRecords([
    ...records.filter((item) => item.id !== record.id),
    localRecord
  ]);
  setStoredArray(STORAGE_KEY, nextRecords);
  refreshUsageTracker(nextRecords);
  return nextRecords;
};

const updateRecordSyncStatus = (
  recordId: string,
  syncStatus: NonNullable<TicketRecord['syncStatus']>
): void => {
  const records = getStoredArray<TicketRecord>(STORAGE_KEY);
  const nextRecords = records.map((record) =>
    record.id === recordId ? { ...record, syncStatus } : record
  );
  setStoredArray(STORAGE_KEY, nextRecords);
};

const escapeCsvValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const downloadCsv = (filename: string, headers: string[], rows: Array<Array<unknown>>): void => {
  const csvContent = [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.setAttribute('download', filename);
  link.click();
  URL.revokeObjectURL(objectUrl);
};

export const storageService = {
  // ✅ DATA INTEGRITY: Ensure conductor-specific data segregation
  cleanupOldConductorData: () => {
    const conductor = authService.getConductor();
    if (!conductor) return;
    
    try {
      // Keep only current conductor's records
      const allRecords = getStoredArray<TicketRecord>(STORAGE_KEY);
      const conductorRecords = allRecords.filter((record) => record.conductorId === conductor.employeeId);
      if (conductorRecords.length !== allRecords.length) {
        setStoredArray(STORAGE_KEY, conductorRecords);
        console.log(`Cleaned up ${allRecords.length - conductorRecords.length} old records`);
      }
      refreshUsageTracker(conductorRecords);
    } catch (e) {
      console.warn("Data cleanup error:", e);
    }
  },

  // NEW: Fetch data from cloud on Login
  fetchRemoteRecords: async () => {
    const conductor = authService.getConductor();
    if (!conductor) return;

    const conductorId = encodeURIComponent(conductor.employeeId);
    const syncedRecords: TicketRecord[] = [];
    let receivedAnyRecords = false;

    // 1. Local DB Sync (Always runs to hydrate local storage from SQLite)
    try {
        const res = await fetch(`/api/records?conductorId=${conductorId}`);
        if (res.ok) {
            const dbRecords: TicketRecord[] = await res.json();
            syncedRecords.push(...dbRecords);
            receivedAnyRecords = true;
        }
    } catch (e) {
        console.warn("Local DB sync failed");
    }

    // 2. Cloud Sync
    if (isLiveMode()) {
      try {
          const res = await fetch(`${getApiBaseUrl()}/records?conductorId=${conductorId}`);
          if (res.ok) {
              const remoteRecords: TicketRecord[] = await res.json();
              syncedRecords.push(...remoteRecords);
              receivedAnyRecords = true;
          }
      } catch (e) {
          console.warn("Background sync failed");
      }
    }

    if (receivedAnyRecords) {
      replaceConductorRecords(conductor.employeeId, syncedRecords);
    }
  },

  saveRecord: (record: TicketRecord) => {
    // 1. Local Save
    upsertRecord(record);
    
    // 2. Local DB Sync (SQLite)
    fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
    }).catch(() => console.warn("Local DB sync failed"));

    // 3. Cloud Sync (Real)
    if (isLiveMode()) {
        fetch(`${getApiBaseUrl()}/records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record)
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Cloud sync failed with status ${response.status}`);
            }
            updateRecordSyncStatus(record.id, 'synced');
          })
          .catch(() => {
            updateRecordSyncStatus(record.id, 'pending');
            console.warn("Cloud sync failed, data saved locally");
          });
    }
  },

  incrementUsage: (name: string, pincode: string) => {
    const tracker = storageService.getUsageTracker();
    const key = `${name.toLowerCase()}_${pincode}`;
    tracker[key] = (tracker[key] || 0) + 1;
    localStorage.setItem(USAGE_TRACKER, JSON.stringify(tracker));
  },

  getUsageTracker: (): Record<string, number> => {
    const data = localStorage.getItem(USAGE_TRACKER);
    return data ? JSON.parse(data) : {};
  },

  getPassengerUsageCount: (name: string, pincode: string): number => {
    const tracker = storageService.getUsageTracker();
    const key = `${name.toLowerCase()}_${pincode}`;
    return tracker[key] || 0;
  },

  /**
   * Retrieves the most recent high-quality live photo for a passenger.
   * Used for robust biometric matching when ID card photos are noisy.
   */
  getLastPassengerPhoto: (name: string, pincode: string): string | undefined => {
    // Use getRecords() (conductor-filtered) not getAllRecords() to prevent
    // returning photos from other conductors' sessions on shared devices.
    const records = storageService.getRecords();
    for (let i = records.length - 1; i >= 0; i--) {
        const r = records[i];
        if (
            r.name.toLowerCase() === name.toLowerCase() && 
            r.pincode === pincode && 
            r.passengerPhoto && 
            r.status === 'SUCCESS'
        ) {
            return r.passengerPhoto;
        }
    }
    return undefined;
  },

  setShift: (data: ShiftData) => {
    // Remove bulky base64 selfie from shift data to prevent QuotaExceededError
    const localData = { ...data };
    if ('conductorSelfie' in localData) {
      delete localData.conductorSelfie;
    }

    // 1. Active Session
    localStorage.setItem(SHIFT_KEY, JSON.stringify(localData));
    
    // 2. History
    const history = storageService.getAllShiftHistory();
    history.push(localData);
    setStoredArray(SHIFT_HISTORY_KEY, history);
    
    // 3. Persistence
    if (localData.conductorId) {
        localStorage.setItem(`shift_persist_${localData.conductorId}`, JSON.stringify(localData));
    }

    // 4. Cloud Sync
    if (isLiveMode()) {
        fetch(`${getApiBaseUrl()}/shifts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data) // Still send full data (with selfie) to backend
        }).catch(e => console.warn("Cloud shift sync failed"));
    }
  },

  getShift: (): ShiftData | null => {
    let data = localStorage.getItem(SHIFT_KEY);
    const conductor = authService.getConductor();
    if (!data && conductor) {
        data = localStorage.getItem(`shift_persist_${conductor.employeeId}`);
    }

    if (!data) return null;
    const shift = JSON.parse(data);
    
    if (conductor && shift.conductorId === conductor.employeeId) {
       const isRecent = Date.now() - shift.startTime < (12 * 60 * 60 * 1000);
       if (isRecent) return shift;
    }
    return null;
  },

  getAllRecords: (): TicketRecord[] => {
    return getStoredArray<TicketRecord>(STORAGE_KEY);
  },

  getRecords: (): TicketRecord[] => {
    const conductor = authService.getConductor();
    if (!conductor) return [];
    
    const all = storageService.getAllRecords();
    return all.filter(r => r.conductorId === conductor.employeeId);
  },

  getAllShiftHistory: (): ShiftData[] => {
    return getStoredArray<ShiftData>(SHIFT_HISTORY_KEY);
  },

  getShiftHistory: (): ShiftData[] => {
    const conductor = authService.getConductor();
    if (!conductor) return [];
    const all = storageService.getAllShiftHistory();
    return all.filter(s => s.conductorId === conductor.employeeId);
  },

  clearShift: () => {
    localStorage.removeItem(SHIFT_KEY);
  },

  getCurrentShiftStats: (): ShiftStats | null => {
    const shift = storageService.getShift();
    if (!shift) return null;

    const allRecords = storageService.getAllRecords();
    const shiftRecords = allRecords.filter(r => 
      r.timestamp >= shift.startTime && 
      r.conductorId === shift.conductorId &&
      r.status === 'SUCCESS'
    );

    return {
      ticketsIssued: shiftRecords.length,
      freeCount: shiftRecords.filter(r => r.savingsAmount > 0).length,
      paidCount: shiftRecords.filter(r => r.paidAmount > 0).length,
      totalCollections: shiftRecords.reduce((sum, r) => sum + (r.paidAmount || 0), 0),
      totalSavings: shiftRecords.reduce((sum, r) => sum + (r.savingsAmount || 0), 0),
      startTime: shift.startTime
    };
  },

  getDailyStats: (): DailyStats[] => {
    const records = storageService.getRecords();
    const statsMap: Record<string, any> = {};

    records.forEach(r => {
      const date = new Date(r.timestamp).toLocaleDateString();
      if (!statsMap[date]) statsMap[date] = { success: 0, savings: 0, collections: 0, trips: 0, free: 0, paid: 0 };
      statsMap[date].trips++;
      if (r.status === 'SUCCESS') {
        statsMap[date].success++;
        statsMap[date].savings += (r.savingsAmount || 0);
        statsMap[date].collections += (r.paidAmount || 0);
        if (r.savingsAmount > 0) statsMap[date].free++;
        else statsMap[date].paid++;
      }
    });

    return Object.entries(statsMap).map(([date, stats]: [string, any]) => ({
      date,
      totalIssued: stats.success,
      totalSavings: stats.savings,
      totalCollections: stats.collections,
      totalTrips: stats.trips,
      freeTicketsCount: stats.free,
      paidTicketsCount: stats.paid
    }));
  },

  // Task 5.1/5.2: Accept optional onEmpty callback; call it when no records exist
  downloadCSV: (onEmpty?: () => void) => {
    const records = storageService.getRecords();
    if (records.length === 0) { onEmpty?.(); return; }
    const headers = ['Ticket ID', 'Passenger', 'Gender', 'Pincode', 'Status', 'Method', 'Savings', 'Paid', 'Timestamp', 'Route', 'Vehicle', 'Conductor'];
    const rows = records.map(r => [
      r.ticketId,
      r.name,
      r.gender,
      r.pincode,
      r.status,
      r.verificationMethod,
      r.savingsAmount,
      r.paidAmount,
      new Date(r.timestamp).toLocaleString(),
      r.route || '',
      r.vehicleNo || '',
      r.conductorId || ''
    ]);
    downloadCsv('Audit.csv', headers, rows);
  },

  // Task 5.3: Accept optional onEmpty callback for shift history export
  downloadShiftHistoryCSV: (onEmpty?: () => void) => {
    const shiftHistory = storageService.getShiftHistory();
    if (shiftHistory.length === 0) { onEmpty?.(); return; }

    const headers = ['Date', 'Start Time', 'Vehicle No', 'Driver ID', 'Conductor ID'];
    const rows = shiftHistory.map((shift) => {
      const startedAt = new Date(shift.startTime);
      return [
        startedAt.toLocaleDateString(),
        startedAt.toLocaleTimeString(),
        shift.vehicleNo,
        shift.driverId,
        shift.conductorId
      ];
    });

    downloadCsv('Shift_History.csv', headers, rows);
  },
  
  syncToCloud: async () => {
    if (!isLiveMode()) {
      return { synced: 0, failed: 0 };
    }

    const conductor = authService.getConductor();
    if (!conductor) {
      return { synced: 0, failed: 0 };
    }

    const pendingRecords = storageService
      .getRecords()
      .filter((record) => record.syncStatus === 'pending');

    let synced = 0;
    let failed = 0;

    await Promise.all(
      pendingRecords.map(async (record) => {
        try {
          const response = await fetch(`${getApiBaseUrl()}/records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record)
          });

          if (!response.ok) {
            throw new Error(`Cloud sync failed with status ${response.status}`);
          }

          updateRecordSyncStatus(record.id, 'synced');
          synced += 1;
        } catch {
          failed += 1;
        }
      })
    );

    const shift = storageService.getShift();
    if (shift) {
      try {
        await fetch(`${getApiBaseUrl()}/shifts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(shift)
        });
      } catch {
        console.warn("Cloud shift sync failed");
      }
    }

    return { synced, failed };
  }
};
