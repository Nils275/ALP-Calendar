import { getCurrentUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/calendar/http";
import { getDealPipelineLabels } from "@/lib/integrations/hubspot-crm-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return jsonError("Route disponible uniquement en developpement.", 404);
  }

  try {
    const user = await getCurrentUser();

    if (!user) {
      return jsonError("Aucun utilisateur disponible.", 401);
    }

    const { pipelineLabels, stageLabels } =
      await getDealPipelineLabels();

    return Response.json({
      ok: true,
      pipelines: Array.from(pipelineLabels, ([id, label]) => ({
        id,
        label,
        stages: Array.from(stageLabels, ([key, stageLabel]) => {
          const [pipelineId, stageId] = key.split(":");

          return pipelineId === id
            ? { id: stageId, label: stageLabel }
            : null;
        }).filter(Boolean),
      })),
    });
  } catch (error) {
    console.error("[hubspot-pipelines] Diagnostic impossible", error);

    return jsonError(
      error instanceof Error ? error.message : "Erreur HubSpot inconnue.",
      500,
    );
  }
}
