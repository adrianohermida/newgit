export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function getPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cursor: unknown = obj;
  for (const part of parts) {
    if (cursor == null) return undefined;
    if (Array.isArray(cursor)) {
      const idx = Number(part);
      cursor = Number.isInteger(idx) ? cursor[idx] : undefined;
      continue;
    }
    const rec = asRecord(cursor);
    if (!rec) return undefined;
    cursor = rec[part];
  }
  return cursor;
}

export function pickFirst(obj: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = getPath(obj, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

export function toText(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  return str || null;
}

export function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const clean = String(value).replace(/[^\d.-]/g, '');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export function toBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const text = toText(value)?.toLowerCase();
  if (!text) return null;
  if (['true', '1', 'sim', 's', 'yes'].includes(text)) return true;
  if (['false', '0', 'nao', 'não', 'n', 'no'].includes(text)) return false;
  return null;
}

export function toIsoDate(value: unknown): string | null {
  const text = toText(value);
  if (!text) return null;
  const dt = new Date(text);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  return text;
}

export function normalizeGrau(value: unknown): string | null {
  const text = toText(value)?.toUpperCase();
  if (!text) return null;
  if (text === 'G1' || text === '1' || text.includes('1')) return '1';
  if (text === 'G2' || text === '2' || text.includes('2')) return '2';
  if (text === 'G3' || text === '3' || text.includes('3')) return '3';
  return text;
}
