import { readFileSync } from 'node:fs';
import { parse } from 'smol-toml';

/**
 * Read the public base on every dev/build invocation, relative to vite.config.ts.
 * No environment override or '/' fallback: project.manifest.toml owns the route.
 * @param {URL} manifestUrl
 * @returns {string}
 */
export function readManifestBase(manifestUrl) {
  let manifest;
  try {
    manifest = parse(readFileSync(manifestUrl, 'utf8'));
  } catch (cause) {
    throw new Error(`Cannot read UserApp routing from ${manifestUrl.href}`, { cause });
  }

  const route = manifest.proxy?.path;
  if (
    typeof route !== 'string' || !route.startsWith('/') ||
    route.includes('//') || route.includes('..') || /[?#\\\s]/.test(route)
  ) {
    throw new Error(`Invalid [proxy].path in ${manifestUrl.href}: expected an absolute URL path`);
  }
  return route.replace(/\/+$/, '') + '/';
}
