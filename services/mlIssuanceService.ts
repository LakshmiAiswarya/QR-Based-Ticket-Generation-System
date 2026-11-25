import { getApiBaseUrl, isLiveMode } from './configService';
import {
  buildFallbackMlDecision,
  MlDecisionResult,
  MlVerificationInput
} from './mlDecisionPolicy';

const buildEndpointCandidates = (): string[] => {
  const relativeEndpoint = '/api/ml/evaluate';
  const candidates = [relativeEndpoint];

  if (typeof window !== 'undefined' && isLiveMode()) {
    const absoluteEndpoint = `${getApiBaseUrl()}/api/ml/evaluate`;
    if (!candidates.includes(absoluteEndpoint)) {
      candidates.push(absoluteEndpoint);
    }
  }

  return candidates;
};

export const evaluateIssuanceDecision = async (
  input: MlVerificationInput
): Promise<MlDecisionResult> => {
  const candidates = buildEndpointCandidates();

  for (const url of candidates) {
    try {
      // 3-second timeout — if the ML service is slow, fall back to local heuristic
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        continue;
      }

      return await response.json();
    } catch {
      // AbortError (timeout) or network error — try next candidate or fall back
    }
  }

  return buildFallbackMlDecision(input, 'client_fallback');
};
