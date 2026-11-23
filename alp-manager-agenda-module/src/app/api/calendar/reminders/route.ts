import { getCurrentUser } from "@/lib/auth/session";
import { handleRouteError, jsonError } from "@/lib/calendar/http";
import { getDueReminders } from "@/lib/calendar/service";

export const dynamic = "force-dynamic";

/** GET /api/calendar/reminders — rappels à afficher dans ALP Manager (aucun envoi externe). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);

    const reminders = await getDueReminders(user);
    return Response.json({ reminders });
  } catch (error) {
    return handleRouteError(error);
  }
}
