type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  callSessionId?: string;
  [key: string]: unknown;
}

function formatMessage(level: LogLevel, context: LogContext, message: string): string {
  const timestamp = new Date().toISOString();
  const sessionTag = context.callSessionId ? ` [session:${context.callSessionId}]` : '';
  const extra = Object.entries(context)
    .filter(([k]) => k !== 'callSessionId')
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
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
