/**
 * Smart error classification for API and validation errors
 * Provides structured error handling with user-friendly messages
 */

import type { ClassifiedError } from '@/types/validation';

/**
 * Classifies errors by type and provides handling guidance
 */
export function classifyError(error: Error | any): ClassifiedError {
  // Check for Foursquare API errors
  if (error.name === 'FoursquareAPIError' || error.statusCode) {
    return classifyAPIError(error);
  }

  // Check for network errors
  if (
    error.message?.includes('fetch') ||
    error.message?.includes('network') ||
    error.message?.includes('timeout') ||
    error.name === 'NetworkError' ||
    error.name === 'TypeError'
  ) {
    return {
      type: 'NETWORK_ERROR',
      originalError: error,
      isRecoverable: true,
      shouldRetry: true,
      userMessage: 'Network connection issue. Will retry with geocoding fallback.',
      suggestedAction: 'Check your internet connection',
    };
  }

  // Check for geocoding errors
  if (
    error.message?.includes('geocod') ||
    error.message?.includes('Nominatim')
  ) {
    return {
      type: 'GEOCODING_FAILED',
      originalError: error,
      isRecoverable: true,
      shouldRetry: false,
      userMessage: 'Could not find coordinates for this address.',
      suggestedAction: 'Try a more specific address',
    };
  }

  // Default to unknown error
  return {
    type: 'UNKNOWN',
    originalError: error,
    isRecoverable: false,
    shouldRetry: false,
    userMessage: error.message || 'An unexpected error occurred',
    suggestedAction: 'Please try again or contact support',
  };
}

/**
 * Classifies API-specific errors (Foursquare, etc.)
 */
function classifyAPIError(error: any): ClassifiedError {
  const statusCode = error.statusCode || error.status;

  switch (statusCode) {
    case 401:
      return {
        type: 'AUTH_INVALID',
        originalError: error,
        isRecoverable: false,
        shouldRetry: false,
        userMessage:
          'Foursquare API authentication failed. API key may be invalid or missing.',
        suggestedAction: 'Check your EXPO_PUBLIC_FOURSQUARE_API_KEY in .env file',
        statusCode,
      };

    case 403:
      return {
        type: 'AUTH_INVALID',
        originalError: error,
        isRecoverable: false,
        shouldRetry: false,
        userMessage: 'Access denied to Foursquare API.',
        suggestedAction: 'Verify API key permissions',
        statusCode,
      };

    case 429:
      return {
        type: 'RATE_LIMITED',
        originalError: error,
        isRecoverable: true,
        shouldRetry: true,
        userMessage: 'Rate limit exceeded. Waiting before retry...',
        suggestedAction: 'Please wait a moment',
        statusCode,
      };

    case 404:
      return {
        type: 'NOT_FOUND',
        originalError: error,
        isRecoverable: true,
        shouldRetry: false,
        userMessage: 'Venue not found in Foursquare. Will try geocoding.',
        statusCode,
      };

    case 500:
    case 502:
    case 503:
    case 504:
      return {
        type: 'NETWORK_ERROR',
        originalError: error,
        isRecoverable: true,
        shouldRetry: true,
        userMessage: 'Foursquare API is temporarily unavailable. Using geocoding fallback.',
        statusCode,
      };

    default:
      return {
        type: 'UNKNOWN',
        originalError: error,
        isRecoverable: true,
        shouldRetry: false,
        userMessage: `API error (${statusCode}): ${error.message || 'Unknown error'}`,
        statusCode,
      };
  }
}

/**
 * Creates a low confidence error
 */
export function createLowConfidenceError(
  confidence: number,
  location: string
): ClassifiedError {
  return {
    type: 'LOW_CONFIDENCE',
    originalError: new Error(`Low confidence geocoding result: ${confidence}`),
    isRecoverable: true,
    shouldRetry: false,
    userMessage: `Location for "${location}" may be approximate (confidence: ${Math.round(confidence * 100)}%)`,
    suggestedAction: 'Try a more specific address for better accuracy',
  };
}

/**
 * Creates a region mismatch error
 */
export function createRegionMismatchError(
  location: string,
  expectedRegion: string
): ClassifiedError {
  return {
    type: 'REGION_MISMATCH',
    originalError: new Error(`Location outside expected region`),
    isRecoverable: true,
    shouldRetry: false,
    userMessage: `Location "${location}" appears to be outside ${expectedRegion}`,
    suggestedAction: 'Verify the address is in the correct city/region',
  };
}

/**
 * Determines if an error should halt processing
 */
export function shouldFailFast(error: ClassifiedError): boolean {
  return error.type === 'AUTH_INVALID' && !error.isRecoverable;
}

/**
 * Gets a user-friendly error message
 */
export function getErrorMessage(error: ClassifiedError): string {
  return error.userMessage;
}

/**
 * Gets suggested action for an error
 */
export function getSuggestedAction(error: ClassifiedError): string | undefined {
  return error.suggestedAction;
}
