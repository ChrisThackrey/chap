/**
 * Address quality validation - pre-validates addresses before API calls
 * Detects generic vs. specific addresses to prevent poor geocoding results
 */

import type { AddressQualityResult } from '@/types/validation';

const VAGUE_PATTERNS = [
  /^downtown$/i,
  /^city\s+center$/i,
  /^main\s+street$/i,
  /^(north|south|east|west)\s+side$/i,
  /^(north|south|east|west)$/i,
  /^the\s+(north|south|east|west)/i,
  /^near\s+the/i,
  /^somewhere\s+in/i,
  /^around\s+the/i,
  /^general\s+area/i,
  /^vicinity\s+of/i,
];

const GENERIC_DESCRIPTORS = [
  'area',
  'district',
  'neighborhood',
  'section',
  'part',
  'region',
];

const SPECIFICITY_INDICATORS = {
  specific: [
    /\d+\s+\w+\s+(street|st|avenue|ave|road|rd|blvd|boulevard|lane|ln|drive|dr)/i,
    /\b\w+\s+(restaurant|cafe|coffee|bar|pub|theater|theatre|museum|park|hotel)\b/i,
    /\d{5}/,
  ],
  moderate: [
    /\b(at|on|near)\s+\w+\s+(and|&)\s+\w+/i,
    /\b\w+\s+(plaza|mall|center|square|station)\b/i,
  ],
};

/**
 * Validates address quality before making API calls
 */
export function validateAddressQuality(address: string): AddressQualityResult {
  if (!address || address.trim().length === 0) {
    return {
      isValid: false,
      confidence: 0,
      specificity: 'vague',
      issues: ['Address is empty'],
      suggestions: ['Please provide a specific location'],
    };
  }

  const trimmed = address.trim();
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check for vague patterns
  for (const pattern of VAGUE_PATTERNS) {
    if (pattern.test(trimmed)) {
      issues.push(`Address is too generic: "${trimmed}"`);
      suggestions.push('Try adding a specific street name or venue name');
    }
  }

  // Check for generic descriptors only
  const lowerAddress = trimmed.toLowerCase();
  const hasOnlyGenericDescriptors = GENERIC_DESCRIPTORS.some(
    (descriptor) =>
      lowerAddress === descriptor ||
      lowerAddress.endsWith(` ${descriptor}`) ||
      lowerAddress.startsWith(`${descriptor} `)
  );

  if (hasOnlyGenericDescriptors) {
    issues.push('Address contains only generic area descriptors');
    suggestions.push('Include a specific venue name or street address');
  }

  // Determine specificity level
  let specificity: 'specific' | 'moderate' | 'vague' = 'vague';

  for (const pattern of SPECIFICITY_INDICATORS.specific) {
    if (pattern.test(trimmed)) {
      specificity = 'specific';
      break;
    }
  }

  if (specificity === 'vague') {
    for (const pattern of SPECIFICITY_INDICATORS.moderate) {
      if (pattern.test(trimmed)) {
        specificity = 'moderate';
        break;
      }
    }
  }

  // If address has actual content but no specific indicators, it's moderate
  if (specificity === 'vague' && trimmed.length > 5 && issues.length === 0) {
    specificity = 'moderate';
  }

  // Calculate confidence score
  let confidence = 0;
  if (specificity === 'specific') {
    confidence = 0.9;
  } else if (specificity === 'moderate') {
    confidence = 0.6;
  } else {
    confidence = 0.3;
  }

  // Reduce confidence if issues found
  if (issues.length > 0) {
    confidence = Math.max(0.1, confidence - issues.length * 0.2);
  }

  const isValid = confidence >= 0.4 && issues.length === 0;

  return {
    isValid,
    confidence,
    specificity,
    issues,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/**
 * Checks if an address is likely to geocode well
 */
export function isAddressGeocodable(address: string): boolean {
  const result = validateAddressQuality(address);
  return result.confidence >= 0.5;
}

/**
 * Gets a user-friendly message about address quality
 */
export function getAddressQualityMessage(result: AddressQualityResult): string {
  if (result.isValid) {
    return 'Address looks good';
  }

  if (result.issues.length > 0) {
    return result.issues[0];
  }

  if (result.specificity === 'vague') {
    return 'Address may be too generic for accurate geocoding';
  }

  return 'Address quality could not be determined';
}
