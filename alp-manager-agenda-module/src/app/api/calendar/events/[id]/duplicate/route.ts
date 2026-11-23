import { getCurrentUser } from "@/lib/auth/session";
import { handleRouteError, jsonError } from "@/lib/calendar/http";
import { duplicateEvent, isUuid } from "@/lib/calendar/service";

export const dynamic = "force-dynamic";

/** POST /api/calendar/events/:id/duplicate — crée une copie locale de l'événement. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);
    if (!isUuid(id)) return jsonError("Événement introuvable.", 404);

    const newId = await duplicateEvent(user, id);
    return Response.json({ id: newId }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
