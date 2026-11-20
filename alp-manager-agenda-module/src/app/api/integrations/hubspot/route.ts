import { getExternalSyncInfo } from "@/lib/events-service";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getCurrentUser();
    const info = await getExternalSyncInfo();
    return Response.json({ ok: true, data: info });
  } catch (error) {
    console.error("[hubspot] erreur", error);
    return Response.json(
      { ok: false, error: "État de synchronisation indisponible" },
      { status: 500 },
    );
  }
}

export async function POST() {
  return Response.json(
    {
      ok: false,
      status: "not_implemented",
      error:
        "Le connecteur HubSpot n'est pas encore livré. Aucune synchronisation n'a été effectuée et aucune donnée n'a été simulée. Les événements créés restent locaux (source = local).",
    },
    { status: 503 },
  );
}
