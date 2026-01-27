/**
 * Validation types for address and route validation
 */

export type ValidationStatus = 'verified' | 'geocoded' | 'approximated' | 'fallback';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationWarning {
  severity: ValidationSeverity;
  message: string;
  stopIndex?: number;
  stopName?: string;
  suggestedAction?: string;
}

export interface RouteValidationResult<T> {
  data: T;
  warnings: ValidationWarning[];
}

export interface AddressQualityResult {
  isValid: boolean;
  confidence: number; // 0-1
  specificity: 'specific' | 'moderate' | 'vague';
  issues: string[];
  suggestions?: string[];
}

export interface GeocodingResult {
  lat: number;
  lon: number;
  confidence: number; // 0-1
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  displayName: string;
  matchType?: string;
  boundingBox?: [number, number, number, number]; // [minLat, maxLat, minLon, maxLon]
  importance?: number;
  osmType?: string;
}

export type ErrorType =
  | 'AUTH_INVALID'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'GEOCODING_FAILED'
  | 'LOW_CONFIDENCE'
  | 'REGION_MISMATCH'
  | 'UNKNOWN';

export interface ClassifiedError {
  type: ErrorType;
  originalError: Error;
  isRecoverable: boolean;
  shouldRetry: boolean;
  userMessage: string;
  suggestedAction?: string;
  statusCode?: number;
}
