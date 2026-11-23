import { listConversations } from "@/lib/assistant/agent";
import { getCurrentUser } from "@/lib/auth/session";
import { handleRouteError, jsonError } from "@/lib/calendar/http";

export const dynamic = "force-dynamic";

/** GET /api/assistant/conversations — historique des conversations de l'utilisateur. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);

    const rows = await listConversations(user);
    return Response.json({
      conversations: rows.map((r) => ({
        id: r.id,
        title: r.title,
        updatedAt: r.updatedAt.toISOString(),
        lastMessageAt: r.lastMessageAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
