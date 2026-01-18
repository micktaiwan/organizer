// Logging utility for worker

function log(level, message, data = null) {
  const logMsg = { type: 'log', level, message };
  if (data) logMsg.data = data;
  process.stdout.write(JSON.stringify(logMsg) + '\n');
}

export { log };
