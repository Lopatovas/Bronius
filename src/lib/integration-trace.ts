import { generateId } from './id';

export type IntegrationTraceKind = 'twilio_rest' | 'twilio_webhook' | 'brain' | 'api' | 'debug_tool';

export interface IntegrationTraceEntry {
  id: string;
  at: string;
  kind: IntegrationTraceKind;
  label: string;
  callSessionId?: string;
  meta: Record<string, unknown>;
}

const MAX_ENTRIES = 400;
const buffer: IntegrationTraceEntry[] = [];

function traceEnabled(): boolean {
  if (process.env.INTEGRATION_TRACE === '0') return false;
  return true;
}

function truncateString(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… (${s.length} chars total)`;
}

function truncateMeta(meta: Record<string, unknown>, maxStr = 8000): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === 'string') {
      out[k] = truncateString(v, maxStr);
    } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      out[k] = truncateMeta(v as Record<string, unknown>, maxStr);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function pushIntegrationTrace(
  partial: Omit<IntegrationTraceEntry, 'id' | 'at' | 'meta'> & {
    id?: string;
    meta?: Record<string, unknown>;
  },
): void {
  if (!traceEnabled()) return;

  const entry: IntegrationTraceEntry = {
    id: partial.id ?? generateId(),
    at: new Date().toISOString(),
    kind: partial.kind,
    label: partial.label,
    callSessionId: partial.callSessionId,
    meta: truncateMeta(partial.meta ?? {}),
  };

  buffer.push(entry);
  while (buffer.length > MAX_ENTRIES) buffer.shift();
}

export function getIntegrationTrace(opts?: {
  sinceId?: string;
  limit?: number;
}): { entries: IntegrationTraceEntry[]; resetSuggested?: boolean } {
  const limit = opts?.limit ?? 200;
  if (!opts?.sinceId) {
    return { entries: buffer.slice(-limit) };
  }

  const idx = buffer.findIndex((e) => e.id === opts.sinceId);
  if (idx === -1) {
    return { entries: buffer.slice(-limit), resetSuggested: true };
  }

  return { entries: buffer.slice(idx + 1) };
}

export function clearIntegrationTrace(): void {
  buffer.length = 0;
}
