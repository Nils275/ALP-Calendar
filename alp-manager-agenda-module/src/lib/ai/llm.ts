/*
 * Adaptateur du fournisseur de langage (serveur uniquement).
 * Protocole compatible OpenAI Chat Completions (appels d'outils).
 * Variables : AI_API_KEY (ou OPENAI_API_KEY), AI_BASE_URL (défaut OpenAI), AI_MODEL (défaut gpt-4o-mini).
 * La clé n'est jamais transmise au navigateur.
 */

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolSpec = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type AiConfig = { apiKey: string; baseUrl: string; model: string };

export class AiServiceError extends Error {}

export function getAiConfig(): AiConfig | null {
  const apiKey = (process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.AI_MODEL || "gpt-4o-mini",
  };
}

export async function chatCompletion(
  config: AiConfig,
  messages: ChatMessage[],
  tools: ToolSpec[],
): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
        temperature: 0.2,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    throw new AiServiceError(aborted ? "Le service IA n'a pas répondu à temps." : "Le service IA est injoignable.");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    console.error("[ai] réponse HTTP", response.status);
    throw new AiServiceError(`Le service IA a renvoyé une erreur (${response.status}).`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
  };
  const message = json.choices?.[0]?.message;
  return { content: message?.content ?? null, toolCalls: message?.tool_calls ?? [] };
}
