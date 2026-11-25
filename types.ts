
export interface AadharData {
  id?: string;
  name: string;
  gender: 'M' | 'F' | 'Other' | string;
  pincode: string;
  isEligible: boolean;
  isAuthentic: boolean;
  documentType?: string;
  authenticityReason?: string;
  reason?: string;
  route?: string;
  imageProof?: string; 
  passengerPhoto?: string;
  previousPassengerPhoto?: string; // New: Holds photo from last successful trip 
  timestamp?: number;
  biometricConfidence?: number; // confidence score returned by face matcher (0-1)
  faceSimilarityScore?: number;
  livenessScore?: number;
  ocrConfidence?: number;
  qrConfidence?: number;
  qrValidationFlag?: boolean;
  distanceAtIssue?: string;
  vehicleNo?: string;
  conductorId?: string;
  driverId?: string;
  usageCount?: number;
  retryCount?: number;
  timeBetweenAttempts?: number;
  deviceFingerprintEntropy?: number;
  ipRiskScore?: number;
  geoLocationShiftFlag?: boolean;
  eventRiskLevel?: number;
  mlTrustScore?: number;
  mlDecision?: 'APPROVE' | 'DENY';
  mlDecisionSource?: string;
  mlDecisionReason?: string;
  mlAnomalyScore?: number;
  mlAnomalyFlag?: boolean;
}

export interface TicketRecord {
  id: string;
  name: string;
  gender: string;
  pincode: string;
  timestamp: number;
  ticketId: string;
  status: 'SUCCESS' | 'FAILED' | 'DENIED';
  route?: string;
  verificationMethod: 'QR' | 'AI_OCR' | 'MANUAL_OFFLINE';
  syncStatus?: 'synced' | 'pending';
  passengerPhoto?: string;
  biometricConfidence?: number; // persisted for audit
  faceSimilarityScore?: number;
  livenessScore?: number;
  ocrAccuracy?: number;
  ocr_confidence?: number;
  qrValidationFlag?: boolean;
  qr_validation_flag?: boolean;
  liveness_score?: number;
  face_similarity_score?: number;
  documentType?: string;
  savingsAmount: number;
  paidAmount: number;
  distance?: string;
  conductorId?: string;
  driverId?: string;
  vehicleNo?: string;
  usageCount?: number;
  eligibilityReason?: string;
  retryCount?: number;
  retry_count?: number;
  timeBetweenAttempts?: number;
  time_between_attempts?: number;
  deviceFingerprintEntropy?: number;
  device_fingerprint_entropy?: number;
  ipRiskScore?: number;
  ip_risk_score?: number;
  geoLocationShiftFlag?: boolean;
  geo_location_shift_flag?: boolean;
  eventRiskLevel?: number;
  event_risk_level?: number;
  mlTrustScore?: number;
  mlDecision?: 'APPROVE' | 'DENY';
  mlDecisionSource?: string;
  mlDecisionReason?: string;
  mlAnomalyScore?: number;
  mlAnomalyFlag?: boolean;
}

export interface Conductor {
  username: string;
  passwordHash: string;
  employeeId: string;
  lastLogin?: number;
  masterPhoto?: string; // Master biometric photo for re-login validation
}

export interface ShiftData {
  driverId: string;
  vehicleNo: string;
  startTime: number;
  conductorId: string;
  conductorSelfie?: string;
}

export interface ShiftStats {
  ticketsIssued: number;
  freeCount: number;
  paidCount: number;
  totalCollections: number;
  totalSavings: number;
  startTime: number;
}

export interface DailyStats {
  date: string;
  totalIssued: number;
  totalSavings: number;
  totalCollections: number;
  totalTrips: number;
  freeTicketsCount: number;
  paidTicketsCount: number;
}
