# Stree Shakti Ticket Portal

**QR-based ticket verification system for APSRTC's Stree Shakti free-travel scheme**

An offline-first, mobile-first conductor terminal prototype. Conductors scan a passenger's Aadhaar card, verify identity with on-device face recognition, and issue or deny a ticket, all without an internet connection or any external AI API.

> **Disclaimer:** This is an independent academic prototype. It is not affiliated with, endorsed by, or connected to APSRTC, the Government of Andhra Pradesh, or UIDAI. No real Aadhaar data is included in this repository. Use only sample or consented test data when trying it out. All processing happens locally on the device.

**Tech:** React 19 · TypeScript · Tailwind CSS · jsQR · Tesseract.js · face-api.js · Express · SQLite · FastAPI (optional)


## Table of Contents

1. [Highlights](#highlights)
2. [What This App Does](#what-this-app-does)
3. [Technology Stack](#technology-stack)
4. [Quick Start](#quick-start)
5. [How OCR and Face Recognition Work](#how-ocr-and-face-recognition-work-no-api)
6. [Standard Operator Flow](#standard-operator-flow)
7. [ML Trust Score](#ml-trust-score)
8. [Running the Full Stack](#running-the-full-stack-with-ml-service)
9. [Split Frontend / Backend Mode](#split-frontend--backend-mode)
10. [Project Structure](#project-structure)
11. [Aadhaar Validation Rules](#aadhaar-validation-rules)
12. [Data Files](#data-files)
13. [Privacy and Security Notes](#privacy-and-security-notes)
14. [Limitations](#limitations)
15. [Future Work](#future-work)
16. [Troubleshooting](#troubleshooting)


---

## Highlights

- **Three-step identity pipeline:** QR decode, then OCR fallback, then manual entry
- **On-device face matching** using 128-dimension face descriptors, with a fallback if models fail to load
- **Fully offline:** local SQLite storage with automatic sync when connectivity returns
- **Rule-based eligibility check** plus an **ML trust score** before final approval
- **Optional FastAPI service** for trust scoring, retraining and model metrics
- **TypeScript type-checking and a Render deploy config** included.

## What This App Does

- Reads Aadhaar identity from the card's QR code (all modern cards)
- Falls back to **Tesseract.js OCR** (WebAssembly, runs in browser) for cards without a readable QR
- Verifies passenger face using **face-api.js** (TensorFlow.js neural face recognition, runs in browser)
- Applies the Stree Shakti eligibility rule (free travel for female AP residents)
- Runs an ML trust score before final ticket approval
- Stores all records locally in SQLite and syncs to a backend when online
- Works fully offline: no Gemini API, no cloud AI, no internet required

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

## Quick Start

**Prerequisites:** Node.js 18+ and npm. Python 3.11+ is needed only for the optional ML service. No API keys are required.

```bash
git clone https://github.com/LakshmiAiswarya/QR-Based-Ticket-Generation-System.git
cd QR-Based-Ticket-Generation-System
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

**Demo login (local test account only):**

```
username: conductor_test
password: test123
```

No `.env` file is needed for basic operation.

## How OCR and Face Recognition Work (No API)

### Aadhaar scanning: three-step pipeline

**Step 1: QR decode (fast, ~5 ms).**
The camera frame is passed to `jsQR`, a pure JavaScript QR decoder. Aadhaar cards issued after 2015 carry a QR code with name, gender and pincode in XML or JSON format. This path needs no internet and no model loading.

**Step 2: Tesseract.js OCR (fallback, ~2-4 seconds).**
If no QR is found (old card, damaged QR, uploaded image), `Tesseract.js v5` reads the printed text using the Tesseract engine compiled to WebAssembly. Language data for English, Telugu and Hindi is fetched from CDN on first use and cached by the browser.

**Step 3: Manual entry (last resort).**
If OCR confidence is below the threshold, the conductor is prompted to type the passenger's name, gender and pincode directly.

### Face matching: neural face recognition

`face-api.js` runs three TensorFlow.js models in the browser:

1. `SsdMobilenetv1` detects face bounding boxes
2. `FaceLandmark68Net` finds 68 facial landmarks
3. `FaceRecognitionNet` computes a 128-dimension face descriptor

The Euclidean distance between the ID card descriptor and the live selfie descriptor determines a match. Models (~6 MB total) are loaded from the jsDelivr CDN on first use and cached by the browser. If models fail to load, the app falls back to pixel histogram similarity.

## Standard Operator Flow

1. Log in as a conductor
2. Start a shift and capture a conductor selfie (verified locally with face-api.js)
3. Scan Aadhaar via camera QR, camera photo, or uploaded image/PDF
4. If only the front side is readable, scan the back side for the pincode
5. For female AP residents (Stree Shakti eligible), capture a live passenger face
6. face-api.js compares the live face to the ID card photo (or previous trip photo)
7. The ML trust score is computed locally
8. The ticket is issued or denied; the record is saved to SQLite and synced when online

## ML Trust Score 

The trust score combines verification signals (OCR/QR confidence, face-match distance and related features) into a single value that supports the final issue/deny decision. By default a local heuristic (`mlDecisionPolicy.ts`) is used. When the optional FastAPI service is running, the model in `ml_service/` scores requests instead and can be retrained from exported records.

Training and evaluation are documented in `ml_training.ipynb`.




## Running the Full Stack (with ML service)

```bash
# 1. Install ML dependencies
cd ml_service
python -m pip install -r requirements.txt

# 2. Start the ML service (from the project root)
cd ..
python -m uvicorn ml_service.main:app --host 0.0.0.0 --port 8000

# 3. Start the app
npm run dev
```

Health checks:

```
http://localhost:3000/health
http://localhost:3000/api/health
http://localhost:8000/health
```

**ML service endpoints:**

```
POST /predict-trust
POST /log-verification-event
POST /retrain-model
GET  /model-metrics
GET  /feature-importance
```

Docker option:

```bash
cd ml_service/docker && docker-compose up --build -d
```

## Split Frontend / Backend Mode

```bash
npm run dev:backend    # Express API on port 5001
npm run dev:frontend   # Vite on port 3000
```

Vite proxies `/api`, `/auth`, `/records`, `/shifts`, `/shift` and `/health` to `http://localhost:5001`.

**Build commands**

```bash
npm run lint      # TypeScript type-check
npm run build     # Production build
npm run preview   # Preview production build

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
├── ml_training.ipynb                # Model training notebook
└── exports/
    └── ticket_records_training.csv  # ML training data export (sample/synthetic)
```

> Note: `geminiService.ts` is a legacy file name. It contains the Tesseract.js OCR and face-api.js matching code. No Gemini API is used.

## Aadhaar Validation Rules

The app rejects issuance when:

- The uploaded file is not an image or PDF
- The image does not contain an Aadhaar card
- OCR confidence is too low and no QR is present
- The back-side pincode cannot be recovered
- The passenger photo is blank or lens-covered
- Face match confidence is below the threshold

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
| `apsrtc_local.db` | App SQLite database (created locally, git-ignored) |
| `ml_service/ml_service.db` | ML service SQLite database |
| `exports/ticket_records_training.csv` | Training data export |
| `models/` | Trained ML model artifacts |

Inspect the database:

```bash
sqlite3 apsrtc_local.db
```

Or use DB Browser for SQLite or the VS Code SQLite extension.

## Privacy and Security Notes

- Identity processing (QR decode, OCR, face matching) runs entirely in the browser; images are not sent to any third-party AI service.
- Model and language files are downloaded from public CDNs on first use, then cached.
- `.env`, `.db`, `node_modules` and `dist` are excluded by `.gitignore`.
- The demo login is for local testing only. Replace it with real authentication before any real-world use.
- Do not commit real Aadhaar numbers, photos or personal data to this repository.

## Limitations

- Prototype: not tested on real buses, real conductors or live APSRTC systems.
- Face recognition accuracy depends on lighting, camera quality and photo age.
- OCR accuracy on worn or low-quality cards is limited and may require manual entry.
- The ML trust score is trained on limited data; treat results as indicative, not authoritative.
- Authentication is basic and intended for demonstration.
- The TensorFlow.js bundle is large, so first load on slow networks takes time.

## Future Work

- Liveness detection to resist photo or screen spoofing
- Role-based authentication and encrypted local storage
- Conflict-safe sync and an admin dashboard for route-level analytics
- A larger, properly labelled dataset and a documented evaluation protocol
- Installable PWA support and a field pilot with real feedback

## Troubleshooting

**OCR is slow on first scan.** Tesseract.js downloads ~14 MB of language data on first use. Later scans use the browser cache.

**Face models not loading.** face-api.js downloads ~6 MB of TensorFlow models on first biometric check. The app falls back to pixel similarity until the models are cached.

**Port already in use.**

```bash
lsof -i :3000
lsof -i :5001
```

**SQLite locked.** Make sure only one backend process writes to `apsrtc_local.db` at a time.

**Large production bundle warning.** The Vite build warns about bundle size because of TensorFlow.js. The build still succeeds.




## Author

**Thanubuddu Lakshmi Aiswarya**: B.Tech AI & ML, Vignan's Foundation for Science, Technology & Research
