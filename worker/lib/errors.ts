export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function redact(value: string) {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}
export function log(event: string, data: Record<string, string | number | boolean | null> = {}) {
  console.log(
    JSON.stringify({
      event,
      ...Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? redact(v) : v]),
      ),
    }),
  );
}
export const id = () => crypto.randomUUID();
