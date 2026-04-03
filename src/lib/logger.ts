type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  callSessionId?: string;
  [key: string]: unknown;
}

function serializeValue(v: unknown): string {
  if (v instanceof Error) {
    const obj: Record<string, unknown> = {
      message: v.message,
      name: v.name,
    };
    if (v.stack) obj.stack = v.stack.split('\n').slice(0, 5).join('\n');
    if ('code' in v) obj.code = (v as Record<string, unknown>).code;
    if ('status' in v) obj.status = (v as Record<string, unknown>).status;
    if ('moreInfo' in v) obj.moreInfo = (v as Record<string, unknown>).moreInfo;
    return JSON.stringify(obj);
  }
  if (typeof v === 'object' && v !== null) {
    return JSON.stringify(v);
  }
  return String(v);
}

function formatMessage(level: LogLevel, context: LogContext, message: string): string {
  const timestamp = new Date().toISOString();
  const sessionTag = context.callSessionId ? ` [session:${context.callSessionId}]` : '';
  const extra = Object.entries(context)
    .filter(([k]) => k !== 'callSessionId')
    .map(([k, v]) => `${k}=${serializeValue(v)}`)
    .join(' ');
  return `${timestamp} ${level.toUpperCase()}${sessionTag} ${message}${extra ? ' ' + extra : ''}`;
}

export const log = {
  debug(context: LogContext, message: string): void {
    if (process.env.NODE_ENV !== 'test') {
      console.debug(formatMessage('debug', context, message));
    }
  },
  info(context: LogContext, message: string): void {
    if (process.env.NODE_ENV !== 'test') {
      console.info(formatMessage('info', context, message));
    }
  },
  warn(context: LogContext, message: string): void {
    console.warn(formatMessage('warn', context, message));
  },
  error(context: LogContext, message: string): void {
    console.error(formatMessage('error', context, message));
  },
};
