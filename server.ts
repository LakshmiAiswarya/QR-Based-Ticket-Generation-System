import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import {
  buildMlDecision,
  computeFallbackTrustScore,
  DEFAULT_ML_THRESHOLDS,
  toMlServicePayload
} from "./services/mlDecisionPolicy.ts";

dotenv.config();

const recentLogs: any[] = [];

const TRAINING_SHEET_PATH =
  process.env.TRAINING_SHEET_PATH ||
  path.join(process.cwd(), "exports", "ticket_records_training.csv");
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
const DB_PATH = process.env.DB_PATH || "./apsrtc_local.db";

const encodePassword = (password: string) =>
  Buffer.from(password, "utf8").toString("base64");

const mapTicketRecordRow = (r: any) => ({
  id: r.id,
  name: r.name,
  gender: r.gender,
  pincode: r.pincode,
  timestamp: r.timestamp,
  ticketId: r.ticket_id,
  status: r.status,
  route: r.route,
  verificationMethod: r.verification_method,
  syncStatus: r.sync_status,
  passengerPhoto: r.passenger_photo,
  savingsAmount: r.savings_amount,
  paidAmount: r.paid_amount,
  distance: r.distance,
  conductorId: r.conductor_id,
  driverId: r.driver_id,
  vehicleNo: r.vehicle_no,
  usageCount: r.usage_count,
  eligibilityReason: r.eligibility_reason
});

const mapShiftRow = (row: any) => ({
  driverId: row.driver_id,
  vehicleNo: row.vehicle_no,
  startTime: row.start_time,
  conductorId: row.conductor_id,
  conductorSelfie: row.conductor_selfie
});

const trainingSheetColumns = [
  "id",
  "name",
  "gender",
  "pincode",
  "timestamp",
  "timestamp_iso",
  "ticket_id",
  "status",
  "route",
  "verification_method",
  "sync_status",
  "savings_amount",
  "paid_amount",
  "distance",
  "conductor_id",
  "driver_id",
  "vehicle_no",
  "usage_count",
  "eligibility_reason",
  "has_passenger_photo",
  "face_similarity_score",
  "biometric_confidence",
  "liveness_score",
  "ocr_confidence",
  "qr_validation_flag",
  "retry_count",
  "time_between_attempts",
  "device_fingerprint_entropy",
  "ip_risk_score",
  "geo_location_shift_flag",
  "event_risk_level",
  "gate_id",
  "final_decision"
];

const csvEscape = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const toCsvLine = (values: unknown[]) => values.map(csvEscape).join(",");

const buildTrainingRow = (row: any) => {
  const isSuccess = String(row.status || "").toUpperCase() === "SUCCESS";
  const isDenied = String(row.status || "").toUpperCase() === "DENIED";
  const isFailed = String(row.status || "").toUpperCase() === "FAILED";
  const isQr = String(row.verification_method || "").toUpperCase() === "QR";
  const timestamp = Number(row.timestamp || Date.now());

  const inferredConfidence = isSuccess ? 0.85 : 0.35;
  const eventRiskLevel = isDenied ? 2 : isFailed ? 1 : 0;

  return [
    row.id,
    row.name,
    row.gender,
    row.pincode,
    timestamp,
    Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "",
    row.ticket_id,
    row.status,
    row.route,
    row.verification_method,
    row.sync_status || "synced",
    row.savings_amount ?? 0,
    row.paid_amount ?? 0,
    row.distance,
    row.conductor_id,
    row.driver_id,
    row.vehicle_no,
    row.usage_count ?? 1,
    row.eligibility_reason,
    row.passenger_photo ? 1 : 0,
    inferredConfidence,
    inferredConfidence,
    isSuccess ? 0.9 : 0.45,
    isQr ? 0.95 : 0.75,
    isQr ? 1 : 0,
    Math.max(Number(row.usage_count || 1) - 1, 0),
    0,
    0,
    0,
    0,
    eventRiskLevel,
    row.vehicle_no || "unknown",
    isSuccess ? "approved" : "rejected"
  ];
};

