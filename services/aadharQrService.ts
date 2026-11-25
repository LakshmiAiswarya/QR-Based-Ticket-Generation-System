
import jsQR from "jsqr";
import { AadharData } from "../types";
import {
  cleanIdentityName,
  cleanPincode,
  isAndhraPradesh,
  isLikelyValidIdentityName,
  looksLikeAadhaarQrText,
  normalizeGender
} from "./aadhaarValidationService";

const decodeQr = (
  imageData: Uint8ClampedArray,
  width: number,
  height: number,
  inversionAttempts: "dontInvert" | "onlyInvert" | "attemptBoth"
): string | null => {
  const code = jsQR(imageData, width, height, { inversionAttempts });
  return code ? code.data : null;
};

const buildHighContrastBuffer = (imageData: Uint8ClampedArray): Uint8ClampedArray => {
  const enhanced = new Uint8ClampedArray(imageData.length);

  for (let i = 0; i < imageData.length; i += 4) {
    const luminance =
      (0.299 * imageData[i]) +
      (0.587 * imageData[i + 1]) +
      (0.114 * imageData[i + 2]);

    const contrastValue = luminance > 160 ? 255 : luminance < 96 ? 0 : Math.round(luminance);

    enhanced[i] = contrastValue;
    enhanced[i + 1] = contrastValue;
    enhanced[i + 2] = contrastValue;
    enhanced[i + 3] = 255;
  }

  return enhanced;
};

/**
 * Detects QR code focusing on the center region (ROI) for performance.
 * Crops the image buffer virtually before processing.
 */
export const detectQrFromImage = (imageData: Uint8ClampedArray, width: number, height: number): string | null => {
  try {
    // OPTIMIZATION: Scan only the center 60% of the image first.
    // Users naturally center the QR code. Processing the corners wastes CPU cycles.
    const marginX = Math.floor(width * 0.2);
    const marginY = Math.floor(height * 0.2);
    const cropWidth = width - (marginX * 2);
    const cropHeight = height - (marginY * 2);

    const enhancedFull = buildHighContrastBuffer(imageData);

    // If image is too small, scan whole thing immediately
    if (cropWidth < 200 || cropHeight < 200) {
        return (
          decodeQr(imageData, width, height, "dontInvert") ||
          decodeQr(imageData, width, height, "attemptBoth") ||
          decodeQr(enhancedFull, width, height, "attemptBoth")
        );
    }

    // Create a new buffer for the cropped region (ROI)
    const croppedData = new Uint8ClampedArray(cropWidth * cropHeight * 4);
    for (let y = 0; y < cropHeight; y++) {
        const sourceRowStart = ((y + marginY) * width + marginX) * 4;
        const destRowStart = (y * cropWidth) * 4;
        // Copy row
        const rowData = imageData.subarray(sourceRowStart, sourceRowStart + (cropWidth * 4));
        croppedData.set(rowData, destRowStart);
    }

    const enhancedCrop = buildHighContrastBuffer(croppedData);

    return (
      decodeQr(croppedData, cropWidth, cropHeight, "dontInvert") ||
      decodeQr(croppedData, cropWidth, cropHeight, "attemptBoth") ||
      decodeQr(enhancedCrop, cropWidth, cropHeight, "attemptBoth") ||
      decodeQr(imageData, width, height, "attemptBoth") ||
      decodeQr(enhancedFull, width, height, "attemptBoth")
    );

  } catch (err) {
    // Silent fail
    return null;
  }
};

/**
 * Parses ALL known Aadhaar QR formats:
 *
 * Format 1 — Standard XML attributes (most physical cards, pre-2019):
 *   name="..." gender="..." pc="..." uid="..." yob="..." dob="..."
 *
 * Format 2 — Full XML with address fields (newer physical cards):
 *   name="..." gender="..." pc="..." house="..." street="..." vtc="..."
 *   dist="..." state="..." co="..." lm="..."
 *
 * Format 3 — JSON / mAadhaar app QR:
 *   {"name":"...","gender":"...","pinCode":"...","uid":"..."}
 *   or {"name":"...","gender":"...","pin_code":"..."}
 *
 * Format 4 — UIDAI Secure QR v2 (numeric string starting with 16+ digits):
 *   The first 16 digits are a timestamp/version prefix; the rest is
 *   a compressed binary payload. We extract what we can from the
 *   readable suffix or fall back to OCR.
 *
 * Format 5 — KycRes / PrintLetterBioAuth XML envelope (DigiLocker):
 *   <KycRes ...><UidData name="..." gender="..." ...><Poa ...pc="..."/></UidData></KycRes>
 */
