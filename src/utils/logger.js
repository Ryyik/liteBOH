const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const envLevel = (import.meta.env.VITE_LOG_LEVEL || (import.meta.env.PROD ? 'warn' : 'debug')).toLowerCase();
const currentLevel = LEVELS[envLevel] || LEVELS.debug;

function shouldLog(level) {
  return (LEVELS[level] || 100) >= currentLevel;
}

function format(scope, message, extra) {
  if (extra !== undefined) {
    return [`[${scope}] ${message}`, extra];
  }
  return [`[${scope}] ${message}`];
}

export const logger = {
  debug(scope, message, extra) {
    if (!shouldLog('debug')) return;
    console.debug(...format(scope, message, extra));
  },
  info(scope, message, extra) {
    if (!shouldLog('info')) return;
    console.info(...format(scope, message, extra));
  },
  warn(scope, message, extra) {
    if (!shouldLog('warn')) return;
    console.warn(...format(scope, message, extra));
  },
  error(scope, message, extra) {
    if (!shouldLog('error')) return;
    console.error(...format(scope, message, extra));
  }
};
