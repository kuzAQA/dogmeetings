type ErrorPayload = { error?: string };

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => null) as (T & ErrorPayload) | null;

  if (!response.ok) {
    throw new ApiRequestError(payload?.error || "Не удалось выполнить запрос.", response.status);
  }

  return payload as T;
}
