import { timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { handleRouteError, jsonError, readJsonBody } from "@/lib/calendar/http";

export const dynamic = "force-dynamic";

const setupSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(1024),
  setupToken: z.string().min(32).max(512),
});

function validSetupToken(candidate: string): boolean {
  const expected = process.env.ALP_SETUP_TOKEN;
  if (!expected || expected.length < 32) return false;

  const candidateBuffer = Buffer.from(candidate, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

function allowedDirectionEmails(): Set<string> {
  return new Set(
    (process.env.ALP_DIRECTION_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const parsed = setupSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("Informations d'initialisation invalides.", 400);
    }

    const { password, setupToken } = parsed.data;
    const email = parsed.data.email.toLowerCase();

    if (!validSetupToken(setupToken)) {
      return jsonError("Jeton ou adresse non autorisé(e).", 403);
    }

    if (!allowedDirectionEmails().has(email)) {
      return jsonError("Jeton ou adresse non autorisé(e).", 403);
    }

    const passwordHash = await hashPassword(password);

    const initializedUserId = await db.transaction(async (tx) => {
      // Sérialise les initialisations concurrentes sur PostgreSQL.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(741852963)`);

      // Dès qu'un compte Direction possède un mot de passe,
      // le mécanisme d'initialisation est définitivement fermé.
      const [alreadyInitialized] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.role, "direction"),
            isNotNull(users.passwordHash),
          ),
        )
        .limit(1);

      if (alreadyInitialized) return null;

      const [target] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            sql`lower(${users.email}) = ${email}`,
            eq(users.role, "direction"),
            eq(users.isActive, true),
            isNull(users.passwordHash),
          ),
        )
        .limit(1);

      if (!target) return null;

      const [updated] = await tx
        .update(users)
        .set({
          passwordHash,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(users.id, target.id),
            isNull(users.passwordHash),
            eq(users.isActive, true),
          ),
        )
        .returning({ id: users.id });

      return updated?.id ?? null;
    });

   if (!initializedUserId) {
  return jsonError("Compte Direction introuvable, inactif ou déjà initialisé.", 403);
}

    const sessionCreated = await createSession(initializedUserId);

    if (!sessionCreated) {
      return jsonError("Compte initialisé. Connectez-vous pour continuer.", 500);
    }

    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

