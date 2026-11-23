import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { crmCompanies, crmContacts, crmDeals } from "@/db/schema";

const SOURCE = "hubspot" as const;

function searchPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export async function searchHubSpotCompanies(
  query = "",
  limit = 50,
  offset = 0,
) {
  const conditions = [eq(crmCompanies.source, SOURCE)];
  const normalizedQuery = query.trim();

  if (normalizedQuery) {
    const pattern = searchPattern(normalizedQuery);

    conditions.push(
      or(
        ilike(crmCompanies.name, pattern),
        ilike(crmCompanies.domain, pattern),
        ilike(crmCompanies.city, pattern),
      )!,
    );
  }

  const whereCondition = and(...conditions);

  const [countResult, companies] = await Promise.all([
    db
      .select({ total: count() })
      .from(crmCompanies)
      .where(whereCondition),

    db
      .select()
      .from(crmCompanies)
      .where(whereCondition)
      .orderBy(crmCompanies.name)
      .limit(Math.min(Math.max(limit, 1), 100))
      .offset(Math.max(0, offset)),
  ]);

  return {
    companies,
    total: countResult[0]?.total ?? 0,
  };
}

export async function getHubSpotCompanyDetail(companyId: string) {
  const [company] = await db
    .select()
    .from(crmCompanies)
    .where(
      and(
        eq(crmCompanies.id, companyId),
        eq(crmCompanies.source, SOURCE),
      ),
    )
    .limit(1);

  if (!company) {
    return null;
  }

  const contacts = await db
    .select()
    .from(crmContacts)
    .where(
      and(
        eq(crmContacts.companyId, companyId),
        eq(crmContacts.source, SOURCE),
      ),
    )
    .orderBy(crmContacts.lastName);

  const contactIds = contacts.map((contact) => contact.id);

  const associationCondition =
    contactIds.length > 0
      ? or(
          eq(crmDeals.companyId, companyId),
          inArray(crmDeals.contactId, contactIds),
        )
      : eq(crmDeals.companyId, companyId);

  const deals = await db
    .select()
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.source, SOURCE),
        associationCondition,
      ),
    )
    .orderBy(
      desc(crmDeals.hubspotCreatedAt),
      desc(crmDeals.createdAt),
    );

  return {
    company,
    contacts,
    deals,
    stats: {
      contacts: contacts.length,
      transactions: deals.length,
    },
  };
}
