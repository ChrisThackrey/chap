/**
 * Debug Utilities
 *
 * Comprehensive debugging tools for tracing app crashes and state issues
 */

import type { Route, RouteStop } from '@/types/route';

/**
 * Validate a single stop and log issues
 */
export function validateStop(stop: RouteStop, context: string): boolean {
  const issues: string[] = [];

  if (!stop) {
    console.error(`❌ [Debug:${context}] Stop is null/undefined`);
    return false;
  }

  if (!stop.name) {
    issues.push('missing name');
  }

  if (typeof stop.latitude !== 'number') {
    issues.push(`latitude is ${typeof stop.latitude}`);
  } else if (isNaN(stop.latitude)) {
    issues.push('latitude is NaN');
  } else if (stop.latitude === 0) {
    issues.push('latitude is 0');
  }

  if (typeof stop.longitude !== 'number') {
    issues.push(`longitude is ${typeof stop.longitude}`);
  } else if (isNaN(stop.longitude)) {
    issues.push('longitude is NaN');
  } else if (stop.longitude === 0) {
    issues.push('longitude is 0');
  }

  if (typeof stop.order !== 'number') {
    issues.push(`order is ${typeof stop.order}`);
  } else if (isNaN(stop.order)) {
    issues.push('order is NaN');
  }

  if (issues.length > 0) {
    console.error(`❌ [Debug:${context}] Stop "${stop.name || 'UNNAMED'}" has issues:`, issues.join(', '));
    console.error(`❌ [Debug:${context}] Stop data:`, JSON.stringify(stop, null, 2));
    return false;
  }

  return true;
}

/**
 * Validate all stops in a route
 */
export function validateRoute(route: Route, context: string): boolean {
  console.log(`🔍 [Debug:${context}] Validating route with ${route.stops.length} stops`);

  if (!route.stops || !Array.isArray(route.stops)) {
    console.error(`❌ [Debug:${context}] Route stops is not an array:`, route.stops);
    return false;
  }

  let hasErrors = false;

  for (let i = 0; i < route.stops.length; i++) {
    const stop = route.stops[i];
    console.log(`🔍 [Debug:${context}] Validating stop ${i + 1}/${route.stops.length}: "${stop.name}"`);

    if (!validateStop(stop, `${context}:Stop${i + 1}`)) {
      hasErrors = true;
    }
  }

  // Check for duplicate orders
  const orders = route.stops.map(s => s.order);
  const uniqueOrders = new Set(orders);

  if (orders.length !== uniqueOrders.size) {
    console.error(`❌ [Debug:${context}] Duplicate orders detected!`);
    const orderCounts = new Map<number, number>();
    orders.forEach(o => {
      orderCounts.set(o, (orderCounts.get(o) || 0) + 1);
    });
    orderCounts.forEach((count, order) => {
      if (count > 1) {
        console.error(`   Order ${order} appears ${count} times`);
      }
    });
    hasErrors = true;
  }

  if (hasErrors) {
    console.error(`❌ [Debug:${context}] Route validation FAILED`);
    return false;
  }

  console.log(`✅ [Debug:${context}] Route validation PASSED`);
  return true;
}

/**
 * Create a snapshot of current route state for debugging
 */
export function snapshotRouteState(route: Route | null, context: string): void {
  console.log(`📸 [Debug:${context}] ========== ROUTE STATE SNAPSHOT ==========`);

  if (!route) {
    console.log(`📸 [Debug:${context}] Route is null`);
    return;
  }

  console.log(`📸 [Debug:${context}] Route ID: ${route.id}`);
  console.log(`📸 [Debug:${context}] Route Title: ${route.title}`);
  console.log(`📸 [Debug:${context}] Stop Count: ${route.stops.length}`);

  route.stops.forEach((stop, i) => {
    console.log(`📸 [Debug:${context}] Stop ${i + 1}:`);
    console.log(`     Name: ${stop.name}`);
    console.log(`     Order: ${stop.order}`);
    console.log(`     Type: ${stop.type}`);
    console.log(`     Coords: (${stop.latitude}, ${stop.longitude})`);
    console.log(`     Valid: lat=${!isNaN(stop.latitude) && stop.latitude !== 0}, lon=${!isNaN(stop.longitude) && stop.longitude !== 0}`);
  });

  console.log(`📸 [Debug:${context}] ========================================`);
}

/**
 * Log comprehensive environment and state info for debugging crashes
 */
export function logEnvironmentState(context: string): void {
  console.log(`🌍 [Debug:${context}] ========== ENVIRONMENT STATE ==========`);
  console.log(`🌍 [Debug:${context}] Platform: ${typeof navigator !== 'undefined' ? navigator.platform : 'unknown'}`);
  console.log(`🌍 [Debug:${context}] User Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`);
  console.log(`🌍 [Debug:${context}] Timestamp: ${new Date().toISOString()}`);
  console.log(`🌍 [Debug:${context}] Memory: ${typeof performance !== 'undefined' && (performance as any).memory ? JSON.stringify((performance as any).memory) : 'unavailable'}`);
  console.log(`🌍 [Debug:${context}] ===========================================`);
}

/**
 * Create a detailed error report
 */
export function logErrorReport(error: any, context: string, additionalInfo?: Record<string, any>): void {
  console.error(`💥 [Debug:${context}] ========== ERROR REPORT ==========`);
  console.error(`💥 [Debug:${context}] Error:`, error);
  console.error(`💥 [Debug:${context}] Message:`, error instanceof Error ? error.message : String(error));
  console.error(`💥 [Debug:${context}] Stack:`, error instanceof Error ? error.stack : 'No stack trace');
  console.error(`💥 [Debug:${context}] Type:`, error?.constructor?.name || typeof error);

  if (additionalInfo) {
    console.error(`💥 [Debug:${context}] Additional Info:`, JSON.stringify(additionalInfo, null, 2));
  }

  logEnvironmentState(context);
  console.error(`💥 [Debug:${context}] ========================================`);
}
