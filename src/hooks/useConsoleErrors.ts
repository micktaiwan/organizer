import { useState, useEffect, useCallback } from 'react';

export interface ConsoleError {
  id: string;
  level: 'error' | 'warn';
  message: string;
  timestamp: Date;
  stack?: string;
}

const MAX_ERRORS = 50;

// Global state to share across hook instances
let globalErrors: ConsoleError[] = [];
let listeners: Set<(errors: ConsoleError[]) => void> = new Set();

function notifyListeners() {
  listeners.forEach((listener) => listener([...globalErrors]));
}

function addError(error: ConsoleError) {
  globalErrors = [...globalErrors, error].slice(-MAX_ERRORS);
  notifyListeners();
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Store original console methods
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Intercept console.error
console.error = (...args: unknown[]) => {
  const message = args
    .map((arg) => {
      if (arg instanceof Error) {
        return arg.message;
      }
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');

  const stack = args.find((arg) => arg instanceof Error)?.stack;

  addError({
    id: generateId(),
    level: 'error',
    message,
    timestamp: new Date(),
    stack,
  });

  originalConsoleError.apply(console, args);
};

// Intercept console.warn
console.warn = (...args: unknown[]) => {
  const message = args
    .map((arg) => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');

  addError({
    id: generateId(),
    level: 'warn',
    message,
    timestamp: new Date(),
  });

  originalConsoleWarn.apply(console, args);
};

// Capture uncaught errors
window.onerror = (message, source, lineno, colno, error) => {
  addError({
    id: generateId(),
    level: 'error',
    message: String(message),
    timestamp: new Date(),
    stack: error?.stack || `at ${source}:${lineno}:${colno}`,
  });
  return false; // Let the error propagate
};

// Capture unhandled promise rejections
window.onunhandledrejection = (event) => {
  const message = event.reason instanceof Error
    ? event.reason.message
    : String(event.reason);

  addError({
    id: generateId(),
    level: 'error',
    message: `Unhandled Promise: ${message}`,
    timestamp: new Date(),
    stack: event.reason?.stack,
  });
};

export function useConsoleErrors() {
  const [errors, setErrors] = useState<ConsoleError[]>(globalErrors);

  useEffect(() => {
    // Subscribe to updates
    const listener = (newErrors: ConsoleError[]) => {
      setErrors(newErrors);
    };
    listeners.add(listener);

    // Sync with current state
    setErrors([...globalErrors]);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const clearErrors = useCallback(() => {
    globalErrors = [];
    notifyListeners();
  }, []);

  const errorCount = errors.filter((e) => e.level === 'error').length;
  const warnCount = errors.filter((e) => e.level === 'warn').length;

  return {
    errors,
    errorCount,
    warnCount,
    totalCount: errors.length,
    clearErrors,
  };
}
