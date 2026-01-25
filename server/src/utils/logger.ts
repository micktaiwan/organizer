import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

const fileTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'organizer-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '10m',
  maxFiles: '14d',
  zippedArchive: true,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
});

const errorTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '10m',
  maxFiles: '14d',
  zippedArchive: true,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [fileTransport, errorTransport],
});

fileTransport.on('rotate', (oldFile, newFile) => {
  console.log(`Log rotated: ${oldFile} -> ${newFile}`);
});

errorTransport.on('rotate', (oldFile, newFile) => {
  console.log(`Error log rotated: ${oldFile} -> ${newFile}`);
});
