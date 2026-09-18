export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  key?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("/api" + path, {
      credentials: "include",
      signal: controller.signal,
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              "X-Requested-With": "LaPulperia",
              ...(key ? { "Idempotency-Key": key } : {}),
            },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok)
      throw new ApiError(
        response.status,
        typeof data.message === "string"
          ? data.message
          : "No se pudo completar la solicitud",
      );
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      0,
      "No pudimos conectar. Revisá tu conexión y reintentá.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
export const message = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar la operación";
export function navigate(path: string, options?: { replace?: boolean }) {
  if (options?.replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
