import { NextRequest } from "next/server";
import { ZodError } from "zod";

import {
  AgendaError,
  applyMutation,
  deleteEventAndReport,
} from "@/lib/events-service";
import { eventMutationSchema } from "@/lib/agenda-schema";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

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

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const body = await request.json();
    const mutation = eventMutationSchema.parse(body);
    const result = await applyMutation(id, mutation, user);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const scope =
      request.nextUrl.searchParams.get("scope") === "occurrence"
        ? "occurrence"
        : "series";
    const occurrenceDate = request.nextUrl.searchParams.get("occurrenceDate") ?? undefined;
    const result = await deleteEventAndReport(id, user, scope, occurrenceDate);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
