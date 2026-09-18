type Level = 'debug' | 'info' | 'warn' | 'error';

const REDACTED_KEYS = [
  'privatekey',
  'private_key',
  'secret',
  'token',
  'password',
  'signature',
  'authorization',
  'cookie',
  'seed',
  'mnemonic',
];

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.some((needle) => key.toLowerCase().includes(needle))
        ? '[redacted]'
        : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}

const SILENT = process.env.NODE_ENV === 'test' || process.env.LOG_SILENT === 'true';

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  if (SILENT) return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? { context: redact(context) as Record<string, unknown> } : {}),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
};

export { redact };
