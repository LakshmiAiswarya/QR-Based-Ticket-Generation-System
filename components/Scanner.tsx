import React, { useState, useRef, useEffect } from 'react';
import { Camera, Bus, MapPinned, Loader2, RefreshCw, Navigation, UserCheck, AlertCircle, Heart, UserX, CheckCircle2, Upload, QrCode, Power, XCircle, ShieldCheck, UserRound, Zap, Fingerprint, Search, Info, ScanLine, HandMetal, History, ShieldAlert, UserPlus, Repeat, ChevronDown } from 'lucide-react';
import { extractAadharDataFromImage, validateBiometricCapture, verifyBiometricMatch, warmUpOcrWorker } from '../services/geminiService';
import { detectQrFromImage, parseAadharQrData } from '../services/aadharQrService';
import {
  buildValidationMessage,
  cleanIdentityName,
  cleanPincode,
  hasMinimumIssuableIdentity,
  isAndhraPradesh,
  isLikelyValidIdentityName,
  normalizeGender
} from '../services/aadhaarValidationService';
import { storageService } from '../services/storageService';
import { STANDARD_DISTANCES } from '../services/geoService';
import { evaluateIssuanceDecision } from '../services/mlIssuanceService';
import { AadharData } from '../types';

// Task 9.1: Multi-step audit progress steps
const AUDIT_STEPS = [
  { label: 'Read ID',    threshold: 25 },
  { label: 'OCR / QR',  threshold: 50 },
  { label: 'Face Check', threshold: 80 },
  { label: 'ML Trust',  threshold: 100 },
];

interface ScannerProps {
  onDataExtracted: (data: AadharData, method: 'QR' | 'AI_OCR' | 'MANUAL_OFFLINE') => void;
  onDataDenied?: (data: AadharData, reason: string) => void;
  onToast?: (message: string, tone?: 'error' | 'success' | 'info') => void;
}

const ROUTES = [
  "Vijayawada - Guntur",
  "Visakhapatnam - Vizianagaram",
  "Tirupati - Chittoor",
  "Kurnool - Nandyal",
  "Nellore - Ongole",
  "Anantapur - Kadapa"
];

