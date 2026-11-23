import { z } from "zod";
import { runAssistantTurn } from "@/lib/assistant/agent";
import { getCurrentUser } from "@/lib/auth/session";
import { handleRouteError, jsonError, readJsonBody } from "@/lib/calendar/http";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.uuid().nullish(),
  text: z.string().min(1, "Le message est vide.").max(2000, "Le message dépasse 2000 caractères."),
});

/** POST /api/assistant/messages — envoie un message et reçoit la réponse structurée. */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Aucun utilisateur connecté.", 401);

    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Message invalide.", 400);

    const result = await runAssistantTurn(user, {
      conversationId: parsed.data.conversationId ?? null,
      text: parsed.data.text,
    });
    return Response.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
