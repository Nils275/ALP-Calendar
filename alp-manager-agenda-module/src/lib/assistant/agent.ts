/* Orchestration d'un tour de conversation : persistance, modèle IA (si configuré) ou planificateur, outils, réponse structurée. */
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assistantConversations, assistantMessages } from "@/db/schema";
import { chatCompletion, getAiConfig, type AiConfig, type ChatMessage } from "@/lib/ai/llm";
import { CalendarError, isUuid } from "@/lib/calendar/service";
import { formatInstantLong } from "@/lib/calendar/time";
import type { CalendarUser } from "@/lib/calendar/types";
import { currentActionSnapshots } from "./actions";
import { buildSystemPrompt } from "./context";
import { planRules } from "./rules";
import { runTool, toolSpecs } from "./tools";
import { DEFAULT_SUGGESTIONS, type Block, type ToolContext, type ViewMessage } from "./types";

const MAX_STEPS = 6;
const HISTORY_LIMIT = 12;
const TITLE_MAX = 60;
const TOOL_RESULT_MAX = 6000;

const HELP_TEXT =
  "Je peux consulter votre agenda (jour, semaine, mois), chercher des créneaux, détecter les conflits, préparer votre journée, retrouver un client, lister les relances, et préparer des actions (création, modification, compte rendu). Aucune action n'est exécutée sans votre confirmation.\n\nLe mode simplifié reconnaît les demandes courantes. Pour un langage libre et des demandes plus complexes, configurez une clé IA (AI_API_KEY).";

type ConversationRow = typeof assistantConversations.$inferSelect;
type MessageRow = typeof assistantMessages.$inferSelect;
type TurnContent = { content: string; blocks: Block[] };

export type TurnResult = {
  conversationId: string;
  mode: "llm" | "rules";
  userMessage: ViewMessage;
  assistantMessage: ViewMessage;
};

function toView(row: MessageRow, blocks: Block[]): ViewMessage {
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    blocks,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Met à jour l'état des cartes d'action (une action peut avoir été confirmée depuis l'enregistrement). */
async function hydrateBlocks(userId: string, blocks: Block[]): Promise<Block[]> {
  const ids = blocks.flatMap((b) => (b.type === "action" ? [b.action.id] : []));
  if (ids.length === 0) return blocks;
  const fresh = await currentActionSnapshots(userId, ids);
  return blocks.map((b): Block => {
    if (b.type !== "action") return b;
    const current = fresh.get(b.action.id);
    return current ? { type: "action", action: current } : b;
  });
}

async function ensureConversation(
  userId: string,
  conversationId: string | null,
  text: string,
  now: Date,
): Promise<ConversationRow> {
  if (conversationId) {
    if (!isUuid(conversationId)) throw new CalendarError("Conversation introuvable.", 404);
    const [row] = await db
      .select()
      .from(assistantConversations)
      .where(and(eq(assistantConversations.id, conversationId), eq(assistantConversations.userId, userId)))
      .limit(1);
    if (!row) throw new CalendarError("Conversation introuvable.", 404);
    return row;
  }
  const title = text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text;
  const [row] = await db
    .insert(assistantConversations)
    .values({ userId, title, createdAt: now, updatedAt: now, lastMessageAt: now })
    .returning();
  return row;
}

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

async function runLlmTurn(
  ctx: ToolContext,
  cfg: AiConfig,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  text: string,
): Promise<TurnContent> {
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(ctx.viewer, formatInstantLong(ctx.now)) },
    ...history.map((h): ChatMessage =>
      h.role === "user" ? { role: "user", content: h.content } : { role: "assistant", content: h.content },
    ),
    { role: "user", content: text },
  ];
  const blocks: Block[] = [];
  const specs = toolSpecs();

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await chatCompletion(cfg, messages, specs);
    if (reply.toolCalls.length === 0) {
      const content = (reply.content ?? "").trim();
      return { content: content || "Je n'ai pas de réponse à formuler pour cette demande.", blocks };
    }

    messages.push({ role: "assistant", content: reply.content, tool_calls: reply.toolCalls });
    for (const call of reply.toolCalls) {
      const outcome = await runTool(ctx, call.function.name, parseArgs(call.function.arguments));
      if (outcome.ok) blocks.push(...outcome.blocks);
      else blocks.push({ type: "alert", tone: "warning", text: outcome.error });
      const payload = outcome.ok
        ? { ok: true, summary: outcome.summary, data: outcome.data }
        : { ok: false, error: outcome.error };
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(payload).slice(0, TOOL_RESULT_MAX),
      });
    }
  }

  return { content: "Je n'ai pas pu finaliser la réponse. Reformulez votre demande.", blocks };
}

