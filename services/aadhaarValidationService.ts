export type ValidationMessageKind = 'INVALID_DOCUMENT' | 'INVALID_PHOTO' | 'INSUFFICIENT_DATA';

const INVALID_NAME_VALUES = new Set([
  '',
  'PASSENGER',
  'UNKNOWN',
  'NA',
  'N/A',
  'NONE',
  'NOT AVAILABLE'
]);

const AADHAAR_TEXT_MARKERS = [
  /aadha?r/i,
  /uidai/i,
  /government of india/i,
  /\b(?:yob|dob)\b/i,
  /\b(?:dist|state|po|vtc|loc)\b/i
];

const AADHAAR_QR_MARKERS = [
  /\bname="/i,
  /\bgender="/i,
  /\b(?:pc|pincode)="/i,
  /\b(?:uid|yob|dob|dist|state|loc|house|street|vtc|po|lm|co|subdist|country)="/i
];

// Looser set — only 2 matches needed for partial/v2 QR acceptance
const AADHAAR_QR_MARKERS_LOOSE = [
  /\bname="/i,
  /\bgender="/i,
  /\b(?:pc|pincode)="/i,
  /\b(?:uid|yob|dob|dist|state|loc|house|street|vtc|po|lm|co|subdist|country)="/i,
  // JSON / mAadhaar format
  /["']name["']\s*:/i,
  /["']gender["']\s*:/i,
  /["'](?:pinCode|pin_code|pincode)["']\s*:/i,
  /["'](?:uid|aadhaarNumber|aadhaar_number)["']\s*:/i,
  // Numeric-only UID (16-digit secure QR starts with a digit sequence)
  /^\d{16,}/,
  // UIDAI XML envelope
  /\buidai\b/i,
  /\bPrintLetterBioAuth\b/i,
  /\bKycRes\b/i,
];

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const buildValidationMessage = (
  kind: ValidationMessageKind,
  detail?: string
): string => {
  const baseMessage =
    kind === 'INVALID_DOCUMENT'
      ? 'Invalid document uploaded. Ticket issuance terminated.'
      : kind === 'INVALID_PHOTO'
        ? 'Invalid photo uploaded. Ticket issuance terminated.'
        : 'Not sufficient data. Ticket issuance terminated.';

  if (!detail) {
    return baseMessage;
  }

  return `${baseMessage} ${detail}`.trim();
};

const DISTRICT_LINE_REPLACEMENTS: Array<[RegExp, string]> = [
  // Fix common OCR artefacts where trailing address keywords are merged
  // into the name field. Example: "... DISTRICT GUNTUR I HD".
  [/\bDISTRICT\b\s*.*$/i, ''],
  [/\bDIST\b\s*.*$/i, ''],
  [/\bGUNTUR\b\s*.*$/i, ''],
  [/\b\bI\b\s*HD\b.*$/i, ''],
  [/\bHD\b.*$/i, ''],
];

export const cleanIdentityName = (value?: string | null): string => {
  let normalized = normalizeWhitespace(String(value || '')).toUpperCase();

  // Apply targeted stripping for known OCR contamination patterns.
  for (const [re, replacement] of DISTRICT_LINE_REPLACEMENTS) {
    normalized = normalized.replace(re, replacement);
  }

  // Collapse whitespace after stripping.
  normalized = normalizeWhitespace(normalized);

  return normalized;
};


/**
 * Returns true if the string contains non-ASCII characters typical of
 * Indian regional scripts (Telugu, Hindi, Tamil, Kannada, Malayalam, etc.).
 * Used to decide whether to pass the raw name through or rely on the
 * transliterated/romanised version returned by the OCR model.
 */
export const containsRegionalScript = (value?: string | null): boolean => {
  // Unicode ranges: Devanagari, Bengali, Gurmukhi, Gujarati, Oriya,
  // Tamil, Telugu, Kannada, Malayalam, Sinhala
  return /[\u0900-\u0D7F]/.test(String(value || ''));
};

export const cleanPincode = (value?: string | null): string => {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
};

export const normalizeGender = (value?: string | null): 'M' | 'F' | '' => {
  const normalized = normalizeWhitespace(String(value || '')).toUpperCase();
  if (normalized.startsWith('F')) {
    return 'F';
  }
  if (normalized.startsWith('M')) {
    return 'M';
  }
  return '';
};

export const isLikelyValidIdentityName = (value?: string | null): boolean => {
  const raw = String(value || '').trim();

  // Accept names that contain Indian regional script characters
  // (Telugu, Hindi, Tamil, Kannada, Malayalam, Bengali, Gujarati, etc.)
  // These are valid Aadhaar names even though they fail the ASCII-only check.
  if (containsRegionalScript(raw)) {
    return raw.length >= 2;
  }

  const normalized = cleanIdentityName(raw);

  if (INVALID_NAME_VALUES.has(normalized) || normalized.length < 3) {
    return false;
  }

  if (/\d/.test(normalized)) {
    return false;
  }

  // Allow Latin letters, spaces, dots, hyphens, apostrophes
  return /^[A-Z .'\-]+$/.test(normalized);
};

export const countIdentityFields = (data: {
  name?: string | null;
  gender?: string | null;
  pincode?: string | null;
}): number => {
  let count = 0;

  if (isLikelyValidIdentityName(data.name)) {
    count += 1;
  }

  if (normalizeGender(data.gender)) {
    count += 1;
  }

  if (cleanPincode(data.pincode).length === 6) {
    count += 1;
  }

  return count;
};

export const hasMinimumIssuableIdentity = (data: {
  name?: string | null;
  gender?: string | null;
  pincode?: string | null;
}): boolean => {
  return (
    isLikelyValidIdentityName(data.name) &&
    normalizeGender(data.gender) !== '' &&
    cleanPincode(data.pincode).length === 6
  );
};

export const isAndhraPradesh = (pincode: string): boolean => {
  if (!pincode) return false;
  const prefix = cleanPincode(pincode).substring(0, 2);
  return prefix === '51' || prefix === '52' || prefix === '53';
};

export const looksLikeAadhaarText = (text?: string | null): boolean => {
  const normalized = normalizeWhitespace(String(text || ''));
  if (!normalized) {
    return false;
  }

  const matches = AADHAAR_TEXT_MARKERS.reduce((count, pattern) => (
    pattern.test(normalized) ? count + 1 : count
  ), 0);

  return matches >= 2;
};

export const looksLikeAadhaarQrText = (qrText?: string | null): boolean => {
  const normalized = normalizeWhitespace(String(qrText || ''));
  if (!normalized) {
    return false;
  }

  // Fast-path: numeric-only secure QR (UIDAI v2 — starts with 16+ digits)
  if (/^\d{16,}/.test(normalized)) return true;

  // Fast-path: known UIDAI XML envelopes
  if (/\b(?:PrintLetterBioAuth|KycRes|uidai)\b/i.test(normalized)) return true;

  // Standard XML attribute format — require 2 of the known markers (was 4, relaxed for partial QR)
  const strictMatches = AADHAAR_QR_MARKERS.reduce((count, pattern) => (
    pattern.test(normalized) ? count + 1 : count
  ), 0);
  if (strictMatches >= 2) return true;

  // Loose format (JSON / mAadhaar) — require 2 of the loose markers
  const looseMatches = AADHAAR_QR_MARKERS_LOOSE.reduce((count, pattern) => (
    pattern.test(normalized) ? count + 1 : count
  ), 0);
  return looseMatches >= 2;
};
