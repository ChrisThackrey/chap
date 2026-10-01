/**
 * Lightweight logger.
 *
 * `debug`/`info` are only emitted in development builds so verbose tracing in
 * the networking and map layers does not spam (or slow down) production apps.
 * `warn`/`error` are always emitted.
 */
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

export const logger = {
  debug: (...args: unknown[]): void => {
    if (isDev) console.log(...args);
  },
  info: (...args: unknown[]): void => {
    if (isDev) console.info(...args);
  },
  warn: (...args: unknown[]): void => {
    console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
};