async function runRulesTurn(ctx: ToolContext, text: string): Promise<TurnContent> {
  const plan = planRules(text, ctx.now);
  if (plan.calls.length === 0) {
    return {
      content: plan.note ?? HELP_TEXT,
      blocks: [{ type: "suggestions", items: DEFAULT_SUGGESTIONS }],
    };
  }

  const blocks: Block[] = [];
  const lines: string[] = [];
  if (plan.note) lines.push(plan.note);
  for (const call of plan.calls) {
    const outcome = await runTool(ctx, call.name, call.args);
    if (outcome.ok) {
      lines.push(outcome.summary);
      blocks.push(...outcome.blocks);
    } else {
      lines.push(`Impossible : ${outcome.error}`);
      blocks.push({ type: "alert", tone: "warning", text: outcome.error });
    }
  }
  return { content: lines.join("\n"), blocks };
}

/** Un tour complet : enregistre le message, produit la réponse, la persiste et la renvoie structurée. */
export async function runAssistantTurn(
  viewer: CalendarUser,
  input: { conversationId?: string | null; text: string },
): Promise<TurnResult> {
  const now = new Date();
  const text = input.text.trim();
  if (!text) throw new CalendarError("Le message est vide.", 400);
  if (text.length > 2000) throw new CalendarError("Le message dépasse 2000 caractères.", 400);

  const conversation = await ensureConversation(viewer.id, input.conversationId ?? null, text, now);
  const history = await db
    .select({ role: assistantMessages.role, content: assistantMessages.content })
    .from(assistantMessages)
    .where(eq(assistantMessages.conversationId, conversation.id))
    .orderBy(desc(assistantMessages.createdAt))
    .limit(HISTORY_LIMIT);
  const [userRow] = await db
    .insert(assistantMessages)
    .values({ conversationId: conversation.id, role: "user", content: text, blocks: [] })
    .returning();

  const cfg = getAiConfig();
  const ctx: ToolContext = { viewer, conversationId: conversation.id, now };

  let result: TurnContent;
  try {
    result = cfg
      ? await runLlmTurn(
          ctx,
          cfg,
          history.reverse().map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.content })),
          text,
        )
      : await runRulesTurn(ctx, text);
  } catch (error) {
    console.error("[assistant] tour en échec", error);
    result = {
      content: "Je n'ai pas pu traiter cette demande pour le moment. Aucune action n'a été effectuée.",
      blocks: [
        {
          type: "alert",
          tone: "warning",
          text: error instanceof CalendarError ? error.message : "Erreur technique pendant le traitement de la demande.",
        },
      ],
    };
  }

  const [assistantRow] = await db
    .insert(assistantMessages)
    .values({ conversationId: conversation.id, role: "assistant", content: result.content, blocks: result.blocks as unknown[] })
    .returning();
  await db
    .update(assistantConversations)
    .set({ updatedAt: new Date(), lastMessageAt: new Date() })
    .where(eq(assistantConversations.id, conversation.id));

  return {
    conversationId: conversation.id,
    mode: cfg ? "llm" : "rules",
    userMessage: toView(userRow, []),
    assistantMessage: toView(assistantRow, await hydrateBlocks(viewer.id, result.blocks)),
  };
}

export async function listConversations(viewer: CalendarUser) {
  return db
    .select({
      id: assistantConversations.id,
      title: assistantConversations.title,
      updatedAt: assistantConversations.updatedAt,
      lastMessageAt: assistantConversations.lastMessageAt,
    })
    .from(assistantConversations)
    .where(eq(assistantConversations.userId, viewer.id))
    .orderBy(desc(assistantConversations.lastMessageAt))
    .limit(50);
}

export async function getConversation(viewer: CalendarUser, id: string) {
  const conversation = await ensureConversation(viewer.id, id, "", new Date());
  const rows = await db
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.conversationId, conversation.id))
    .orderBy(asc(assistantMessages.createdAt));
  const messages = await Promise.all(
    rows.map(async (row) => toView(row, await hydrateBlocks(viewer.id, (row.blocks as Block[]) ?? []))),
  );
  return {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt.toISOString(),
      lastMessageAt: conversation.lastMessageAt.toISOString(),
    },
    messages,
  };
}

export async function deleteConversation(viewer: CalendarUser, id: string): Promise<void> {
  const conversation = await ensureConversation(viewer.id, id, "", new Date());
  await db.delete(assistantConversations).where(eq(assistantConversations.id, conversation.id));
}
