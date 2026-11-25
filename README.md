# Stree Shakti Ticket Portal

Mobile-first APSRTC conductor terminal for issuing tickets under the Stree Shakti welfare scheme. Conductors scan Aadhaar cards, verify passenger identity, and issue or deny tickets — all without requiring an internet connection or any external AI API.

## What This App Does

- Reads Aadhaar identity from the card's QR code (all modern cards)
- Falls back to **Tesseract.js OCR** (WebAssembly, runs in browser) for cards without a readable QR
- Verifies passenger face using **face-api.js** (TensorFlow.js neural face recognition, runs in browser)
- Applies the Stree Shakti eligibility rule (free travel for female AP residents)
- Runs an ML trust score before final ticket approval
- Stores all records locally in SQLite and syncs to a backend when online
- Works fully offline — no Gemini API, no cloud AI, no internet required

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Tailwind CSS |
| QR decode | jsQR (pure JS, local) |
| OCR | Tesseract.js v5 (WebAssembly, local) |
| Face recognition | face-api.js + TensorFlow.js (local, ~6 MB models) |
| ML trust scoring | Local heuristic + optional Python FastAPI service |
| Storage | localStorage + SQLite (`apsrtc_local.db`) |
| Backend | Express.js (Node.js) |

## Prerequisites

- Node.js 18 or newer
- npm
- Python 3.11+ only if you want to run the optional ML service

No API keys are required. The app runs entirely offline.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start the app

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### 3. Log in

```
username: conductor_test
password: test123
```

That's it. No `.env` file needed for basic operation.

## How OCR and Face Recognition Work (No API)

### Aadhaar scanning — two-step pipeline

**Step 1 — QR decode (fast, ~5 ms)**
The camera frame is passed to `jsQR`, a pure JavaScript QR decoder. All Aadhaar cards issued after 2015 have a QR code containing name, gender, and pincode in XML or JSON format. This path requires no internet and no model loading.

**Step 2 — Tesseract.js OCR (fallback, ~2–4 seconds)**
If no QR is found (old card, damaged QR, uploaded image), `Tesseract.js v5` reads the printed text using Google's Tesseract engine compiled to WebAssembly. Language data for English, Telugu, and Hindi is fetched from CDN on first use and cached by the browser.

**Step 3 — Manual entry (last resort)**
If OCR confidence is below threshold, the conductor is prompted to type the passenger's name, gender, and pincode directly.

### Face matching — neural face recognition

`face-api.js` runs three TensorFlow.js models in the browser:

1. `SsdMobilenetv1` — detects face bounding boxes
2. `FaceLandmark68Net` — finds 68 facial landmarks
3. `FaceRecognitionNet` — computes a 128-dimension face descriptor

The Euclidean distance between the ID card descriptor and the live selfie descriptor determines a match. Models (~6 MB total) are loaded from jsDelivr CDN on first use and cached by the browser. If models fail to load, the app falls back to pixel histogram similarity.

## Running the Full Stack (with ML service)

### Step 1. Install ML dependencies

```bash
cd ml_service
python -m pip install -r requirements.txt
```

### Step 2. Start the ML service

```bash
python -m uvicorn ml_service.main:app --host 0.0.0.0 --port 8000
```

### Step 3. Start the app

```bash
npm run dev
```

Health checks:

```
http://localhost:3000/health
http://localhost:3000/api/health
http://localhost:8000/health
```

## Split Frontend / Backend Mode

Start backend separately:

```bash
npm run dev:backend   # runs on port 5001
```

Start frontend separately:

```bash
npm run dev:frontend  # runs on port 3000
```

Vite proxies `/api`, `/auth`, `/records`, `/shifts`, `/shift`, and `/health` to `http://localhost:5001`.

## Standard Operator Flow

1. Log in as a conductor
2. Start a shift — capture a conductor selfie (verified locally with face-api.js)
3. Scan Aadhaar via camera QR, camera photo, or uploaded image/PDF
4. If only the front side is readable, scan the back side for the pincode
5. For female AP residents (Stree Shakti eligible), capture a live passenger face
6. face-api.js compares the live face to the ID card photo (or previous trip photo)
7. ML trust score is computed locally
8. Ticket is issued or denied; record is saved to SQLite and synced when online

