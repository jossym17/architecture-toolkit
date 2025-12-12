// Centralized logging service for Architecture Toolkit

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

/**
 * Log entry structure
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  timestamps?: boolean;
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  prefix: '[arch]',
  timestamps: false
};

/**
 * Centralized logger with structured output
 */
export class Logger {
  private config: LoggerConfig;
  private static instance: Logger | null = null;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Configure the singleton logger
   */
  static configure(config: Partial<LoggerConfig>): void {
    Logger.instance = new Logger(config);
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Format a log message
   */
  private format(level: string, message: string, context?: Record<string, unknown>): string {
    const parts: string[] = [];
    
    if (this.config.timestamps) {
      parts.push(`[${new Date().toISOString()}]`);
    }
    
    if (this.config.prefix) {
      parts.push(this.config.prefix);
    }
    
    parts.push(`[${level}]`);
    parts.push(message);
    
    if (context && Object.keys(context).length > 0) {
      parts.push(JSON.stringify(context));
    }
    
    return parts.join(' ');
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (this.config.level <= LogLevel.DEBUG) {
      console.debug(this.format('DEBUG', message, context));
    }
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    if (this.config.level <= LogLevel.INFO) {
      console.info(this.format('INFO', message, context));
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    if (this.config.level <= LogLevel.WARN) {
      console.warn(this.format('WARN', message, context));
    }
  }

  /**
   * Log an error message
   */
  error(message: string, context?: Record<string, unknown>): void {
    if (this.config.level <= LogLevel.ERROR) {
      console.error(this.format('ERROR', message, context));
    }
  }

  /**
   * Log an error with stack trace
   */
  exception(error: Error, context?: Record<string, unknown>): void {
    if (this.config.level <= LogLevel.ERROR) {
      const errorContext = {
        ...context,
        name: error.name,
        stack: error.stack
      };
      console.error(this.format('ERROR', error.message, errorContext));
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
