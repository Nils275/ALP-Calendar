/* Registre des outils de l'assistant : lecture, proposition et audit. Le modèle n'a jamais d'accès SQL libre. */
import { z } from "zod";
import { db } from "@/db";
import { assistantToolCalls } from "@/db/schema";
import type { ToolSpec } from "@/lib/ai/llm";
import { CalendarError } from "@/lib/calendar/service";
import { proposeAction } from "./actions";
import { ACTION_SCHEMAS, type ActionKind } from "./schemas";
import { READ_TOOLS } from "./tools-read";
import type { RegisteredTool, ToolContext, ToolOutcome } from "./types";

const PROPOSE_DESCRIPTIONS: Record<ActionKind, string> = {
  "event.create":
    "Prépare la création d'un rendez-vous ou événement dans l'agenda. Dates AAAA-MM-JJ, heures HH:mm (Europe/Paris). Signale les conflits. Rien n'est créé avant confirmation de l'utilisateur.",
  "event.update":
    "Prépare la modification du titre, de la description, du lieu, de la catégorie, de la priorité ou du statut d'un événement (identifiant obtenu via l'agenda). Confirmation requise.",
  "event.move":
    "Prépare le déplacement d'un événement non récurrent vers une nouvelle date et de nouvelles heures. Confirmation requise.",
  "event.delete":
    "Prépare la suppression d'un événement (irréversible après confirmation). Confirmation requise.",
  "event.describe":
    "Prépare l'ajout d'une description à un événement (mode append) ou son remplacement (mode replace).",
  "event.link_crm":
    "Prépare l'association d'un événement à une entreprise, un contact ou une affaire d'ALP Manager (identifiants fournis par crm_search).",
  "event.add_participants":
    "Prépare l'ajout de participants à un événement (identifiants fournis par team_members).",
  "event.report":
    "Prépare l'enregistrement d'un compte rendu sur un événement. Le texte doit être rédigé à partir des informations fournies par l'utilisateur, sans rien inventer.",
  "event.follow_up":
    "Transforme une demande en tâche de suivi commerciale à une date donnée (événement journée entière, catégorie Commercial).",
  "crm.company.create":
    "Prépare la création d'une entreprise ou d'un prospect dans ALP Manager. Vérifier d'abord avec crm_search pour éviter les doublons.",
  "crm.deal.create":
    "Prépare la création d'une affaire (devis, commande, révision, SAV, projet) rattachée à une entreprise existante (identifiant obtenu via crm_search).",
};

function proposeTools(): RegisteredTool[] {
  return (Object.keys(ACTION_SCHEMAS) as ActionKind[]).map((kind) => ({
    name: `propose_${kind.replace(/\./g, "_")}`,
    mode: "propose" as const,
    description: PROPOSE_DESCRIPTIONS[kind],
    schema: ACTION_SCHEMAS[kind],
    run: (ctx: ToolContext, args: unknown) => proposeAction(ctx, kind, args),
  }));
}

const REGISTRY: RegisteredTool[] = [...READ_TOOLS, ...proposeTools()];
const BY_NAME = new Map(REGISTRY.map((tool) => [tool.name, tool] as const));

/** Définitions envoyées au modèle (JSON Schema généré depuis les schémas Zod). */
export function toolSpecs(): ToolSpec[] {
  return REGISTRY.map((tool) => {
    const json = z.toJSONSchema(tool.schema, { io: "input" }) as Record<string, unknown>;
    const { $schema: _ignored, ...parameters } = json;
    return {
      type: "function" as const,
      function: { name: tool.name, description: tool.description, parameters },
    };
  });
}

export function toolNames(): string[] {
  return REGISTRY.map((t) => t.name);
}

/** Exécute un outil validé et journalise l'appel (succès ou échec). */
export async function runTool(ctx: ToolContext, name: string, rawArgs: unknown): Promise<ToolOutcome> {
  const started = Date.now();
  const tool = BY_NAME.get(name);
  let outcome: ToolOutcome;

  if (!tool) {
    outcome = { ok: false, error: `Outil inconnu : ${name}.` };
  } else {
    const parsed = tool.schema.safeParse(rawArgs);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      outcome = {
        ok: false,
        error: `Paramètres invalides pour ${name} (${issue?.path.join(".") || "racine"} : ${issue?.message ?? "valeur incorrecte"}).`,
      };
    } else {
      try {
        outcome = await tool.run(ctx, parsed.data);
      } catch (error) {
        console.error(`[assistant] outil ${name} en échec`, error);
        outcome = {
          ok: false,
          error: error instanceof CalendarError ? error.message : "Erreur interne pendant l'exécution de l'outil.",
        };
      }
    }
  }

  try {
    await db.insert(assistantToolCalls).values({
      userId: ctx.viewer.id,
      conversationId: ctx.conversationId,
      toolName: name,
      mode: tool?.mode ?? "unknown",
      args: (typeof rawArgs === "object" && rawArgs !== null ? rawArgs : {}) as Record<string, unknown>,
      ok: outcome.ok,
      resultSummary: outcome.ok ? outcome.summary.slice(0, 500) : null,
      error: outcome.ok ? null : outcome.error.slice(0, 500),
      durationMs: Date.now() - started,
    });
  } catch (error) {
    console.error("[assistant] journalisation impossible", error);
  }

  return outcome;
}
