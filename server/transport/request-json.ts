type JsonRecord = Record<string, unknown>;

export function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function readJsonRecord(request: Request) {
  try {
    const payload: unknown = await request.json();
    return isJsonRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

export function readJsonString(payload: JsonRecord | null, key: string) {
  const value = payload?.[key];
  return typeof value === "string" ? value : "";
}
