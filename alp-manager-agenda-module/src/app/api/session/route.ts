import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import {
  getCurrentUser,
  listCollaborators,
  setSessionUser,
} from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const collaborators = await listCollaborators();
    return Response.json({ ok: true, user, collaborators });
  } catch (error) {
    console.error("[session] erreur", error);
    return Response.json({ ok: false, error: "Session indisponible" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { userId?: number };
    const userId = Number(body.userId);
    if (!Number.isFinite(userId)) {
      return Response.json({ ok: false, error: "Collaborateur invalide" }, { status: 400 });
    }
    const [found] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!found || !found.isActive) {
      return Response.json({ ok: false, error: "Collaborateur introuvable" }, { status: 404 });
    }
    await setSessionUser(userId);
    const collaborators = await listCollaborators();
    return Response.json({ ok: true, user: found, collaborators });
  } catch (error) {
    console.error("[session] erreur", error);
    return Response.json({ ok: false, error: "Changement impossible" }, { status: 500 });
  }
}
