import { getCurrentUser } from "@/lib/auth/session";
import { isUuid } from "@/lib/calendar/service";
import {
  getHubSpotCompanyDetail,
  searchHubSpotCompanies,
} from "@/lib/crm/hubspot-follow-up";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json(
      { ok: false, error: "Route disponible uniquement en developpement." },
      { status: 404 },
    );
  }

  try {
    const user = await getCurrentUser();

    if (!user) {
      return Response.json(
        { ok: false, error: "Aucun utilisateur disponible." },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const query = (searchParams.get("q") ?? "").slice(0, 120);

    if (companyId) {
      if (!isUuid(companyId)) {
        return Response.json(
          { ok: false, error: "Identifiant entreprise invalide." },
          { status: 400 },
        );
      }

      const detail = await getHubSpotCompanyDetail(companyId);

      if (!detail) {
        return Response.json(
          { ok: false, error: "Entreprise HubSpot introuvable." },
          { status: 404 },
        );
      }

      return Response.json({ ok: true, detail });
    }

    const rawLimit = Number(searchParams.get("limit") ?? 50);
    const rawOffset = Number(searchParams.get("offset") ?? 0);

    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
      : 50;

    const offset = Number.isFinite(rawOffset)
      ? Math.max(0, Math.trunc(rawOffset))
      : 0;

    const result = await searchHubSpotCompanies(query, limit, offset);

    return Response.json({
      ok: true,
      companies: result.companies,
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[crm-clients] Erreur :", error);

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue pendant la consultation des clients.",
      },
      { status: 500 },
    );
  }
}