const exportTrainingSheet = (db: sqlite3.Database) =>
  new Promise<void>((resolve, reject) => {
    db.all("SELECT * FROM ticket_records ORDER BY timestamp ASC", [], (err, rows: any[]) => {
      if (err) {
        reject(err);
        return;
      }

      const lines = [toCsvLine(trainingSheetColumns), ...rows.map((row) => toCsvLine(buildTrainingRow(row)))];
      const payload = `${lines.join("\n")}\n`;

      fs.promises
        .mkdir(path.dirname(TRAINING_SHEET_PATH), { recursive: true })
        .then(() => fs.promises.writeFile(TRAINING_SHEET_PATH, payload, "utf8"))
        .then(() => resolve())
        .catch((writeErr) => reject(writeErr));
    });
  });

const logActivity = (db: sqlite3.Database, logData: any) => {
  const {
    eventType,
    userId,
    action,
    resourceType,
    resourceId,
    method,
    endpoint,
    statusCode,
    responseTime,
    details,
    errorMessage,
    ocrAccuracy,
    scanMethod
  } = logData;

  const stmt = db.prepare(`
    INSERT INTO activity_logs (
      timestamp, event_type, user_id, action, resource_type, resource_id,
      method, endpoint, status_code, response_time, details, error_message,
      ocr_accuracy, scan_method
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    [
      Date.now(),
      eventType,
      userId || null,
      action || null,
      resourceType || null,
      resourceId || null,
      method || null,
      endpoint || null,
      statusCode ?? null,
      responseTime ?? null,
      details ? JSON.stringify(details) : null,
      errorMessage || null,
      ocrAccuracy ?? null,
      scanMethod || null
    ],
    function (err) {
      stmt.finalize();
      if (err) {
        console.error("Error logging activity:", err.message);
      }
    }
  );

  recentLogs.unshift({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    ...logData
  });

  if (recentLogs.length > 100) {
    recentLogs.pop();
  }
};

const readThreshold = (name: string, fallback: number): number => {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, raw));
};

const getMlThresholds = () => ({
  denyTrustScore: readThreshold("ML_DENY_TRUST_THRESHOLD", DEFAULT_ML_THRESHOLDS.denyTrustScore),
  anomalyTrustGuard: readThreshold("ML_ANOMALY_TRUST_GUARD", DEFAULT_ML_THRESHOLDS.anomalyTrustGuard)
});

const evaluateWithMlService = async (input: any) => {
  const payload = toMlServicePayload(input);
  const thresholds = getMlThresholds();
  const fallbackTrustScore = computeFallbackTrustScore(input);
  let trustScore: number | null = null;
  let anomalyScore: number | null = null;
  let anomalyFlag = false;
  let source = "fallback_heuristic";
  let modelAvailable = false;

  try {
    const response = await fetch(`${ML_SERVICE_URL}/predict-trust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const prediction = await response.json();
      const numericScore = Number(prediction?.trust_score);
      if (Number.isFinite(numericScore)) {
        trustScore = numericScore;
        modelAvailable = true;
        source = "ml_model";
      }
    }
  } catch (err) {
    console.warn("[ML Service] predict-trust unavailable:", err);
  }

  try {
    const query = new URLSearchParams({
      face_similarity_score: String(payload.face_similarity_score),
      liveness_score: String(payload.liveness_score),
      ocr_confidence: String(payload.ocr_confidence),
      retry_count: String(payload.retry_count),
      time_between_attempts: String(payload.time_between_attempts),
      device_fingerprint_entropy: String(payload.device_fingerprint_entropy),
      ip_risk_score: String(payload.ip_risk_score),
      event_risk_level: String(payload.event_risk_level)
    });

    const anomalyResponse = await fetch(`${ML_SERVICE_URL}/detect-anomaly?${query.toString()}`, {
      method: "POST"
    });

    if (anomalyResponse.ok) {
      const anomaly = await anomalyResponse.json();
      const numericAnomalyScore = Number(anomaly?.anomaly_score);
      const hasAnomalySignal =
        typeof anomaly?.is_anomaly === "boolean" || Number.isFinite(numericAnomalyScore);

      if (hasAnomalySignal) {
        anomalyFlag = Boolean(anomaly?.is_anomaly);
        anomalyScore = Number.isFinite(numericAnomalyScore) ? numericAnomalyScore : null;
        source = modelAvailable ? "ml_model+anomaly" : "fallback_heuristic+anomaly";
      }
    }
  } catch (err) {
    console.warn("[ML Service] detect-anomaly unavailable:", err);
  }

  if (trustScore === null) {
    trustScore = fallbackTrustScore;
  } else {
    trustScore = Math.min(trustScore, fallbackTrustScore);
    source = anomalyFlag ? "ml_model+heuristic_guard+anomaly" : "ml_model+heuristic_guard";
  }

  return buildMlDecision({
    trustScore,
    anomalyFlag,
    anomalyScore,
    source,
    modelAvailable,
    thresholds
  });
};

