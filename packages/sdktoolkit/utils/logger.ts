export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

class Logger {
  private level: number = LEVELS.info;

  setLevel(level: LogLevel) {
    if (LEVELS[level] !== undefined) {
      this.level = LEVELS[level];
    }
  }

  debug(...args: any[]) {
    if (this.level <= LEVELS.debug) {
      console.log('[AITour]', ...args);
    }
  }

  info(...args: any[]) {
    if (this.level <= LEVELS.info) {
      console.log('[AITour]', ...args);
    }
  }

  warn(...args: any[]) {
    if (this.level <= LEVELS.warn) {
      console.warn('[AITour]', ...args);
    }
  }

  error(...args: any[]) {
    if (this.level <= LEVELS.error) {
      console.error('[AITour]', ...args);
    }
  }
}

export const logger = new Logger();
