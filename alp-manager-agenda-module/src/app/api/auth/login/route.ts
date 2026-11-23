import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import {
  clearLoginFailures,
  isLoginBlocked,
  recordLoginFailure,
} from "@/lib/auth/login-limits";
import { toCalendarUser } from "@/lib/auth/users";
import {
  handleRouteError,
  jsonError,
  readJsonBody,
} from "@/lib/calendar/http";
import { isIP } from "node:net";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(1024),
});

function getClientIp(request: Request): string | null {
  // En production, on utilise l'en-tête transmis par la plateforme Vercel.
  if (process.env.VERCEL !== "1") return null;

  const forwardedFor = request.headers.get("x-forwarded-for");
  const candidate = forwardedFor?.split(",")[0]?.trim();

  return candidate && isIP(candidate) ? candidate : null;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("Adresse e-mail ou mot de passe invalide.", 400);
    }

    const email = parsed.data.email.toLowerCase();
    const password = parsed.data.password;
    const ip = getClientIp(request);

    if (await isLoginBlocked(email, ip)) {
      return jsonError(
        "Trop de tentatives. Réessayez dans 15 minutes.",
        429,
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (
      !user ||
      !user.isActive ||
      !user.passwordHash ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      await recordLoginFailure(email, ip);
      return jsonError("Adresse e-mail ou mot de passe invalide.", 401);
    }

    const sessionCreated = await createSession(user.id);

    if (!sessionCreated) {
      return jsonError("Connexion impossible. Réessayez.", 500);
    }

    await clearLoginFailures(email, ip);

    return Response.json({
      ok: true,
      user: toCalendarUser(user),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
