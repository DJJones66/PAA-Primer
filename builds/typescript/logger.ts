import type { AuditLogEvent } from "./contracts.js";

export function auditLog(event: string, details: Record<string, unknown>): void {
  const payload: AuditLogEvent = {
    timestamp: new Date().toISOString(),
    event,
    details,
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
