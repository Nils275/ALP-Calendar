import { getCurrentUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/calendar/http";
import {
  readHubSpotAssociations,
  searchAll,
} from "@/lib/integrations/hubspot";

export const dynamic = "force-dynamic";

function summarizeAssociations(
  associations: Awaited<ReturnType<typeof readHubSpotAssociations>>,
) {
  const groups = new Map<
    string,
    { category: string; typeId: number; label: string | null; count: number }
  >();

  for (const association of associations) {
    for (const type of association.associationTypes) {
      const key = `${type.category}:${type.typeId}:${type.label ?? ""}`;
      const existing = groups.get(key);

      if (existing) {
        existing.count++;
      } else {
        groups.set(key, {
          category: type.category,
          typeId: type.typeId,
          label: type.label,
          count: 1,
        });
      }
    }
  }

  return {
    associationsRead: associations.length,
    primaryAssociations: associations.filter((association) =>
      association.associationTypes.some(
        (type) => type.label?.toLowerCase() === "primary",
      ),
    ).length,
    types: Array.from(groups.values()).sort(
      (a, b) => b.count - a.count,
    ),
  };
}

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return jsonError("Route disponible uniquement en développement.", 404);
  }

  try {
    const user = await getCurrentUser();

    if (!user) {
      return jsonError("Aucun utilisateur disponible.", 401);
    }

    const deals = await searchAll(
      "deals",
      {
        filterGroups: [],
        properties: ["dealname"],
      },
      30,
    );

    const dealContacts = await readHubSpotAssociations(
      "deals",
      "contacts",
      deals.map((deal) => deal.id),
    );

    const contactIds = [
      ...new Set(dealContacts.map((association) => association.toId)),
    ];

    const contactCompanies = await readHubSpotAssociations(
      "contacts",
      "companies",
      contactIds,
    );

    return Response.json({
      ok: true,
      sample: {
        dealsRead: deals.length,
        contactsAssociated: contactIds.length,
      },
      dealToContact: summarizeAssociations(dealContacts),
      contactToCompany: summarizeAssociations(contactCompanies),
    });
  } catch (error) {
    console.error("[hubspot-associations] Diagnostic impossible", error);

    return jsonError(
      error instanceof Error ? error.message : "Erreur HubSpot inconnue.",
      500,
    );
  }
}
