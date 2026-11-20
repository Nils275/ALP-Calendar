import { NextRequest } from "next/server";
import { ZodError } from "zod";

import {
  AgendaError,
  createEvent,
  getAgendaData,
} from "@/lib/events-service";
import { eventInputSchema, eventListQuerySchema } from "@/lib/agenda-schema";
import { getCurrentUser } from "@/lib/session";
import { parisDateKey, startOfWeekKey, endOfWeekKey } from "@/lib/time";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      {
        ok: false,
        error: "Données invalides",
        details: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }
  if (error instanceof AgendaError) {
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  }
  console.error("[agenda] erreur serveur", error);
  return Response.json(
    { ok: false, error: "Erreur interne, merci de réessayer" },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const params = request.nextUrl.searchParams;
    const todayKey = parisDateKey(new Date());
    const fallbackFrom = startOfWeekKey(todayKey);
    const fallbackTo = endOfWeekKey(todayKey);

    const parsed = eventListQuerySchema.parse({
      from: params.get("from") ?? fallbackFrom,
      to: params.get("to") ?? fallbackTo,
      categories: params.get("categories") ?? undefined,
      assignee: params.get("assignee") ?? undefined,
      search: params.get("search") ?? undefined,
      scope: params.get("scope") ?? undefined,
      status: params.get("status") ?? undefined,
      view: params.get("view") ?? undefined,
    });

    if (parsed.to < parsed.from) {
      return Response.json(
        { ok: false, error: "Fenêtre de dates invalide" },
        { status: 400 },
      );
    }

    const assignee = parsed.assignee ? Number.parseInt(parsed.assignee, 10) : null;

    const data = await getAgendaData({
      from: parsed.from,
      to: parsed.to,
      categories: parsed.categories
        ? parsed.categories.split(",").map((value) => value.trim()).filter(Boolean)
        : [],
      assignee: Number.isFinite(assignee) ? assignee : null,
      search: parsed.search,
      scope: parsed.scope,
      status: parsed.status,
      user,
    });

    return Response.json({ ok: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const input = eventInputSchema.parse(body);
    const event = await createEvent(input, user);
    return Response.json({ ok: true, event }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