const sendToMLService = async (verificationEvent: any) => {
  try {
    const payload = toMlServicePayload({
      verificationMethod: verificationEvent.verificationMethod || "AI_OCR",
      documentType: verificationEvent.documentType || "AADHAAR",
      qrValidationFlag: verificationEvent.qr_validation_flag ?? verificationEvent.qrValidationFlag,
      qrConfidence: verificationEvent.qrConfidence,
      ocrConfidence: verificationEvent.ocr_confidence ?? verificationEvent.ocrConfidence,
      biometricConfidence: verificationEvent.biometricConfidence,
      faceSimilarityScore:
        verificationEvent.face_similarity_score ?? verificationEvent.faceSimilarityScore,
      livenessScore: verificationEvent.liveness_score ?? verificationEvent.livenessScore,
      retryCount: verificationEvent.retry_count ?? verificationEvent.retryCount,
      timeBetweenAttempts:
        verificationEvent.time_between_attempts ?? verificationEvent.timeBetweenAttempts,
      deviceFingerprintEntropy:
        verificationEvent.device_fingerprint_entropy ?? verificationEvent.deviceFingerprintEntropy,
      ipRiskScore: verificationEvent.ip_risk_score ?? verificationEvent.ipRiskScore,
      geoLocationShiftFlag:
        verificationEvent.geo_location_shift_flag ?? verificationEvent.geoLocationShiftFlag,
      eventRiskLevel: verificationEvent.event_risk_level ?? verificationEvent.eventRiskLevel,
      gateId: verificationEvent.vehicleNo || verificationEvent.gate_id || "unknown",
      isFreeTicket: Number(verificationEvent.savingsAmount || 0) > 0,
      usageCount: verificationEvent.usageCount || 1
    });

    const response = await fetch(`${ML_SERVICE_URL}/log-verification-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        final_decision: verificationEvent.status === "SUCCESS" ? "approved" : "rejected",
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("[ML Service] log-verification-event failed:", errorText);
      return false;
    }

    return true;
  } catch (err) {
    console.warn("[ML Service] log-verification-event unavailable:", err);
    return false;
  }
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  const trackedPrefixes = ["/api", "/auth", "/records", "/shifts", "/shift", "/user", "/health"];

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // Request Logging Middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);

      if (trackedPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
        logActivity(db, {
          eventType: "API_REQUEST",
          action: req.method,
          endpoint: req.url,
          method: req.method,
          statusCode: res.statusCode,
          responseTime: duration,
          details: {
            query: req.query,
            ip: req.ip
          }
        });
      }
    });
    next();
  });

  // Initialize SQLite database
  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database', err.message);
    } else {
      console.log('Connected to the local SQLite database.');
      db.serialize(() => {
        db.run(`
          CREATE TABLE IF NOT EXISTS ticket_records (
              id VARCHAR(50) PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              gender VARCHAR(10),
              pincode VARCHAR(20),
              timestamp BIGINT NOT NULL,
              ticket_id VARCHAR(50) NOT NULL,
              status VARCHAR(20) NOT NULL,
              route VARCHAR(255),
              verification_method VARCHAR(50),
              sync_status VARCHAR(20) DEFAULT 'synced',
              passenger_photo LONGTEXT,
              savings_amount DECIMAL(10, 2) DEFAULT 0.00,
              paid_amount DECIMAL(10, 2) DEFAULT 0.00,
              distance VARCHAR(50),
              conductor_id VARCHAR(50),
              driver_id VARCHAR(50),
              vehicle_no VARCHAR(50),
              usage_count INT DEFAULT 1,
              eligibility_reason TEXT
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS conductors (
              username VARCHAR(100) PRIMARY KEY,
              employee_id VARCHAR(50) UNIQUE NOT NULL,
              password_hash VARCHAR(255) NOT NULL,
              master_photo LONGTEXT,
              last_login BIGINT,
              updated_at BIGINT
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS active_shifts (
              conductor_id VARCHAR(50) PRIMARY KEY,
              driver_id VARCHAR(50) NOT NULL,
              vehicle_no VARCHAR(50) NOT NULL,
              start_time BIGINT NOT NULL,
              conductor_selfie LONGTEXT,
              updated_at BIGINT NOT NULL
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS activity_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              timestamp BIGINT NOT NULL,
              event_type VARCHAR(50) NOT NULL,
              user_id VARCHAR(100),
              action VARCHAR(255),
              resource_type VARCHAR(50),
              resource_id VARCHAR(100),
              method VARCHAR(10),
              endpoint VARCHAR(255),
              status_code INT,
              response_time INT,
              details TEXT,
              error_message TEXT,
              ocr_accuracy FLOAT,
              scan_method VARCHAR(50),
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.get("SELECT COUNT(*) as total FROM ticket_records", [], () => {
          exportTrainingSheet(db)
            .then(() => {
              console.log(`[Training Sheet] Synced ${TRAINING_SHEET_PATH}`);
            })
            .catch((exportErr) => {
              console.error("[Training Sheet] Initial export failed:", exportErr);
            });
        });
      });
    }
  });

  const saveTicketRecord = (record: any, res: express.Response) => {
    if (!record || !record.id) {
      logActivity(db, {
        eventType: "ERROR",
        action: "SAVE_TICKET",
        resourceType: "TICKET",
        errorMessage: "Missing record payload or record id."
      });
      return res.status(400).json({ error: 'Missing record payload or record id.' });
    }

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO ticket_records (
          id, name, gender, pincode, timestamp, ticket_id, status, route,
          verification_method, passenger_photo, savings_amount, paid_amount,
          distance, conductor_id, driver_id, vehicle_no, usage_count, eligibility_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      [
        record.id,
        record.name,
        record.gender,
        record.pincode,
        record.timestamp,
        record.ticketId,
        record.status,
        record.route,
        record.verificationMethod,
        record.passengerPhoto,
        record.savingsAmount,
        record.paidAmount,
        record.distance,
        record.conductorId,
        record.driverId,
        record.vehicleNo,
        record.usageCount,
        record.eligibilityReason
      ],
      function (err) {
        stmt.finalize();
        if (err) {
          console.error(err);
          logActivity(db, {
            eventType: "ERROR",
            action: "SAVE_TICKET",
            resourceType: "TICKET",
            resourceId: record.id,
            errorMessage: err.message
          });
          return res.status(500).json({ error: err.message });
        }

        logActivity(db, {
          eventType: "TICKET_CREATED",
          action: "SAVE",
          resourceType: "TICKET",
          resourceId: record.id,
          userId: record.conductorId,
          ocrAccuracy: record.ocrAccuracy,
          scanMethod: record.verificationMethod,
          details: {
            ticketId: record.ticketId,
            status: record.status,
            verificationMethod: record.verificationMethod,
            mlTrustScore: record.mlTrustScore,
            mlDecision: record.mlDecision,
            mlDecisionSource: record.mlDecisionSource,
            mlAnomalyFlag: record.mlAnomalyFlag
          }
        });

        exportTrainingSheet(db).catch((exportErr) => {
          console.error("[Training Sheet] Refresh failed:", exportErr);
        });

        sendToMLService(record).catch((mlErr) => {
          console.error("[ML Service] Async error:", mlErr);
        });

        return res.json({ success: true });
      }
    );
  };

  const getRecords = (conductorId: string | null, res: express.Response) => {
    const hasConductorFilter = Boolean(conductorId && conductorId.trim());
    const query = hasConductorFilter
      ? "SELECT * FROM ticket_records WHERE conductor_id = ? ORDER BY timestamp DESC"
      : "SELECT * FROM ticket_records ORDER BY timestamp DESC";
    const params = hasConductorFilter ? [conductorId?.trim()] : [];

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
      }
      return res.json(rows.map(mapTicketRecordRow));
    });
  };

  // API routes FIRST
  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/ml/evaluate", async (req, res) => {
    try {
      const decision = await evaluateWithMlService(req.body || {});
      return res.json(decision);
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || "ML evaluation failed."
      });
    }
  });

  app.post('/auth/register', (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const employeeId = String(req.body?.employeeId || '').trim();

    if (!username || !password || !employeeId) {
      return res.status(400).json({ message: 'username, password and employeeId are required.' });
    }

    db.get(
      "SELECT username FROM conductors WHERE username = ? OR employee_id = ?",
      [username, employeeId],
      (findErr, existing) => {
        if (findErr) {
          console.error(findErr);
          return res.status(500).json({ message: findErr.message });
        }
        if (existing) {
          return res.status(409).json({ message: 'Conductor already registered.' });
        }

        db.run(
          `
            INSERT INTO conductors (
              username, employee_id, password_hash, master_photo, last_login, updated_at
            ) VALUES (?, ?, ?, NULL, ?, ?)
          `,
          [username, employeeId, encodePassword(password), Date.now(), Date.now()],
          function (insertErr) {
            if (insertErr) {
              console.error(insertErr);
              return res.status(500).json({ message: insertErr.message });
            }
            return res.status(201).json({ success: true, message: 'Registered on Cloud Server.' });
          }
        );
      }
    );
  });

  app.post('/auth/login', (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      return res.status(400).json({ message: 'username and password are required.' });
    }

    db.get(
      "SELECT username, employee_id, password_hash, master_photo FROM conductors WHERE username = ?",
      [username],
      (err, row: any) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: err.message });
        }
        if (!row) {
          return res.status(404).json({ message: 'User not found on cloud.' });
        }
        if (row.password_hash !== encodePassword(password)) {
          return res.status(401).json({ message: 'Invalid Cloud Credentials' });
        }

        db.run(
          "UPDATE conductors SET last_login = ?, updated_at = ? WHERE username = ?",
          [Date.now(), Date.now(), username]
        );

        return res.json({
          employeeId: row.employee_id,
          masterPhoto: row.master_photo || undefined
        });
      }
    );
  });

  app.post('/user/update', (req, res) => {
    const username = String(req.body?.username || '').trim();
    const employeeId = String(req.body?.employeeId || '').trim();
    const masterPhoto = req.body?.masterPhoto;

    if (!username && !employeeId) {
      return res.status(400).json({ message: 'username or employeeId is required.' });
    }

    if (typeof masterPhoto !== 'string' || !masterPhoto.trim()) {
      return res.json({ success: true, message: 'No cloud fields to update.' });
    }

    db.run(
      `
        UPDATE conductors
        SET master_photo = ?, updated_at = ?
        WHERE username = ? OR employee_id = ?
      `,
      [masterPhoto, Date.now(), username, employeeId],
      function (err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: err.message });
        }
        if (this.changes === 0) {
          return res.status(404).json({ message: 'Conductor not found.' });
        }
        return res.json({ success: true });
      }
    );
  });

  app.post('/shifts', (req, res) => {
    const conductorId = String(req.body?.conductorId || '').trim();
    const driverId = String(req.body?.driverId || '').trim();
    const vehicleNo = String(req.body?.vehicleNo || '').trim();
    const startTime = Number(req.body?.startTime || Date.now());
    const conductorSelfie =
      typeof req.body?.conductorSelfie === 'string' ? req.body.conductorSelfie : null;

    if (!conductorId || !driverId || !vehicleNo || Number.isNaN(startTime)) {
      return res.status(400).json({ message: 'Invalid shift payload.' });
    }

    db.run(
      `
        INSERT OR REPLACE INTO active_shifts (
          conductor_id, driver_id, vehicle_no, start_time, conductor_selfie, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [conductorId, driverId, vehicleNo, startTime, conductorSelfie, Date.now()],
      function (err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: err.message });
        }
        return res.json({ success: true });
      }
    );
  });

  app.get('/shift/active', (req, res) => {
    const conductorId = String(req.query?.conductorId || '').trim();
    if (!conductorId) {
      return res.status(400).json({ message: 'conductorId is required.' });
    }

    db.get(
      "SELECT * FROM active_shifts WHERE conductor_id = ?",
      [conductorId],
      (err, row: any) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: err.message });
        }
        if (!row) {
          return res.status(404).json({ message: 'No active cloud shift.' });
        }
        return res.json(mapShiftRow(row));
      }
    );
  });

  app.post('/records', (req, res) => {
    return saveTicketRecord(req.body, res);
  });

  app.get('/records', (req, res) => {
    const conductorId = String(req.query?.conductorId || '').trim() || null;
    return getRecords(conductorId, res);
  });

  app.post('/api/records', (req, res) => {
    return saveTicketRecord(req.body, res);
  });

  app.get('/api/records', (req, res) => {
    const conductorId = String(req.query?.conductorId || '').trim() || null;
    return getRecords(conductorId, res);
  });

  app.get('/api/admin/raw-logs', (req, res) => {
    db.all("SELECT * FROM ticket_records ORDER BY timestamp DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({
            total_records: rows.length,
            records: rows
        });
    });
  });

  app.get("/api/admin/training-sheet", (req, res) => {
    const absolutePath = path.resolve(TRAINING_SHEET_PATH);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: "Training sheet not found." });
    }
    return res.download(absolutePath, path.basename(absolutePath));
  });

  app.get("/api/logs/recent", (req, res) => {
    return res.json(recentLogs);
  });

  app.get("/api/logs/activity", (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const eventType = req.query.eventType as string;
    const userId = req.query.userId as string;

    let query = "SELECT * FROM activity_logs WHERE 1=1";
    const params: any[] = [];

    if (eventType) {
      query += " AND event_type = ?";
      params.push(eventType);
    }

    if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }

    query += " ORDER BY timestamp DESC LIMIT ?";
    params.push(limit);

    db.all(query, params, (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      return res.json({
        total: rows.length,
        logs: rows
      });
    });
  });

  app.get("/api/logs/stats", (req, res) => {
    db.all("SELECT event_type, COUNT(*) as count FROM activity_logs GROUP BY event_type", [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const stats = rows.reduce((acc: any, row: any) => {
        acc[row.event_type] = row.count;
        return acc;
      }, {});

      return res.json(stats);
    });
  });

  app.get("/api/logs/ocr-accuracy", (req, res) => {
    db.all(
      "SELECT scan_method, AVG(CAST(ocr_accuracy AS FLOAT)) as avg_accuracy, COUNT(*) as count FROM activity_logs WHERE ocr_accuracy IS NOT NULL GROUP BY scan_method",
      [],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        return res.json(
          rows.map((row: any) => ({
            method: row.scan_method,
            avgAccuracy: Number(row.avg_accuracy || 0),
            count: row.count
          }))
        );
      }
    );
  });

  app.get("/api/ml-metrics", (req, res) => {
    db.all(
      `SELECT
        COUNT(*) as total_verifications,
        COUNT(*) as successful_verifications,
        AVG(CAST(ocr_accuracy AS FLOAT)) as avg_ocr_accuracy,
        MAX(timestamp) as last_verification_time
      FROM activity_logs
      WHERE event_type = 'TICKET_CREATED'`,
      [],
      (err, rows: any[]) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const metrics: any = rows[0] || {
          total_verifications: 0,
          successful_verifications: 0,
          avg_ocr_accuracy: 0,
          last_verification_time: null
        };

        if (metrics.total_verifications === 0) {
          return res.json({});
        }

        return res.json(metrics);
      }
    );
  });

  app.get("/api/logs/verification", (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const scanMethod = req.query.scanMethod as string;
    const offset = (page - 1) * limit;

    let query = "SELECT * FROM activity_logs WHERE event_type = 'TICKET_CREATED'";
    const params: any[] = [];

    if (scanMethod && scanMethod !== "all") {
      query += " AND scan_method = ?";
      params.push(scanMethod);
    }

    db.get(
      query.replace("SELECT *", "SELECT COUNT(*) as count"),
      params,
      (countErr, countRow: any) => {
        if (countErr) {
          return res.status(500).json({ error: countErr.message });
        }

        const total = countRow?.count || 0;

        db.all(
          `${query} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset],
          (err, rows: any[]) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }

            return res.json({
              total,
              page,
              limit,
              total_pages: Math.ceil(total / limit),
              logs: rows.map((log) => ({
                id: log.id,
                timestamp: new Date(log.timestamp),
                scan_method: log.scan_method,
                ocr_accuracy: log.ocr_accuracy,
                user_id: log.user_id,
                resource_id: log.resource_id,
                status: log.ocr_accuracy > 0.8 ? "SUCCESS" : "WARNING"
              }))
            });
          }
        );
      }
    );
  });

  app.use(["/api", "/auth", "/records", "/shifts", "/shift", "/user"], (req, res) => {
    return res.status(404).json({
      error: "Route not found in integrated mode.",
      path: req.originalUrl
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    if (fs.existsSync('dist')) {
      app.use(express.static('dist'));
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
