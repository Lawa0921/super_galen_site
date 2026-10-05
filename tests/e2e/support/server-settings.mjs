export function getE2EPort() {
  const port = Number(process.env.E2E_PORT ?? 4002);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('E2E_PORT must be an integer between 1 and 65535');
  }
  return port;
}
