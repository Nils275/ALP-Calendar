/* Utilitaires HTTP partagés par les route handlers de l'agenda. */
import { CalendarError } from "./service";

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function handleRouteError(error: unknown): Response {
  if (error instanceof CalendarError) {
    return jsonError(error.message, error.status);
  }
  console.error("[calendar] erreur serveur", error);
  return jsonError("Erreur serveur. Réessayez dans un instant.", 500);
}

export async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
}
