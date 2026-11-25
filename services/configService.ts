const FALLBACK_LOCAL_URL = 'http://localhost:3000';
const LEGACY_LOCAL_URL = 'http://localhost:5001';
const LEGACY_URL_MIGRATION_KEY = 'api_url_migration_v1_done';

const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');
const isLoopbackHost = (host: string): boolean => host === 'localhost' || host === '::1' || host.startsWith('127.');

const isLoopbackUrl = (value: string): boolean => {
  try {
    return isLoopbackHost(new URL(value).hostname);
  } catch {
    return false;
  }
};

const isHostedOutsideLoopback = (): boolean => {
  if (typeof window === 'undefined' || !window.location?.hostname) return false;
  return !isLoopbackHost(window.location.hostname);
};

const getRuntimeDefaultUrl = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return trimTrailingSlash(window.location.origin);
  }
  return FALLBACK_LOCAL_URL;
};

export const sanitizeApiUrl = (value: string): string => trimTrailingSlash(value.trim());

export const getApiBaseUrl = (): string => {
  const defaultUrl = getRuntimeDefaultUrl();
  const raw = localStorage.getItem('api_url');
  if (!raw) return defaultUrl;

  const sanitized = sanitizeApiUrl(raw);
  if (!sanitized) return defaultUrl;
  if (isHostedOutsideLoopback() && isLoopbackUrl(sanitized)) return defaultUrl;
  return sanitized;
};

export const persistApiBaseUrl = (value: string): void => {
  const sanitized = sanitizeApiUrl(value);
  localStorage.setItem('api_url', sanitized || getRuntimeDefaultUrl());
};

export const migrateLegacyApiUrlIfNeeded = (): boolean => {
  if (localStorage.getItem(LEGACY_URL_MIGRATION_KEY) === '1') return false;
  localStorage.setItem(LEGACY_URL_MIGRATION_KEY, '1');

  const raw = localStorage.getItem('api_url');
  if (!raw) return false;

  const sanitized = sanitizeApiUrl(raw);
  if (isHostedOutsideLoopback() && isLoopbackUrl(sanitized)) {
    localStorage.setItem('api_url', getRuntimeDefaultUrl());
    return true;
  }
  if (sanitized !== LEGACY_LOCAL_URL) return false;

  localStorage.setItem('api_url', getRuntimeDefaultUrl());
  return true;
};

export const getDefaultApiUrl = (): string => getRuntimeDefaultUrl();

export const isLiveMode = (): boolean => localStorage.getItem('app_mode') === 'LIVE';
