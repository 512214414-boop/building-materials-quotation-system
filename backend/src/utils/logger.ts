/* eslint-disable no-console */

type Level = 'info' | 'warn' | 'error' | 'debug';

function fmt(level: Level, message: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export const logger = {
  info: (message: string, meta?: unknown) => console.log(fmt('info', message, meta)),
  warn: (message: string, meta?: unknown) => console.warn(fmt('warn', message, meta)),
  error: (message: string, meta?: unknown) => console.error(fmt('error', message, meta)),
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') console.debug(fmt('debug', message, meta));
  },
};

export default logger;