## Build Commands

```bash
npm run lint     # TypeScript type-check
npm run build    # Production build
npm run preview  # Preview production build
npm run test     # Run tests
```

## Project Structure

```
.
├── App.tsx                          # Main shell, toast queue, scan queue
├── components/
│   ├── Scanner.tsx                  # QR scan, OCR, biometric flow
│   ├── ShiftSetup.tsx               # Conductor shift + selfie verification
│   ├── Dashboard.tsx                # Stats, shift history, end-shift flow
│   ├── Login.tsx                    # Auth, settings drawer
│   ├── Ticket.tsx                   # Ticket receipt with real QR code
│   └── Layout.tsx                   # Header, bottom nav, offline badge
├── services/
│   ├── geminiService.ts             # OCR (Tesseract.js) + face match (face-api.js)
│   ├── aadharQrService.ts           # jsQR decode + Aadhaar QR format parser
│   ├── aadhaarValidationService.ts  # Validation rules, AP residency check
│   ├── mlIssuanceService.ts         # ML trust scoring (local + optional API)
│   ├── mlDecisionPolicy.ts          # Local heuristic trust score
│   ├── storageService.ts            # localStorage + SQLite sync + CSV export
│   ├── authService.ts               # Conductor auth + session
│   ├── configService.ts             # API URL, offline/live mode
│   └── geoService.ts                # Route distance lookup
├── ml_service/                      # Optional Python FastAPI ML service
├── backend/
│   └── server.ts                    # Split-mode Express API (port 5001)
├── server.ts                        # Integrated Express + Vite (port 3000)
├── index.html                       # CDN scripts: Tesseract.js, face-api.js
├── apsrtc_local.db                  # SQLite database
└── exports/
    └── ticket_records_training.csv  # ML training data export
```

## Aadhaar Validation Rules

The app rejects issuance when:

- Uploaded file is not an image or PDF
- Image does not contain an Aadhaar card
- OCR confidence is too low and QR is absent
- Back-side pincode cannot be recovered
- Passenger biometric photo is blank or lens-covered
- Face match confidence is below threshold

Conductor-visible messages:

```
Invalid document uploaded. Ticket issuance terminated.
Invalid photo uploaded. Ticket issuance terminated.
Not sufficient data. Ticket issuance terminated.
QR code not detected. Use "Enter details manually" below.
```

## Data Files

| File | Purpose |
|------|---------|
| `apsrtc_local.db` | App SQLite database |
| `ml_service/ml_service.db` | ML service SQLite database |
| `exports/ticket_records_training.csv` | Training data export |
| `models/` | Trained ML model artifacts |

Inspect the database:

```bash
sqlite3 apsrtc_local.db
```

Or use DB Browser for SQLite / the VS Code SQLite extension.

## Optional ML Service

The `ml_service/` directory contains a FastAPI service for trust scoring and model retraining. It is optional — the app uses a local heuristic when the service is unavailable.

```bash
# Install
cd ml_service && python -m pip install -r requirements.txt

# Run
python -m uvicorn ml_service.main:app --host 0.0.0.0 --port 8000

# Docker
cd ml_service/docker && docker-compose up --build -d
```

Endpoints:

```
POST /predict-trust
POST /log-verification-event
POST /retrain-model
GET  /model-metrics
GET  /feature-importance
```

## Troubleshooting

**OCR is slow on first scan**
Tesseract.js downloads ~14 MB of language data on first use. Subsequent scans use the browser cache and are faster.

**Face models not loading**
face-api.js downloads ~6 MB of TensorFlow models on first biometric check. The app falls back to pixel similarity until models are cached.

**Port already in use**

```bash
lsof -i :3000
lsof -i :5001
```

**SQLite locked**
Ensure only one backend process is writing to `apsrtc_local.db` at a time.

**Large production bundle warning**
The Vite build warns about bundle size due to TensorFlow.js. The build still succeeds and the app runs correctly.

## Notes

- No Gemini API key is needed. The app is fully offline-capable.
- `.env`, `.db`, `node_modules`, and `dist` are excluded by `.gitignore`.
- For a technical architecture map, see `IDPOVERVIEW.txt`.

Last updated: April 25, 2026