export const parseAadharQrData = (qrText: string): AadharData | null => {
  try {
    if (!looksLikeAadhaarQrText(qrText)) {
      return null;
    }

    // ── Format 3: JSON QR (mAadhaar / DigiLocker app) ──────────────────────
    if (qrText.trim().startsWith('{')) {
      try {
        const obj = JSON.parse(qrText);
        const name = cleanIdentityName(
          obj.name || obj.fullName || obj.full_name || ''
        );
        const gender = normalizeGender(obj.gender || obj.sex || '');
        const pincode = cleanPincode(
          obj.pinCode || obj.pin_code || obj.pincode || obj.postalCode || ''
        );
        if (isLikelyValidIdentityName(name) && gender && pincode.length === 6) {
          const isAP = isAndhraPradesh(pincode);
          return {
            name, gender, pincode,
            isEligible: gender === 'F' && isAP,
            isAuthentic: true,
            documentType: 'AADHAAR',
            qrConfidence: 0.99,
            qrValidationFlag: true,
            reason: gender === 'M' ? 'MALE (PAID)' : (!isAP ? 'NON-AP (PAID)' : undefined),
          };
        }
      } catch {
        // not valid JSON — fall through to XML parsers
      }
    }

    // ── Format 4: Numeric Secure QR v2 ─────────────────────────────────────
    // The payload is a compressed binary blob. jsQR decodes it as a raw
    // string of bytes. We cannot fully decode it client-side without the
    // UIDAI private key, but we can signal that a valid Aadhaar QR was
    // detected and let the OCR pipeline handle the actual data extraction.
    if (/^\d{16,}/.test(qrText.trim())) {
      // Return a sentinel that tells processImageForId to proceed with OCR
      // but mark qrValidationFlag=true (QR was present and valid structure).
      return {
        name: '',
        gender: '',
        pincode: '',
        isEligible: false,
        isAuthentic: true,
        documentType: 'AADHAAR',
        qrConfidence: 0.85,
        qrValidationFlag: true,
        // Empty name/pincode will trigger the OCR fallback path in processImageForId
      };
    }

    // ── Format 5: KycRes / PrintLetterBioAuth XML envelope ─────────────────
    // DigiLocker and e-Aadhaar PDFs embed this format.
    const kycNameMatch = qrText.match(/\bname="([^"]+)"/i);
    const kycGenderMatch = qrText.match(/\bgender="([^"]+)"/i);
    // Pincode lives in <Poa pc="..."/> or <Poi pc="..."/>
    const kycPcMatch =
      qrText.match(/\bpc="([^"]+)"/i) ||
      qrText.match(/\bpincode="([^"]+)"/i) ||
      qrText.match(/\bpostalCode="([^"]+)"/i);

    // ── Format 1 & 2: Standard XML attribute QR ────────────────────────────
    const nameMatch = kycNameMatch || qrText.match(/\bname="([^"]+)"/i);
    const genderMatch = kycGenderMatch || qrText.match(/\bgender="([^"]+)"/i);
    const pcMatch =
      kycPcMatch ||
      qrText.match(/\bpc="([^"]+)"/i) ||
      qrText.match(/\bpincode="([^"]+)"/i);

    if (nameMatch && genderMatch && pcMatch) {
      const name = cleanIdentityName(nameMatch[1]);
      const gender = normalizeGender(genderMatch[1]);
      const pincode = cleanPincode(pcMatch[1]);

      if (!isLikelyValidIdentityName(name) || !gender || pincode.length !== 6) {
        return null;
      }

      const isAP = isAndhraPradesh(pincode);
      return {
        name, gender, pincode,
        isEligible: gender === 'F' && isAP,
        isAuthentic: true,
        documentType: 'AADHAAR',
        qrConfidence: 0.99,
        qrValidationFlag: true,
        reason: gender === 'M' ? 'MALE (PAID)' : (!isAP ? 'NON-AP (PAID)' : undefined),
      };
    }

    // ── Partial QR: name + gender present but pincode missing ──────────────
    // Return partial data so the two-step front/back flow can complete it.
    if (nameMatch && genderMatch) {
      const name = cleanIdentityName(nameMatch[1]);
      const gender = normalizeGender(genderMatch[1]);
      if (isLikelyValidIdentityName(name) && gender) {
        return {
          name, gender,
          pincode: '',
          isEligible: false,
          isAuthentic: true,
          documentType: 'AADHAAR',
          qrConfidence: 0.75,
          qrValidationFlag: true,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
};
