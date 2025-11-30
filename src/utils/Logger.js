import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

export class Logger {
  info(message, meta = {}) {
    logger.info(message, meta);
  }

  error(message, meta = {}) {
    logger.error(message, meta);
  }

  warn(message, meta = {}) {
    logger.warn(message, meta);
  }

  debug(message, meta = {}) {
    logger.debug(message, meta);
  }
}
