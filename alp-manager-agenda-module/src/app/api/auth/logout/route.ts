import { revokeCurrentSession } from "@/lib/auth/session";
import { handleRouteError } from "@/lib/calendar/http";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await revokeCurrentSession();
    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
