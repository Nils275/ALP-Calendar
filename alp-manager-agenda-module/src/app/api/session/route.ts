import { getCurrentUser } from "@/lib/auth/session";
import { handleRouteError, jsonError } from "@/lib/calendar/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return jsonError("Session non authentifiée.", 401);
    }

    return Response.json({ user });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST() {
  return jsonError(
    "Le changement de collaborateur n'est plus autorisé. Connectez-vous avec vos identifiants.",
    405,
  );
}