const Scanner: React.FC<ScannerProps> = ({ onDataExtracted, onDataDenied, onToast }) => {
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [step, setStep] = useState<'ID_SCAN' | 'PASSENGER_PHOTO'>('ID_SCAN');
  const [statusMessage, setStatusMessage] = useState("");
  const [auditProgress, setAuditProgress] = useState<number>(0);
  const [error, setError] = useState<{ message: string; isSecurity: boolean; allowManualOverride?: boolean } | null>(null);
  const [selectedRoute, setSelectedRoute] = useState(ROUTES[0]);
  const [idData, setIdData] = useState<AadharData | null>(null);
  const [partialData, setPartialData] = useState<AadharData | null>(null);
  const [liveDistance, setLiveDistance] = useState("CALCULATING...");
  const [isQrFound, setIsQrFound] = useState(false);
  
  // ── State for manual entry fallback ────────────────────────────────────────
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualGender, setManualGender] = useState<'M' | 'F'>('F');
  const [manualPincode, setManualPincode] = useState('');
  const [manualEntryError, setManualEntryError] = useState('');
  // New State: Scan Mode Toggle
  const [scanMode, setScanMode] = useState<'FAST' | 'PRECISE'>('FAST');
  // Bottom sheet route picker
  const [showRoutePicker, setShowRoutePicker] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const attemptCounterRef = useRef(0);
  const lastAttemptAtRef = useRef<number | null>(null);

  useEffect(() => {
    setLiveDistance(STANDARD_DISTANCES[selectedRoute] || "REGIONAL ROUTE");
  }, [selectedRoute]);

  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      const video = videoRef.current;
      video.srcObject = streamRef.current;
      video.onloadedmetadata = () => {
        video.play().catch(e => console.error("Auto-play prevented:", e));
      };
    }
  }, [cameraActive]);

  useEffect(() => {
    let isProcessing = false;
    if (cameraActive && step === 'ID_SCAN' && !loading && !idData) {
      // Faster polling (150ms) for responsive QR detection
      // We use a smaller frame (600px) for QR detection to save CPU
      scanIntervalRef.current = window.setInterval(() => {
        if (isProcessing || loading) return;

        const frame = captureFrameData(600);
        if (frame && frame.imageData) {
          const qrText = detectQrFromImage(frame.imageData, frame.width!, frame.height!);
          if (qrText) {
            const parsed = parseAadharQrData(qrText);
            if (parsed) {
              isProcessing = true;
              // Haptic Feedback for physical confirm
              if (navigator.vibrate) navigator.vibrate(200);
              
              setIsQrFound(true);
              // Immediate processing - capture full resolution for OCR proof
              const fullFrame = captureFrameData();
              if (fullFrame) {
                processImageForId(fullFrame.dataUrl, { data: frame.imageData!, w: frame.width!, h: frame.height! });
              }
            }
          }
        }
      }, 150); 
    } else {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    }

    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [cameraActive, step, loading, idData]);

  useEffect(() => {
    if (!cameraActive || loading || step !== 'ID_SCAN') return;
    warmUpOcrWorker().catch(() => {
      // Warm-up best-effort; if it fails, OCR will still load when needed.
    });
  }, [cameraActive, loading, step]);

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setIsQrFound(false);
  };

  const startCamera = async (forceStep?: 'ID_SCAN' | 'PASSENGER_PHOTO') => {
    stopCamera();
    setError(null);
    setIsQrFound(false);
    // Only reset partial data if explicitly restarting scan step
    if (forceStep === 'ID_SCAN' || (!forceStep && step === 'ID_SCAN')) {
        setPartialData(null);
        if (!idData) {
          resetRiskTelemetry();
        }
    }
    
    const activeStep = forceStep || step;
    try {
      const constraints = {
        video: {
          facingMode: activeStep === 'PASSENGER_PHOTO' ? "user" : "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setCameraActive(true); 
    } catch (err) {
      setError({ message: "Camera permission denied.", isSecurity: false });
    }
  };

  const captureFrameData = (maxDim?: number): { dataUrl: string; imageData?: Uint8ClampedArray; width?: number; height?: number } | null => {
    if (videoRef.current && canvasRef.current && cameraActive) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (!video.videoWidth || !video.videoHeight) return null;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      // Calculate dimensions based on maxDim if provided
      let targetWidth = video.videoWidth;
      let targetHeight = video.videoHeight;

      if (maxDim) {
        if (targetWidth > targetHeight) {
          if (targetWidth > maxDim) {
            targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
            targetWidth = maxDim;
          }
        } else {
          if (targetHeight > maxDim) {
            targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
            targetHeight = maxDim;
          }
        }
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      
      ctx.save();
      if (step === 'PASSENGER_PHOTO') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return { dataUrl, imageData: imgData.data, width: canvas.width, height: canvas.height };
      } catch (e) {
        return { dataUrl };
      }
    }
    return null;
  };

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const estimateSharpness = (imageData: Uint8ClampedArray): number => {
    let edgeSum = 0;
    const stride = 4;
    const widthEstimate = Math.sqrt(imageData.length / stride);
    const step = Math.max(1, Math.floor(widthEstimate / 120));
    const limit = imageData.length - (stride * 3);

    for (let i = 0; i < limit; i += stride * step) {
      const g1 = (imageData[i] + imageData[i + 1] + imageData[i + 2]) / 3;
      const g2 = (imageData[i + stride] + imageData[i + stride + 1] + imageData[i + stride + 2]) / 3;
      edgeSum += Math.abs(g2 - g1);
    }

    return edgeSum;
  };

  const captureBurstFrames = async (count = 4, delayMs = 70) => {
    const frames: Array<{ dataUrl: string; quality: number }> = [];
    for (let i = 0; i < count; i++) {
      const frame = captureFrameData(1100);
      if (frame) {
        const quality = frame.imageData ? estimateSharpness(frame.imageData) : 0;
        frames.push({ dataUrl: frame.dataUrl, quality });
      }
      if (i < count - 1) {
        await wait(delayMs);
      }
    }
    return frames.sort((a, b) => b.quality - a.quality);
  };

  const notify = (message: string, tone: 'error' | 'success' | 'info' = 'error') => {
    onToast?.(message, tone);
  };

  const resetRiskTelemetry = () => {
    attemptCounterRef.current = 0;
    lastAttemptAtRef.current = null;
  };

  const registerAttempt = () => {
    const now = Date.now();
    const previousAttemptAt = lastAttemptAtRef.current;
    attemptCounterRef.current += 1;
    lastAttemptAtRef.current = now;

    return {
      retryCount: Math.max(0, attemptCounterRef.current - 1),
      timeBetweenAttempts: previousAttemptAt ? Number(((now - previousAttemptAt) / 1000).toFixed(2)) : 0
    };
  };

  const estimateDeviceFingerprintEntropy = () => {
    if (typeof navigator === 'undefined') {
      return 0;
    }

    const signature = [
      navigator.userAgent || '',
      navigator.language || '',
      navigator.platform || '',
      String(navigator.hardwareConcurrency || 0),
      String(navigator.maxTouchPoints || 0)
    ].join('|');

    return Math.max(0, Math.min(1, new Set(signature).size / 42));
  };

  const deriveEventRiskLevel = (
    data: Partial<AadharData>,
    method: 'QR' | 'AI_OCR' | 'MANUAL_OFFLINE',
    retryCount: number
  ) => {
    if (typeof data.eventRiskLevel === 'number') {
      return Math.max(0, Math.min(3, Math.round(data.eventRiskLevel)));
    }

    let risk = 0;

    if (method === 'AI_OCR') {
      risk += 1;
    }

    if (method === 'MANUAL_OFFLINE') {
      risk += 2;
    }

    if (partialData) {
      risk += 1;
    }

    if (retryCount > 1) {
      risk += 1;
    }

    if (!data.qrValidationFlag && (data.ocrConfidence || 0) < 0.72) {
      risk += 1;
    }

    return Math.max(0, Math.min(3, risk));
  };

  const finalizeApprovedIssuance = async (
    data: AadharData,
    method: 'QR' | 'AI_OCR' | 'MANUAL_OFFLINE',
    evidenceImage?: string
  ) => {
    setAuditProgress(92);
    setStatusMessage("Running ML Trust Check...");

    const retryCount = data.retryCount ?? Math.max(0, attemptCounterRef.current - 1);
    const timeBetweenAttempts = data.timeBetweenAttempts ?? 0;
    const mlDecision = await evaluateIssuanceDecision({
      verificationMethod: method,
      documentType: data.documentType || 'AADHAAR',
      qrValidationFlag: data.qrValidationFlag,
      qrConfidence: data.qrConfidence,
      ocrConfidence: data.ocrConfidence,
      biometricConfidence: data.biometricConfidence,
      faceSimilarityScore: data.faceSimilarityScore,
      livenessScore: data.livenessScore,
      retryCount,
      timeBetweenAttempts,
      deviceFingerprintEntropy: data.deviceFingerprintEntropy ?? estimateDeviceFingerprintEntropy(),
      ipRiskScore: data.ipRiskScore ?? 0,
      geoLocationShiftFlag: data.geoLocationShiftFlag ?? false,
      eventRiskLevel: deriveEventRiskLevel(data, method, retryCount),
      gateId: data.vehicleNo || 'unknown',
      isFreeTicket: data.gender === 'F' && data.isEligible,
      usageCount: data.usageCount || 1
    });

    const enrichedData: AadharData = {
      ...data,
      retryCount,
      timeBetweenAttempts,
      deviceFingerprintEntropy: data.deviceFingerprintEntropy ?? estimateDeviceFingerprintEntropy(),
      ipRiskScore: data.ipRiskScore ?? 0,
      geoLocationShiftFlag: data.geoLocationShiftFlag ?? false,
      eventRiskLevel: deriveEventRiskLevel(data, method, retryCount),
      mlTrustScore: mlDecision.trustScore,
      mlDecision: mlDecision.decision,
      mlDecisionSource: mlDecision.source,
      mlDecisionReason: mlDecision.reason,
      mlAnomalyScore: mlDecision.anomalyScore ?? undefined,
      mlAnomalyFlag: mlDecision.anomalyFlag
    };

    if (!mlDecision.approved) {
      // Safe UX change:
      // - Do NOT hard-terminate for "low trust" ML denials.
      // - Instead, route to the existing supervisor flow (Manual Override).
      // - Keep hard termination for explicitly "anomaly" flagged events.
      const isAnomalyDeny = mlDecision.anomalyFlag === true;
      const isLowTrustDeny = !isAnomalyDeny;

      if (isLowTrustDeny) {
        setError({
          message: `${mlDecision.reason} Supervisor review required (Manual Override available).`,
          isSecurity: true,
          allowManualOverride: true
        });
        setStatusMessage('ML Review Required');
        notify(
          `${mlDecision.reason} Manual Override available for supervisor review.`,
          'error'
        );

        // Still record the denial for auditing, but don't terminate issuance flow immediately.
        reportDeniedAttempt(
          'ML_LOW_TRUST_REVIEW',
          `${mlDecision.reason} (Manual Override requested by supervisor)`,
          evidenceImage || data.passengerPhoto || data.imageProof,
          enrichedData
        );

        // Stop camera / reset loader state but keep Manual Override UI available.
        setLoading(false);
        setAuditProgress(0);
        setCameraActive(false);
        return false;
      }

      // Anomaly-guard denials remain hard-blocked.
      terminateAttempt(
        'ML_RISK_REJECTED',
        `${mlDecision.reason} Ticket issuance terminated.`,
        evidenceImage || data.passengerPhoto || data.imageProof,
        enrichedData
      );
      return false;
    }

    setAuditProgress(100);
    setStatusMessage("ML Cleared. Issuing...");
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    await wait(250);

    onDataExtracted({
      ...enrichedData,
      timestamp: Date.now()
    }, method);

    stopCamera();
    setLoading(false);
    setAuditProgress(0);
    setStep('ID_SCAN');
    setIdData(null);
    setPartialData(null);
    setError(null);
    resetRiskTelemetry();
    return true;
  };

  const resetScannerFlow = () => {
    stopCamera();
    setLoading(false);
    setAuditProgress(0);
    setStep('ID_SCAN');
    setIdData(null);
    setPartialData(null);
    resetRiskTelemetry();
  };

  const reportDeniedAttempt = (
    reasonCode: string,
    message: string,
    evidenceImage?: string,
    seedData?: Partial<AadharData>
  ) => {
    if (!onDataDenied) {
      return;
    }

    onDataDenied(
      {
        name: cleanIdentityName(seedData?.name) || 'UNVERIFIED',
        gender: normalizeGender(seedData?.gender) || 'UNKNOWN',
        pincode: cleanPincode(seedData?.pincode),
        isEligible: false,
        isAuthentic: false,
        documentType: seedData?.documentType || 'UNKNOWN',
        authenticityReason: message,
        reason: message,
        route: seedData?.route || selectedRoute,
        imageProof: evidenceImage || seedData?.imageProof,
        passengerPhoto: evidenceImage || seedData?.passengerPhoto || seedData?.imageProof,
        timestamp: Date.now()
      },
      reasonCode
    );
  };

  const terminateAttempt = (
    reasonCode: 'INVALID_DOCUMENT' | 'INVALID_PHOTO' | 'INSUFFICIENT_DATA' | 'BIOMETRIC_REJECTED' | 'ML_RISK_REJECTED',
    message: string,
    evidenceImage?: string,
    seedData?: Partial<AadharData>
  ) => {
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    setError({ message, isSecurity: true, allowManualOverride: false });
    setStatusMessage('ISSUANCE TERMINATED');
    notify(message, 'error');
    reportDeniedAttempt(reasonCode, message, evidenceImage, seedData);
    resetScannerFlow();
  };

  /**
   * Handles file uploads for Aadhaar ID scanning.
   *
   * Accepted formats:
   * - Images: JPEG, PNG, WebP, HEIC, BMP, GIF, TIFF (any image/*)
   * - PDF: e-Aadhaar / DigiLocker PDF — first page rendered to canvas
   *
   * For PDFs we use the browser's built-in PDF rendering via an <iframe>
   * + html2canvas, or fall back to sending the raw file to the OCR pipeline
   * as a data URL with mimeType application/pdf if the Gemini API supports it.
   */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const isImage = file.type.startsWith('image/') ||
      /\.(jpe?g|png|webp|heic|heif|bmp|gif|tiff?)$/i.test(file.name);
    const isPdf = file.type === 'application/pdf' ||
      /\.pdf$/i.test(file.name);

    if (!isImage && !isPdf) {
      notify('Please upload an Aadhaar image or PDF.', 'error');
      return;
    }

    if (isPdf) {
      // Render the PDF first page to a canvas image via an object URL + html2canvas
      renderPdfFirstPageToImage(file)
        .then(dataUrl => {
          if (dataUrl) processImageForId(dataUrl);
          else {
            notify('Could not render Aadhaar PDF page. Use manual entry.', 'error');
          }
        })
        .catch((err) => {
          console.error(err);
          notify(`Could not render Aadhaar PDF: ${err instanceof Error ? err.message : String(err)}. Use manual entry.`, 'error');
          setLoading(false);
          setAuditProgress(0);
          setError({ message: 'Could not read Aadhaar PDF.', isSecurity: false, allowManualOverride: true });
          resetScannerFlow();
          setShowManualEntry(true);
        });
      return;
    }

    // Standard image path
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (result) processImageForId(result);
    };
    reader.readAsDataURL(file);
  };

  /**
   * Renders the first page of a PDF file to a JPEG data URL using
   * a hidden <canvas> element. Works in all modern browsers via the
   * native PDF renderer exposed through an <object> element + html2canvas,
   * or via the window.html2canvas CDN script already loaded in index.html.
   */
  const renderPdfFirstPageToImage = async (file: File): Promise<string | null> => {
    try {
      // Keep PDF.js out of the application startup path. Its modern build uses
      // browser APIs that are unavailable on some field devices and can blank
      // the entire app if evaluated before the login screen renders.
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

      // Convert PDF to ArrayBuffer for PDF.js
      const buffer = await file.arrayBuffer();

      // Configure worker (required by pdfjs-dist in many bundlers)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfjsAny = pdfjsLib as any;
      if (pdfjsAny.GlobalWorkerOptions) {
        const version = pdfjsAny.version || '5.7.284';
        pdfjsAny.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${version}/legacy/build/pdf.worker.min.mjs`;
      }

      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      const pdf = await loadingTask.promise;

      const page = await pdf.getPage(1);

      // Scale 2.0 provides an excellent balance of OCR clarity and speed (Tesseract struggles with massive images)
      const scale = 2.0;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const renderContext = {
        canvasContext: ctx,
        canvas: canvas,
        viewport,
      };

      await page.render(renderContext).promise;

      // Convert to JPEG for Tesseract
      return canvas.toDataURL('image/jpeg', 0.95);
    } catch (err) {
      console.error('PDF Render Error:', err);
      throw err;
    }
  };

  const processImageForId = async (dataUrl: string, pixelData?: { data: Uint8ClampedArray, w: number, h: number }) => {
    if (loading) return;

    const attemptMetrics = registerAttempt();
    let preserveProgress = false;
    setLoading(true);
    setError(null);
    setAuditProgress(15);
    setStatusMessage(partialData ? "Scanning Back Side..." : "Reading Card...");

    try {
      let extractedData: AadharData | null = null;
      let method: 'QR' | 'AI_OCR' = 'QR';

      // Some Aadhaar QRs (UIDAI Secure QR v2) are detectable by jsQR but the payload
      // is not directly readable client-side. parseAadharQrData() may return a
      // sentinel with qrValidationFlag=true and empty name/pincode.
      // In that case we must fall back to OCR, but keep qrValidationFlag=true
      // so ML trust scoring still benefits from "QR was present".
      let qrWasPresentButIncomplete = false;
      let qrConfidenceFromQr: number | undefined;

      if (pixelData) {
        setStatusMessage("Decoding QR Code...");
        const qrText = detectQrFromImage(pixelData.data, pixelData.w, pixelData.h);
        if (qrText) {
          const parsed = parseAadharQrData(qrText);
          if (parsed) {
            const hasValidName = Boolean(parsed.name && isLikelyValidIdentityName(parsed.name));
            const hasValidPincode = Boolean(parsed.pincode && parsed.pincode.length === 6);

            if (parsed.qrValidationFlag === true && (!hasValidName || !hasValidPincode)) {
              qrWasPresentButIncomplete = true;
              qrConfidenceFromQr = parsed.qrConfidence;
              extractedData = null; // force OCR fallback
            } else {
              extractedData = parsed;
            }
          }
        }
      }

      if (!extractedData) {
        setAuditProgress(40);
        setStatusMessage("Reading Card Text (OCR)...");

        extractedData = await extractAadharDataFromImage(dataUrl, scanMode);

        if (qrWasPresentButIncomplete && extractedData) {
          extractedData = {
            ...extractedData,
            qrValidationFlag: true,
            qrConfidence:
              typeof qrConfidenceFromQr === "number"
                ? qrConfidenceFromQr
                : (extractedData.qrConfidence ?? 0.85),
          };
          // Keep verificationMethod as 'QR' so downstream ML risk features include QR presence.
          method = 'QR';
        } else {
          method = 'AI_OCR';
        }
      }

      extractedData = {
        ...extractedData,
        name: cleanIdentityName(extractedData.name) || extractedData.name,
        gender: normalizeGender(extractedData.gender) || extractedData.gender,
        pincode: cleanPincode(extractedData.pincode),
        documentType: extractedData.documentType || 'AADHAAR'
      };

      if (extractedData.isAuthentic === false || extractedData.documentType !== 'AADHAAR') {
        terminateAttempt(
          'INVALID_DOCUMENT',
          extractedData.authenticityReason ||
            buildValidationMessage('INVALID_DOCUMENT', 'Please scan an Aadhaar card only.'),
          dataUrl,
          extractedData
        );
        return;
      }

      // --- LOGIC FOR PINCODE ON BACK SIDE ---
      
      // Case 1: Merge Partial Data (We are scanning back)
      if (partialData) {
        const mergedPincode = cleanPincode(extractedData.pincode || partialData.pincode);

        if (mergedPincode.length === 6) {
          const mergedGender = normalizeGender(partialData.gender || extractedData.gender);
          const isAP = isAndhraPradesh(mergedPincode);
          extractedData = {
            ...extractedData,
            ...partialData,
            name: isLikelyValidIdentityName(partialData.name) ? partialData.name : extractedData.name,
            gender: mergedGender || partialData.gender,
            pincode: mergedPincode,
            isEligible: mergedGender === 'F' && isAP,
            documentType: 'AADHAAR',
            reason: undefined
          };

          if (extractedData.gender === 'M') extractedData.reason = "MALE (PAID)";
          else if (!extractedData.isEligible) extractedData.reason = "NON-AP (PAID)";

          setPartialData(null);
        } else {
          terminateAttempt(
            'INSUFFICIENT_DATA',
            buildValidationMessage('INSUFFICIENT_DATA', 'Back-side Aadhaar address was not readable.'),
            dataUrl,
            { ...partialData, ...extractedData }
          );
          return;
        }
      } 
      // Case 2: Front Scan Missing Pincode
      else if (!extractedData.pincode || extractedData.pincode.length < 6) {
        if (isLikelyValidIdentityName(extractedData.name) && normalizeGender(extractedData.gender)) {
          setPartialData({
            ...extractedData,
            imageProof: dataUrl,
            retryCount: attemptMetrics.retryCount,
            timeBetweenAttempts: attemptMetrics.timeBetweenAttempts
          });
          setAuditProgress(50);
          setStatusMessage("FRONT SCANNED. FLIP TO BACK FOR ADDRESS...");
          setLoading(false);
          preserveProgress = true;
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          return;
        }

        console.error("Missing front side fields:", extractedData);
        terminateAttempt(
          'INSUFFICIENT_DATA',
          buildValidationMessage('INSUFFICIENT_DATA', 'Required Aadhaar fields were not found.'),
          dataUrl,
          extractedData
        );
        return;
      }

      // --- END BACK SIDE LOGIC ---

      if (!hasMinimumIssuableIdentity(extractedData)) {
        console.error("Failed hasMinimumIssuableIdentity:", extractedData);
        terminateAttempt(
          'INSUFFICIENT_DATA',
          buildValidationMessage('INSUFFICIENT_DATA', 'Required Aadhaar fields were not found.'),
          dataUrl,
          extractedData
        );
        return;
      }

      setAuditProgress(80);
      
      const previousPhoto = storageService.getLastPassengerPhoto(extractedData.name, extractedData.pincode);
      
      const fullData = { 
          ...extractedData, 
          route: selectedRoute, 
          imageProof: partialData?.imageProof || dataUrl,
          distanceAtIssue: liveDistance,
          previousPassengerPhoto: previousPhoto,
          retryCount: attemptMetrics.retryCount,
          timeBetweenAttempts: attemptMetrics.timeBetweenAttempts
      };
      
      const isFreeTicket = fullData.gender === 'F' && fullData.isEligible;

      setAuditProgress(100);

      if (isFreeTicket) {
        if (navigator.vibrate) navigator.vibrate(100);
        
        // Distinct UI messaging for First Time vs Returning
        const msg = previousPhoto 
            ? "Welcome Back. Verifying Face..." 
            : "First Trip. Registering Face...";
            
        setStatusMessage(msg);
        setIdData(fullData);
        setStep('PASSENGER_PHOTO');
        stopCamera();
      } else {
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        await finalizeApprovedIssuance({
          ...fullData,
          passengerPhoto: undefined
        }, method, dataUrl);
      }
    } catch (err: any) {
      const message = err?.message || "Identification failed.";
      const reasonCode = message.startsWith('Invalid document uploaded')
        ? 'INVALID_DOCUMENT'
        : message.startsWith('Invalid photo uploaded')
          ? 'INVALID_PHOTO'
          : message.startsWith('Not sufficient data')
            ? 'INSUFFICIENT_DATA'
            : null;

      if (reasonCode) {
        terminateAttempt(reasonCode, message, dataUrl, partialData || undefined);
        return;
      }

      setError({ message, isSecurity: true });
      notify(message, 'error');
    } finally {
      if (!preserveProgress) {
        setLoading(false);
        setAuditProgress(0);
      }
    }
  };

  const snapPassenger = async () => {
    if (!idData) return;
    
    const attemptMetrics = registerAttempt();
    setError(null);
    setLoading(true);
    setAuditProgress(50);
    
    // SMART VERIFICATION LOGIC
    // 1. First Time: Take Image -> Compare with ID Card -> If Same -> Issue Ticket (and Save Image)
    // 2. Returning: Take Image -> Compare with Previous Saved Image -> If Same -> Issue Ticket
    const useHistory = !!idData.previousPassengerPhoto;
    
    setStatusMessage(useHistory 
        ? "Matching with History..." 
        : "Verifying with ID Card..."
    );
    
    try {
      const frames = await captureBurstFrames(4, 75);
      if (frames.length === 0) {
        throw new Error("Could not capture a clear passenger frame. Please retry.");
      }

      // Select Reference Image based on history availability
      const referenceImage = useHistory ? idData.previousPassengerPhoto! : idData.imageProof!;
      const candidateFrames = frames.slice(0, 2);

      let bestResult: Awaited<ReturnType<typeof verifyBiometricMatch>> | null = null;
      let selectedFrame = candidateFrames[0];
      let selectedLivenessScore = 0;
      let lastCaptureReason = "";

      for (const candidate of candidateFrames) {
        const captureAssessment = await validateBiometricCapture(candidate.dataUrl, 'PASSENGER');
        if (!captureAssessment.valid) {
          lastCaptureReason = captureAssessment.reason || buildValidationMessage('INVALID_PHOTO', 'Use a clear live passenger photo.');
          continue;
        }

        const result = await verifyBiometricMatch(
          referenceImage,
          candidate.dataUrl,
          useHistory ? 'HISTORY' : 'ID_CARD'
        );

        if (!bestResult || result.confidence > bestResult.confidence) {
          bestResult = result;
          selectedFrame = candidate;
          selectedLivenessScore = captureAssessment.livenessScore;
        }

        if (result.match) {
          bestResult = result;
          selectedFrame = candidate;
          selectedLivenessScore = captureAssessment.livenessScore;
          break;
        }
      }

      if (!bestResult && lastCaptureReason) {
        throw new Error(lastCaptureReason);
      }

      if (!bestResult || !bestResult.match) {
        const reason =
          bestResult?.reason ||
          `Face mismatch or low confidence (${(bestResult?.confidence || 0).toFixed(2)} < ${(bestResult?.threshold || 0).toFixed(2)})`;
        throw new Error(reason);
      }

      await finalizeApprovedIssuance({
        ...idData,
        biometricConfidence: bestResult.confidence,
        faceSimilarityScore: bestResult.confidence,
        livenessScore: selectedLivenessScore,
        passengerPhoto: selectedFrame.dataUrl,
        retryCount: attemptMetrics.retryCount,
        timeBetweenAttempts: attemptMetrics.timeBetweenAttempts
      }, 'AI_OCR', selectedFrame.dataUrl);
      
    } catch (err: any) {
      const message = err.message || "Biometric validation failed.";
      setError({ message, isSecurity: true, allowManualOverride: true });
      notify(message, 'error');
      setLoading(false);
      setAuditProgress(0);
    }
  };

  const handleManualOverride = async () => {
    if (!idData) return;
    const frame = captureFrameData();

    const attemptMetrics = registerAttempt();
    setError(null);
    setLoading(true);
    setAuditProgress(88);

    await finalizeApprovedIssuance({
      ...idData,
      passengerPhoto: frame?.dataUrl,
      biometricConfidence: idData.biometricConfidence,
      authenticityReason: "MANUAL_OVERRIDE",
      retryCount: attemptMetrics.retryCount,
      timeBetweenAttempts: attemptMetrics.timeBetweenAttempts,
      eventRiskLevel: Math.max(idData.eventRiskLevel || 0, 2)
    }, 'MANUAL_OFFLINE', frame?.dataUrl);
  };

  // NEW: Mark as Fraud Handler
  const handleMarkAsFraud = () => {
    if (!idData) return;
    const frame = captureFrameData(); // Capture evidence of who is trying to use it
    
    if (onDataDenied) {
        onDataDenied({
            ...idData,
            passengerPhoto: frame?.dataUrl,
            timestamp: Date.now(),
            reason: "FRAUD_SUSPECTED"
        }, "BIOMETRIC_FRAUD");
    }

    if (navigator.vibrate) navigator.vibrate([500, 100, 500]); // Long vibration alert
    notify("Ticket issuance terminated. Biometric fraud suspected.", 'error');
    
    setLoading(false);
    setError(null);
    setStatusMessage("REPORTED AS FRAUD");
    
    setTimeout(() => {
        stopCamera();
        setStep('ID_SCAN');
        setIdData(null);
        setPartialData(null);
        resetRiskTelemetry();
    }, 1000);
  };

  /**
   * Submits manually entered Aadhaar details.
   * Used when camera and file upload both fail (e.g. damaged card, no camera).
   * Logged as MANUAL_OFFLINE with elevated risk level.
   */
  const handleManualEntrySubmit = () => {
    setManualEntryError('');
    const name = cleanIdentityName(manualName);
    const pincode = cleanPincode(manualPincode);

    if (!isLikelyValidIdentityName(name)) {
      setManualEntryError('Enter a valid full name (letters only, min 3 characters).');
      return;
    }
    if (pincode.length !== 6) {
      setManualEntryError('Enter a valid 6-digit pincode.');
      return;
    }

    const isAP = isAndhraPradesh(pincode);
    const data: AadharData = {
      name,
      gender: manualGender,
      pincode,
      isEligible: manualGender === 'F' && isAP,
      isAuthentic: true,
      documentType: 'AADHAAR',
      qrValidationFlag: false,
      ocrConfidence: 0,
      reason: manualGender === 'M' ? 'MALE (PAID)' : (!isAP ? 'NON-AP (PAID)' : undefined),
      eventRiskLevel: 2,
    };

    setShowManualEntry(false);
    setManualName('');
    setManualPincode('');

    const attemptMetrics = registerAttempt();
    const isFreeTicket = data.gender === 'F' && data.isEligible;
    const previousPhoto = storageService.getLastPassengerPhoto(data.name, data.pincode);
    const fullData: AadharData = {
      ...data,
      route: selectedRoute,
      distanceAtIssue: liveDistance,
      previousPassengerPhoto: previousPhoto,
      retryCount: attemptMetrics.retryCount,
      timeBetweenAttempts: attemptMetrics.timeBetweenAttempts,
    };

    if (isFreeTicket) {
      setIdData(fullData);
      setStep('PASSENGER_PHOTO');
      notify('Manual entry accepted. Please verify face.', 'info');
    } else {
      setLoading(true);
      setAuditProgress(88);
      setStatusMessage('Manual Entry — ML Check...');
      finalizeApprovedIssuance(fullData, 'MANUAL_OFFLINE').finally(() => {
        setLoading(false);
        setAuditProgress(0);
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 pb-24">
      {/* REAL-TIME ISSUANCE STATUS TRACKER — Task 9.5: hidden when auditProgress===0 and no active scan */}
      {(loading || idData || partialData) && (auditProgress > 0 || loading || idData || partialData) && (
        <div className="w-full bg-white rounded-[2.5rem] p-6 shadow-xl border-t-4 border-brand-red animate-in slide-in-from-top-4 duration-500">
          <div className="flex justify-between items-center mb-4">
             <div className="flex items-center gap-2">
                <div className={`p-2 rounded-xl ${idData ? 'bg-brand-green/10 text-brand-green' : 'bg-brand-red/10 text-brand-red'}`}>
                   {idData ? <UserCheck size={18} /> : (partialData ? <Repeat size={18} className="animate-spin-slow" /> : <Zap size={18} className="animate-pulse" />)}
                </div>
                <div>
                   <p className="text-[10px] font-black uppercase text-gray-400">Status</p>
                   <p className="text-xs font-black text-brand-dark uppercase tracking-tight">
                     {step === 'ID_SCAN' ? (partialData ? 'Address Check' : 'Reading ID') : 'Face Check'}
                   </p>
                </div>
             </div>
             {loading && <Loader2 className="animate-spin text-brand-red" size={18} />}
          </div>
          
          {/* Task 9.2-9.4: Multi-step pill progress indicator */}
          <div className="space-y-3">
            <div className="flex gap-2">
              {AUDIT_STEPS.map((s, i) => {
                const prevThreshold = i === 0 ? 0 : AUDIT_STEPS[i - 1].threshold;
                const isCompleted = auditProgress >= s.threshold;
                const isActive = auditProgress >= prevThreshold && auditProgress < s.threshold;
                return (
                  <div key={s.label} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`w-full h-2 rounded-full transition-all duration-300 ${
                      isCompleted ? 'bg-brand-red' : isActive ? 'bg-brand-yellow animate-pulse' : 'bg-gray-100'
                    }`} />
                    <p className={`text-[7px] font-black uppercase tracking-widest text-center ${
                      isCompleted ? 'text-brand-red' : isActive ? 'text-brand-yellow' : 'text-gray-300'
                    }`}>
                      {isCompleted ? '✓' : ''} {s.label}
                    </p>
                    {/* Task 9.4: statusMessage shown below active step */}
                    {isActive && statusMessage && (
                      <p className="text-[7px] font-bold text-brand-dark uppercase text-center leading-tight">{statusMessage}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Viewfinder Section */}
      {cameraActive && (
        <div className="flex flex-col gap-4 animate-in zoom-in duration-300">
          <div className="aspect-[4/3] w-full relative rounded-[2.5rem] border-4 border-white shadow-2xl overflow-hidden bg-brand-dark">
            <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover ${step === 'PASSENGER_PHOTO' ? 'scale-x-[-1]' : ''}`} />
            
            {/* Viewfinder Overlays */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
               <div className={`relative transition-all duration-300 ${step === 'ID_SCAN' ? 'w-3/5 h-2/3 border-2 border-brand-yellow/80 rounded-xl' : 'w-56 h-56 border-2 border-brand-yellow/80 rounded-full'} border-dashed shadow-[0_0_20px_rgba(0,0,0,0.5)]`}>
                  {/* Scanning Line Animation */}
                  {step === 'ID_SCAN' && !loading && (
                    <div className="absolute top-0 left-0 w-full h-0.5 bg-brand-yellow/50 shadow-[0_0_10px_#F27D26] animate-scan-line" />
                  )}
                  {/* Center Dot for aiming */}
                  <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-brand-red rounded-full -translate-x-1/2 -translate-y-1/2"></div>
               </div>
            </div>

            {/* NEW: REFERENCE IMAGE OVERLAY FOR EXPLICIT VERIFICATION MODE */}
            {step === 'PASSENGER_PHOTO' && idData && (
                <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 animate-in slide-in-from-left pointer-events-none">
                    <div className="w-20 h-20 rounded-2xl border-2 border-brand-yellow/50 overflow-hidden shadow-[0_0_15px_rgba(0,0,0,0.5)] bg-black/40 backdrop-blur-sm">
                        <img 
                            src={idData.previousPassengerPhoto || idData.imageProof} 
                            className="w-full h-full object-cover opacity-90"
                            alt="Match Reference" 
                        />
                    </div>
                    <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-brand-yellow/20">
                        <p className="text-[7px] font-black text-brand-yellow uppercase tracking-widest text-center">
                            Matching With
                        </p>
                        <p className="text-[9px] font-black text-white uppercase tracking-tight text-center leading-none mt-0.5">
                            {idData.previousPassengerPhoto ? 'LAST TRIP FACE' : 'ID CARD PHOTO'}
                        </p>
                    </div>
                </div>
            )}

            {/* Task 11.1-11.3: Flip instruction banner — shown when partialData is set during ID_SCAN */}
            {partialData && cameraActive && step === 'ID_SCAN' && (
              <div className="absolute top-0 left-0 w-full z-30 bg-brand-dark text-brand-yellow px-4 py-3 flex items-center justify-center gap-3 animate-in slide-in-from-top duration-300">
                <RefreshCw size={18} className="animate-spin shrink-0" />
                <p className="text-sm font-black uppercase tracking-widest">FLIP CARD — SCAN BACK SIDE</p>
              </div>
            )}

            {/* FLIP CARD INSTRUCTION (center overlay — kept for additional visual cue) */}
            {partialData && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none z-20 animate-in zoom-in">
                    <div className="bg-black/60 p-4 rounded-full backdrop-blur-md">
                        <RefreshCw size={32} className="text-brand-yellow" />
                    </div>
                    <p className="text-brand-yellow font-black uppercase text-xs bg-black/60 backdrop-blur-md px-4 py-2 rounded-full mt-4 tracking-widest border border-brand-yellow/30">
                        Scan Back Side
                    </p>
                </div>
            )}

            <div className="absolute top-4 right-4 bg-brand-red text-white px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-2">
               <span className={`w-1.5 h-1.5 ${isQrFound ? 'bg-brand-green animate-ping' : 'bg-white animate-pulse'} rounded-full`} />
               {isQrFound ? 'QR LOCK' : 'SCANNING...'}
            </div>
            
            {loading && (
              <div className="absolute inset-0 bg-brand-dark/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-30">
                 <div className="relative">
                    <Loader2 className="animate-spin text-brand-yellow" size={48} />
                    <div className="absolute inset-0 flex items-center justify-center">
                       <div className="w-2 h-2 bg-brand-red rounded-full animate-ping" />
                    </div>
                 </div>
                 <div className="flex flex-col items-center gap-1">
                    <p className="text-white font-black uppercase text-[10px] tracking-widest animate-pulse">
                       {statusMessage || 'Processing...'}
                    </p>
                    <div className="w-32 h-1 bg-white/20 rounded-full overflow-hidden">
                       <div 
                         className="h-full bg-brand-yellow transition-all duration-500" 
                         style={{ width: `${auditProgress}%` }}
                       />
                    </div>
                 </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
             {step === 'ID_SCAN' && !partialData && (
               <button 
                 onClick={() => {
                   const frame = captureFrameData();
                   if (frame) processImageForId(frame.dataUrl);
                 }}
                 disabled={loading}
                 className="bg-brand-yellow text-brand-dark font-black px-6 rounded-[2rem] shadow-xl flex items-center justify-center gap-2 uppercase transition-all active:scale-95"
                 title="Manual Photo Scan"
               >
                 <Camera size={20} />
                 <span className="text-[10px]">Photo Scan</span>
               </button>
             )}
             <button 
               onClick={step === 'ID_SCAN' ? () => {
                 const frame = captureFrameData();
                 if (frame && frame.imageData) processImageForId(frame.dataUrl, { data: frame.imageData!, w: frame.width!, h: frame.height! });
                 else if (frame) processImageForId(frame.dataUrl);
               } : snapPassenger}
               disabled={loading}
               className={`flex-1 ${step === 'ID_SCAN' ? (partialData ? 'bg-brand-yellow text-brand-dark' : 'bg-brand-red text-white') : 'bg-brand-green text-white'} font-black py-5 rounded-[2rem] shadow-xl flex items-center justify-center gap-3 uppercase transition-colors duration-300`}
             >
               {partialData ? <Repeat size={20} /> : <QrCode size={20} />}
               {step === 'ID_SCAN' ? (partialData ? 'Capture Back Side' : 'Scan QR Code') : 'Confirm Face'}
             </button>
             <button onClick={stopCamera} disabled={loading} className="bg-brand-dark text-white px-6 rounded-[2rem] shadow-xl transition-all active:scale-95"><XCircle size={24} /></button>
          </div>
        </div>
      )}

      {/* Hero / Start View */}
      {!cameraActive && !loading && (
        <div className="flex flex-col gap-4">
          {!idData ? (
             <div className="space-y-4">
                {/* Task 10.1-10.5: Idle state panel shown when no scan is active */}
                {!partialData && (
                  <div className="bg-brand-cream rounded-[2.5rem] p-6 border border-brand-yellow/20 flex flex-col items-center gap-4 text-center">
                    <div className="p-4 bg-white rounded-[2rem] shadow-sm border border-brand-yellow/10">
                      <ScanLine size={48} className="text-brand-red" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Shift Progress</p>
                      {(() => {
                        const count = storageService.getCurrentShiftStats()?.ticketsIssued ?? 0;
                        return count === 0
                          ? <p className="text-sm font-black text-brand-dark uppercase">No passengers yet</p>
                          : <p className="text-sm font-black text-brand-dark uppercase">{count} verified this shift</p>;
                      })()}
                    </div>
                  </div>
                )}
                <div className="bg-brand-dark text-white p-6 rounded-[2.5rem] shadow-xl relative overflow-hidden border border-brand-yellow/20">
                   <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,214,0,0.18),transparent_32%),linear-gradient(145deg,rgba(255,255,255,0.06),transparent_58%)]" />
                   <div className="relative z-10">
                      <div className="flex items-center justify-between gap-4">
                         <div>
                            <p className="text-[9px] font-black text-brand-yellow uppercase tracking-[0.22em]">Offline Verification Stack</p>
                            <h3 className="text-lg font-black tracking-tight mt-1">Scan the Aadhaar QR code — no internet required</h3>
                         </div>
                         <div className="shrink-0 bg-white/10 border border-white/10 p-3 rounded-2xl">
                            <ShieldCheck size={18} className="text-brand-yellow" />
                         </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-4">
                         <div className="rounded-[1.2rem] bg-white/8 border border-white/10 px-3 py-3 text-center">
                            <QrCode size={16} className="mx-auto text-brand-yellow" />
                            <p className="text-[8px] font-black uppercase tracking-[0.16em] mt-2 text-white/70">QR Scan</p>
                         </div>
                         <div className="rounded-[1.2rem] bg-white/8 border border-white/10 px-3 py-3 text-center">
                            <ScanLine size={16} className="mx-auto text-brand-yellow" />
                            <p className="text-[8px] font-black uppercase tracking-[0.16em] mt-2 text-white/70">Face Check</p>
                         </div>
                         <div className="rounded-[1.2rem] bg-white/8 border border-white/10 px-3 py-3 text-center">
                            <Fingerprint size={16} className="mx-auto text-brand-yellow" />
                            <p className="text-[8px] font-black uppercase tracking-[0.16em] mt-2 text-white/70">ML Trust</p>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-4">
                   <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-brand-red/10 rounded-xl"><MapPinned size={18} className="text-brand-red" /></div>
                      <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Selected Transit Route</p>
                   </div>
                   {/* Task 13.2: Styled trigger button replaces native select */}
                   <button
                     onClick={() => setShowRoutePicker(true)}
                     className="w-full bg-gray-50 border-2 border-transparent hover:border-brand-yellow/40 rounded-2xl py-4 px-6 text-xs font-black text-brand-dark uppercase flex items-center justify-between transition-all"
                   >
                     <span>{selectedRoute}</span>
                     <ChevronDown size={16} className="text-gray-400" />
                   </button>
                </div>

                <div className="flex flex-col gap-3">
                   <button 
                     onClick={() => startCamera('ID_SCAN')} 
                     className="w-full bg-brand-red text-white font-black text-lg py-6 rounded-[2.5rem] shadow-2xl active:scale-95 flex flex-col items-center justify-center gap-2 hover:bg-red-700 transition-all"
                   >
                     <div className="flex items-center gap-3">
                        <QrCode size={28} className="text-brand-yellow" /> 
                        <span className="tracking-tighter uppercase">START SCANNING</span>
                     </div>
                   </button>
                   
                   <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white text-brand-dark border-2 border-gray-100 font-black py-4 rounded-[2rem] shadow-sm flex items-center justify-center gap-2 active:scale-95"
                      >
                        <Upload size={16} className="text-brand-red" />
                        <span className="text-[9px] uppercase tracking-widest">Upload ID / PDF</span>
                      </button>

                      {/* QR tip — replaces scan mode toggle in offline mode */}
                      <div className="bg-brand-cream border-2 border-brand-yellow/20 rounded-[2rem] flex items-center justify-center gap-2 px-4 py-4">
                        <QrCode size={16} className="text-brand-dark shrink-0" />
                        <span className="text-[9px] font-bold text-brand-dark leading-tight">Point at QR code on card</span>
                      </div>
                   </div>

                   {/* Manual entry fallback */}
                   <button
                     onClick={() => setShowManualEntry(true)}
                     className="w-full py-3 text-[9px] font-bold text-gray-400 flex items-center justify-center gap-2 hover:text-brand-dark transition-colors"
                   >
                     <Search size={13} /> Can't scan? Enter details manually
                   </button>

                   <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,application/pdf,.pdf,.heic,.heif,.webp" className="hidden" />
                </div>
             </div>
          ) : (
            <div className="flex flex-col gap-4 animate-in slide-in-from-bottom duration-300">
               {/* Task 4.2: relative added so absolute badges anchor to this card */}
               <div className="bg-white p-6 rounded-[2.5rem] border border-brand-yellow/20 flex flex-col items-center gap-4 text-center shadow-xl relative">
                  {/* Visual Indicator for Returning vs New */}
                  {idData.previousPassengerPhoto ? (
                      <div className="absolute top-4 right-4 bg-brand-green text-white px-3 py-1 rounded-full text-[8px] font-black uppercase flex items-center gap-1 shadow-lg z-10">
                          <History size={10} /> Returning User
                      </div>
                  ) : (
                      <div className="absolute top-4 right-4 bg-brand-yellow text-brand-dark px-3 py-1 rounded-full text-[8px] font-black uppercase flex items-center gap-1 shadow-lg z-10">
                          <UserPlus size={10} /> First Registration
                      </div>
                  )}
                  
                  <div className="w-16 h-16 bg-brand-cream rounded-full flex items-center justify-center shadow-inner border-2 border-white relative overflow-hidden">
                     {idData.imageProof ? (
                       <img src={idData.imageProof} className="w-full h-full object-cover opacity-50" />
                     ) : (
                       <Fingerprint size={40} className="text-brand-red animate-pulse" />
                     )}
                  </div>
                  <div className="space-y-1">
                     <h3 className="text-xl font-black text-brand-dark uppercase tracking-tighter italic">{idData.name}</h3>
                     <p className="text-[9px] font-black text-brand-green uppercase tracking-wide">
                        {idData.previousPassengerPhoto ? "Ready for History Match" : "Ready for ID Verification"}
                     </p>
                  </div>
               </div>
               <button 
                 onClick={() => startCamera('PASSENGER_PHOTO')} 
                 className="w-full bg-brand-green text-white font-black text-lg py-6 rounded-[2.5rem] shadow-2xl active:scale-95 flex items-center justify-center gap-3 hover:bg-green-700 transition-all"
               >
                 <UserCheck size={28} /> Verify Face
               </button>
               <button 
                 onClick={() => { setStep('ID_SCAN'); setIdData(null); setPartialData(null); }} 
                 className="py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-center gap-2 hover:text-brand-red transition-colors"
               >
                 <RefreshCw size={14} /> Reset
               </button>
            </div>
          )}
        </div>
      )}

      {/* ── Error / Alert bottom sheet ─────────────────────────────────────────
           Floats above content as a fixed bottom sheet so it never pushes
           the scanner layout. Backdrop dims the screen for focus.          */}
      {error && (
        <>
          {/* Soft backdrop */}
          <div className="fixed inset-0 z-[95] bg-black/30 backdrop-blur-[2px] animate-in fade-in duration-200" />

          {/* Sheet */}
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[100] animate-in slide-in-from-bottom duration-300">
            <div className="bg-white rounded-t-[2rem] shadow-[0_-8px_48px_rgba(0,0,0,0.18)] overflow-hidden">

              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-gray-200 rounded-full" />
              </div>

              {/* Content */}
              <div className="px-6 pt-3 pb-4">
                {/* Header row */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-brand-red/8 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertCircle size={18} className="text-brand-red" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-brand-red uppercase tracking-wider mb-0.5">
                      {error.isSecurity ? 'Verification Failed' : 'Scan Error'}
                    </p>
                    <p className="text-[13px] font-semibold text-brand-dark leading-snug">
                      {error.message}
                    </p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 transition-colors shrink-0"
                    aria-label="Dismiss"
                  >
                    <XCircle size={16} />
                  </button>
                </div>

                {/* Divider */}
                <div className="h-px bg-gray-100 mb-4" />

                {/* Action buttons */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => { setError(null); startCamera(step); }}
                    className="w-full h-[52px] bg-brand-dark text-white rounded-2xl text-[11px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  >
                    <RefreshCw size={15} /> Try Again
                  </button>

                  {step === 'PASSENGER_PHOTO' && error?.allowManualOverride && (
                    <>
                      <button
                        onClick={handleManualOverride}
                        className="w-full h-[52px] rounded-2xl text-[11px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                        style={{ background: 'rgba(211,47,47,0.06)', color: '#D32F2F', border: '1px solid rgba(211,47,47,0.15)' }}
                      >
                        <UserCheck size={15} /> Manual Override
                      </button>
                      <button
                        onClick={handleMarkAsFraud}
                        className="w-full h-[52px] bg-brand-dark text-white rounded-2xl text-[11px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                        style={{ background: '#111' }}
                      >
                        <ShieldAlert size={15} /> Mark as Fraud
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Safe-area spacer for phones with home indicator */}
              <div className="h-safe-bottom pb-4" />
            </div>
          </div>
        </>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {/* ── Manual Entry Bottom Sheet ──────────────────────────────────────────
           Last-resort fallback when camera and file upload both fail.
           Logged as MANUAL_OFFLINE with elevated risk level (2).           */}
      {showManualEntry && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[80]"
            onClick={() => setShowManualEntry(false)}
          />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[90] bg-white rounded-t-[2rem] shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1" />
            <div className="px-6 pt-3 pb-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[10px] font-bold text-brand-red uppercase tracking-wider">Manual Entry</p>
                  <p className="text-[13px] font-semibold text-brand-dark mt-0.5">Enter Aadhaar details by hand</p>
                </div>
                <button
                  onClick={() => setShowManualEntry(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100"
                >
                  <XCircle size={16} />
                </button>
              </div>

              <div className="space-y-3">
                {/* Name */}
                <div>
                  <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Full Name (as on Aadhaar)</label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={e => { setManualName(e.target.value); setManualEntryError(''); }}
                    placeholder="e.g. PRIYA SHARMA"
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3 px-4 text-[13px] font-semibold text-brand-dark placeholder-gray-300 focus:outline-none focus:border-brand-yellow/60 transition-all"
                    autoCapitalize="characters"
                  />
                </div>

                {/* Gender */}
                <div>
                  <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Gender</label>
                  <div className="flex gap-2">
                    {(['F', 'M'] as const).map(g => (
                      <button
                        key={g}
                        onClick={() => setManualGender(g)}
                        className={`flex-1 py-3 rounded-2xl text-[11px] font-bold transition-all ${
                          manualGender === g
                            ? g === 'F' ? 'bg-brand-red text-white' : 'bg-brand-dark text-white'
                            : 'bg-gray-50 text-gray-500 border border-gray-200'
                        }`}
                      >
                        {g === 'F' ? 'Female' : 'Male'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pincode */}
                <div>
                  <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Pincode (6 digits)</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={6}
                    value={manualPincode}
                    onChange={e => { setManualPincode(e.target.value.replace(/\D/g, '')); setManualEntryError(''); }}
                    placeholder="e.g. 522001"
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3 px-4 text-[13px] font-semibold text-brand-dark placeholder-gray-300 focus:outline-none focus:border-brand-yellow/60 transition-all"
                  />
                </div>

                {manualEntryError && (
                  <p className="text-[11px] font-semibold text-brand-red">{manualEntryError}</p>
                )}

                <div className="h-px bg-gray-100 my-1" />

                <button
                  onClick={handleManualEntrySubmit}
                  className="w-full h-[52px] bg-brand-dark text-white rounded-2xl text-[11px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <UserCheck size={15} /> Confirm & Proceed
                </button>

                <p className="text-[9px] text-gray-400 text-center leading-relaxed">
                  Manual entry is logged as high-risk and requires supervisor review.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Task 13.3-13.7: Bottom Sheet Route Picker */}
      {showRoutePicker && (
        <>
          {/* Task 13.3: Backdrop dismisses sheet on tap */}
          <div
            className="fixed inset-0 bg-black/40 z-[80]"
            onClick={() => setShowRoutePicker(false)}
          />
          {/* Task 13.4: Bottom sheet panel */}
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[90] bg-white rounded-t-[2.5rem] shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Task 13.5: Drag handle */}
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-4 mb-2" />
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center mb-2">Select Route</p>
            {/* Task 13.6: Route rows with min-h-[52px] */}
            {ROUTES.map(route => (
              <button
                key={route}
                onClick={() => { setSelectedRoute(route); setShowRoutePicker(false); }}
                className={`w-full text-left px-6 py-4 min-h-[52px] font-black text-sm uppercase border-b border-gray-50 last:border-0 transition-colors ${
                  route === selectedRoute ? 'bg-brand-cream text-brand-red' : 'hover:bg-brand-cream text-brand-dark'
                }`}
              >
                {route}
              </button>
            ))}
            {/* Task 13.7: Cancel button */}
            <button
              onClick={() => setShowRoutePicker(false)}
              className="w-full py-5 text-[10px] font-black text-brand-red uppercase tracking-widest border-t border-gray-50"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Scanner;
