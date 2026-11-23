
import { getCurrentUser } from "@/lib/auth/session";
import { runHubSpotCrmSync } from "@/lib/integrations/hubspot-crm-sync";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return Response.json(
      {
        ok: false,
        error: "Route disponible uniquement en développement.",
      },
      { status: 404 },
    );
  }

  try {
    const user = await getCurrentUser();

    if (!user) {
      return Response.json(
        { ok: false, error: "Aucun utilisateur disponible." },
        { status: 401 },
      );
    }

    const result = await runHubSpotCrmSync();

    return Response.json({
      ok: true,
      message: "Synchronisation HubSpot terminée.",
      result,
    });
  } catch (error) {
    console.error("[crm-hubspot-sync] Erreur :", error);

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue pendant la synchronisation.",
      },
      { status: 500 },
    );
  }
}
