import { count, max } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { handleRouteError, jsonError } from "@/lib/calendar/http";
import { getHubSpotStatus, HubSpotError } from "@/lib/integrations/hubspot";
import { runHubSpotSync } from "@/lib/integrations/hubspot-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function getSyncOverview() {
  const configured = Boolean(process.env.HUBSPOT_ACCESS_TOKEN);
  const rows = await db
    .select({ source: calendarEvents.source, value: count() })
    .from(calendarEvents)
    .groupBy(calendarEvents.source);
  const [last] = await db.select({ value: max(calendarEvents.lastSyncedAt) }).from(calendarEvents);

  const counts: Record<string, number> = { local: 0, hubspot: 0, outlook: 0 };
  for (const row of rows) counts[row.source] = Number(row.value);

  const status = configured ? await getHubSpotStatus() : null;
  return {
    provider: "hubspot",
    configured,
    missingVariables: configured ? [] : ["HUBSPOT_ACCESS_TOKEN"],
    counts,
    lastSyncedAt: last?.value ? new Date(last.value).toISOString() : null,
    implemented: true,
    reachable: status?.reachable ?? false,
    error: status?.error ?? null,
  };
}

/** GET /api/calendar/sync — état de la connexion HubSpot et nombre d'événements par source. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);
    return Response.json(await getSyncOverview());
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/calendar/sync — lance la synchronisation HubSpot → agenda (réservé à la direction). */
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);
    if (user.role !== "direction") {
      return jsonError("Seule la direction peut lancer une synchronisation.", 403);
    }
    return Response.json(await runHubSpotSync());
  } catch (error) {
    if (error instanceof HubSpotError) return jsonError(error.message, error.status === 401 ? 502 : 400);
    return handleRouteError(error);
  }
}
