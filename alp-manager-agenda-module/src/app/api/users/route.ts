import { listActiveUsers } from "@/lib/auth/users";
import { getCurrentUser } from "@/lib/auth/session";
import { handleRouteError, jsonError } from "@/lib/calendar/http";

export const dynamic = "force-dynamic";

/** GET /api/users — collaborateurs actifs (pour responsable, participants et filtres). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);

    const users = await listActiveUsers();
    return Response.json({ users });
  } catch (error) {
    return handleRouteError(error);
  }
}
