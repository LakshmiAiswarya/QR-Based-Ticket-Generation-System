# Data Override Findings
**Date**: April 25, 2026
**Status**: ✅ ALL PREVIOUSLY FOUND ISSUES RESOLVED

---

## Previously Found Issues (February 2026) — Now Fixed

### Issue 1: Multi-conductor data accumulation in localStorage
**Severity**: Medium | **Status**: ✅ Fixed

`authService.logout()` now removes the current conductor's records from localStorage on every logout. `storageService.cleanupOldConductorData()` is called on Dashboard mount as a secondary safeguard.

### Issue 2: Stale data in offline mode
**Severity**: Medium | **Status**: ✅ Mitigated

`storageService.getRecords()` always filters by `conductorId`. The Dashboard auto-refreshes every 30 seconds. Cleanup runs on mount.

---

## April 2026 Architecture Change: Gemini API Removed

The most significant data-handling change since the February audit is the removal of the Gemini API from the OCR and biometric pipeline.

### Previous architecture (before April 2026)

```
Card image → base64 encode → HTTPS POST to Gemini API (Google servers)
                                    ↓
                             JSON response with name, gender, pincode

Passenger selfie → base64 encode → HTTPS POST to Gemini API
                                          ↓
                                   face match result
```

**Data concern**: Card images and passenger photos were transmitted to Google's Gemini API servers on every scan. This created a dependency on internet connectivity and raised data privacy considerations for biometric data.

### Current architecture (April 2026)

```
Card image → jsQR (local, ~5ms) → Aadhaar data
           → Tesseract.js WebAssembly (local, ~2–4s) → OCR text → parsed fields
           → Manual entry form (conductor input)

Passenger selfie → face-api.js TensorFlow.js (local, ~200ms) → face descriptor
ID card photo    → face-api.js TensorFlow.js (local, ~200ms) → face descriptor
                                                                      ↓
                                                          Euclidean distance → match
```

**Result**: No image data, biometric data, or identity data leaves the device. The app is fully offline-capable.

---

## Current Data Transmission Map

| Data type | Transmitted externally? | Destination |
|-----------|------------------------|-------------|
| Card images (OCR) | ❌ No | Local Tesseract.js only |
| Passenger photos (biometric) | ❌ No | Local face-api.js only |
| Conductor selfies | ❌ No | Local face-api.js only |
| Ticket records | ✅ Yes (when online) | Backend SQLite (`/api/records`) |
| Shift data | ✅ Yes (when online) | Backend SQLite (`/shifts`) |
| ML verification events | ✅ Yes (when online) | ML service (`/api/ml/evaluate`) |
| Training CSV | Manual export only | Conductor-initiated download |

---

## Remaining Open Items

| Item | Priority | Notes |
|------|----------|-------|
| Encrypt photos in localStorage | High | Use conductor session key |
| Migrate passwords from base64 to bcrypt | High | Before production |
| Add JWT with expiry to session | Medium | Before production |
| Auto-purge records older than 30 days | Medium | GDPR/privacy compliance |
| Add HMAC request signing | Low | For production API hardening |

---

**Last updated**: April 25, 2026
