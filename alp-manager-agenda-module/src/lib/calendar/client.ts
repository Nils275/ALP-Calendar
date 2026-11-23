/* Utilitaires côté navigateur pour l'agenda : appels API et charge utile du glisser-déposer. */

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(url: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers: hasBody ? { "content-type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Connexion au serveur impossible. Vérifiez votre réseau.", 0);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Une erreur est survenue (${res.status}).`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Une erreur inattendue est survenue.";
}

/** Type MIME interne pour le glisser-déposer d'une occurrence (repli sur text/plain pour Firefox). */
export const DRAG_MIME = "application/x-alp-occurrence";

export type DragPayload = {
  key: string;
  eventId: string;
  occurrenceStart: string;
  start: string;
  end: string;
  allDay: boolean;
  title: string;
  canEdit: boolean;
};

export function readDragPayload(dataTransfer: DataTransfer): DragPayload | null {
  const raw = dataTransfer.getData(DRAG_MIME) || dataTransfer.getData("text/plain");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DragPayload;
    return parsed && parsed.eventId ? parsed : null;
  } catch {
    return null;
  }
}
