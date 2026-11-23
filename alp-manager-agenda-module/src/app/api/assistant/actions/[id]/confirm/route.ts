import { confirmAction } from "@/lib/assistant/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { handleRouteError, jsonError } from "@/lib/calendar/http";

export const dynamic = "force-dynamic";

/** POST /api/assistant/actions/:id/confirm — confirmation explicite : exécute réellement l'action. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);
    const action = await confirmAction(user, id);
    return Response.json({ action });
  } catch (error) {
    return handleRouteError(error);
  }
}
