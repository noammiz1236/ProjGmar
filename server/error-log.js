// Error logging utility for SmartCart server
import fs from 'fs';
import path from 'path';

const logFile = path.join(process.cwd(), 'server-errors.log');

export function logError(error, context = '') {
  const timestamp = new Date().toISOString();
  const logMessage = `
[${timestamp}] ${context}
Error: ${error.message}
Stack: ${error.stack}
---
`;
  
  fs.appendFileSync(logFile, logMessage);
  console.error(logMessage);
}

// Install global error handlers
process.on('uncaughtException', (error) => {
  logError(error, 'UNCAUGHT EXCEPTION');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError(
    new Error(reason instanceof Error ? reason.message : String(reason)),
    'UNHANDLED REJECTION'
  );
});

process.on('SIGTERM', () => {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] Process received SIGTERM signal\n`);
  process.exit(0);
});

process.on('SIGINT', () => {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] Process received SIGINT signal (Ctrl+C)\n`);
  process.exit(0);
});
