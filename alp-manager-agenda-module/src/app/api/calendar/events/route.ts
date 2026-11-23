import { getCurrentUser } from "@/lib/auth/session";
import { handleRouteError, jsonError, parseDateParam, readJsonBody } from "@/lib/calendar/http";
import { createEvent, listCalendarRange } from "@/lib/calendar/service";
import { parseEventFields } from "@/lib/calendar/validation";

export const dynamic = "force-dynamic";

const MAX_RANGE_MS = 400 * 86_400_000;

/** GET /api/calendar/events?from=ISO&to=ISO — événements visibles et occurrences dans la plage. */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);

    const url = new URL(request.url);
    const from = parseDateParam(url.searchParams.get("from"));
    const to = parseDateParam(url.searchParams.get("to"));
    if (!from || !to || to.getTime() <= from.getTime()) {
      return jsonError("Plage de dates invalide.", 400);
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      return jsonError("La plage demandée est trop large.", 400);
    }

    const data = await listCalendarRange(user, from, to);
    return Response.json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/calendar/events — création d'un événement (local, non synchronisé). */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);

    const body = await readJsonBody(request);
    if (!body) return jsonError("Corps de requête invalide.", 400);

    const parsed = parseEventFields(body);
    if (!parsed.ok) return jsonError(parsed.error, 400);

    const id = await createEvent(user, parsed.data);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
