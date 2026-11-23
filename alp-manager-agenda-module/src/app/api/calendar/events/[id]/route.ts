import { getCurrentUser } from "@/lib/auth/session";
import { handleRouteError, jsonError, readJsonBody } from "@/lib/calendar/http";
import {
  deleteEvent,
  getEventDetail,
  isUuid,
  rescheduleOccurrence,
  setOccurrenceStatus,
  updateEvent,
} from "@/lib/calendar/service";
import { parseEventFields, patchEventSchema } from "@/lib/calendar/validation";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/calendar/events/:id?occurrenceStart=ISO — fiche détaillée. */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);
    if (!isUuid(id)) return jsonError("Événement introuvable.", 404);

    const occurrenceStart = new URL(request.url).searchParams.get("occurrenceStart");
    const detail = await getEventDetail(user, id, occurrenceStart);
    if (!detail) return jsonError("Événement introuvable.", 404);

    return Response.json(detail);
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PATCH /api/calendar/events/:id
 * - kind "update"     : modification complète (toute la série si récurrent)
 * - kind "reschedule" : nouvelle date/heure d'une occurrence (ou de la série si applyToSeries)
 * - kind "status"     : changement de statut (ex. terminé) d'une occurrence ou de l'événement
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);
    if (!isUuid(id)) return jsonError("Événement introuvable.", 404);

    const body = await readJsonBody(request);
    if (!body) return jsonError("Corps de requête invalide.", 400);

    const parsed = patchEventSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Données invalides.", 400);
    }
    const data = parsed.data;

    if (data.kind === "update") {
      const fields = parseEventFields(body);
      if (!fields.ok) return jsonError(fields.error, 400);
      await updateEvent(user, id, fields.data);
    } else if (data.kind === "reschedule") {
      await rescheduleOccurrence(user, id, {
        occurrenceStart: data.occurrenceStart ?? null,
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        applyToSeries: data.applyToSeries,
      });
    } else {
      await setOccurrenceStatus(user, id, data.occurrenceStart ?? null, data.status);
    }

    const detail = await getEventDetail(user, id, data.kind === "update" ? null : (data.occurrenceStart ?? null));
    return Response.json(detail ?? { ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE /api/calendar/events/:id?scope=occurrence|series&occurrenceStart=ISO */
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);
    if (!isUuid(id)) return jsonError("Événement introuvable.", 404);

    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") === "series" ? "series" : "occurrence";
    const occurrenceStart = url.searchParams.get("occurrenceStart");

    await deleteEvent(user, id, occurrenceStart, scope);
    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
