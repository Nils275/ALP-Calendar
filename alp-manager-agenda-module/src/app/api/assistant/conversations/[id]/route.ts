import { deleteConversation, getConversation } from "@/lib/assistant/agent";
import { getCurrentUser } from "@/lib/auth/session";
import { handleRouteError, jsonError } from "@/lib/calendar/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/assistant/conversations/:id — messages d'une conversation (blocs actualisés). */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);
    return Response.json(await getConversation(user, id));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE /api/assistant/conversations/:id — supprime une conversation de l'historique. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);
    await deleteConversation(user, id);
    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
