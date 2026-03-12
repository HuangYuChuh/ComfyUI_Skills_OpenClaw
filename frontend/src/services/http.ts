export class ApiError extends Error {
  status?: number;
  detail?: unknown;
  code?: string;

  constructor(message: string, options: { status?: number; detail?: unknown; code?: string } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.detail = options.detail;
    this.code = options.code;
  }
}

function parseValidationMessage(detail: unknown): string | null {
  if (!Array.isArray(detail)) {
    return null;
  }
  const message = detail
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).msg || (item as Record<string, unknown>).message : null))
    .filter(Boolean)
    .join("; ");
  return message || null;
}

export async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const payloadObject = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    const message =
      parseValidationMessage(payloadObject?.detail) ||
      (payloadObject?.detail as string | undefined) ||
      (payloadObject?.message as string | undefined) ||
      (typeof payload === "string" ? payload : undefined) ||
      response.statusText ||
      "Request failed";

    throw new ApiError(message, {
      status: response.status,
      detail: payloadObject?.detail,
      code: payloadObject?.code as string | undefined,
    });
  }

  return (payload ?? {}) as T;
}
