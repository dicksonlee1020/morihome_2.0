/**
 * Brand image URL. Normal builds serve files from public/brand/; the
 * single-file download (scripts/build-single.mjs) has no sibling files, so it
 * injects `window.__MORI_BRAND__` with data URIs and we read from there first.
 */
declare global {
  interface Window {
    __MORI_BRAND__?: Record<string, string>;
  }
}

export const brandUrl = (name: string): string =>
  (typeof window !== 'undefined' && window.__MORI_BRAND__?.[name]) || `${import.meta.env.BASE_URL}brand/${name}`;
