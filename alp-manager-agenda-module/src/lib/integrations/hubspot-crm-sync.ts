
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  crmCompanies,
  crmContacts,
  crmDeals,
} from "@/db/schema";
import {
  searchAll,
  readHubSpotAssociations,
  hubspotRequest,
  type HubSpotAssociation,
  type HubSpotRecord,
} from "@/lib/integrations/hubspot";
const SOURCE = "hubspot" as const;
const MAX_RECORDS = 5000;
const BATCH_SIZE = 300;

type LocalId = {
  id: string;
  externalId: string | null;
};

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function value(record: HubSpotRecord, key: string): string | null {
  const result = record.properties[key]?.trim();
  return result || null;
}

function parseDate(input: string | null): Date | null {
  if (!input) return null;

  const date = /^\d+$/.test(input)
    ? new Date(Number(input))
    : new Date(input);

  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateOnly(input: string | null): string | null {
  return parseDate(input)?.toISOString().slice(0, 10) ?? null;
}

function associationMap(
  associations: HubSpotAssociation[],
): Map<string, string> {
  const grouped = new Map<string, HubSpotAssociation[]>();

  for (const association of associations) {
    const current = grouped.get(association.fromId) ?? [];
    current.push(association);
    grouped.set(association.fromId, current);
  }

  const result = new Map<string, string>();

  for (const [fromId, entries] of grouped) {
    entries.sort((a, b) => {
      const aPrimary = a.associationTypes.some(
        (type) => type.label?.toLowerCase() === "primary",
      );
      const bPrimary = b.associationTypes.some(
        (type) => type.label?.toLowerCase() === "primary",
      );

      if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
      return a.toId.localeCompare(b.toId);
    });

    result.set(fromId, entries[0].toId);
  }

  return result;
}



export async function getDealPipelineLabels(): Promise<{
  pipelineLabels: Map<string, string>;
  stageLabels: Map<string, string>;
}> {
  const json = await hubspotRequest<{
    results?: Array<{
      id: string;
      label: string;
      stages?: Array<{
        id: string;
        label: string;
      }>;
    }>;
  }>("/crm/v3/pipelines/deals", "les pipelines des transactions");

  const pipelineLabels = new Map<string, string>();
  const stageLabels = new Map<string, string>();

  for (const pipeline of json.results ?? []) {
    pipelineLabels.set(pipeline.id, pipeline.label);

    for (const stage of pipeline.stages ?? []) {
      stageLabels.set(
        `${pipeline.id}:${stage.id}`,
        stage.label,
      );
    }
  }

  return { pipelineLabels, stageLabels };
}

async function upsertCompanies(records: HubSpotRecord[]) {
  const ids = new Map<string, string>();
  const now = new Date();

  for (const batch of chunks(records, BATCH_SIZE)) {
    const rows = batch.map((record) => ({
      name: value(record, "name") ?? `Entreprise ${record.id}`,
      type: "autre" as const,
      domain: value(record, "domain"),
      city: value(record, "city"),
      country: value(record, "country"),
      sector: value(record, "industry"),
      source: SOURCE,
      externalId: record.id,
      lastSyncedAt: now,
      updatedAt: now,
    }));

    const saved = await db
      .insert(crmCompanies)
      .values(rows)
      .onConflictDoUpdate({
        target: [crmCompanies.source, crmCompanies.externalId],
        targetWhere: sql`${crmCompanies.externalId} is not null`,
        set: {
          name: sql`excluded.name`,
          domain: sql`excluded.domain`,
          city: sql`excluded.city`,
          country: sql`excluded.country`,
          sector: sql`excluded.sector`,
          lastSyncedAt: now,
          updatedAt: now,
        },
      })
      .returning({
        id: crmCompanies.id,
        externalId: crmCompanies.externalId,
      });

    for (const item of saved) {
      if (item.externalId) ids.set(item.externalId, item.id);
    }
  }

  return ids;
}

async function upsertContacts(
  records: HubSpotRecord[],
  companyAssociations: HubSpotAssociation[],
  companyIds: Map<string, string>,
) {
  const ids = new Map<string, string>();
  const companyByContact = associationMap(
    companyAssociations.map((association) => ({
      ...association,
      fromId: association.toId,
      toId: association.fromId,
    })),
  );
  const now = new Date();

  for (const batch of chunks(records, BATCH_SIZE)) {
    const rows = batch.map((record) => {
      const firstName = value(record, "firstname");
      const lastName =
        value(record, "lastname") ?? firstName ?? "Contact sans nom";

      const companyExternalId = companyByContact.get(record.id);

      return {
        firstName,
        lastName,
        email: value(record, "email"),
        phone: value(record, "phone"),
        jobTitle: value(record, "jobtitle"),
        companyId: companyExternalId
          ? companyIds.get(companyExternalId) ?? null
          : null,
        source: SOURCE,
        externalId: record.id,
        lastSyncedAt: now,
        updatedAt: now,
      };
    });

    const saved = await db
      .insert(crmContacts)
      .values(rows)
      .onConflictDoUpdate({
        target: [crmContacts.source, crmContacts.externalId],
        targetWhere: sql`${crmContacts.externalId} is not null`,
        set: {
          firstName: sql`excluded.first_name`,
          lastName: sql`excluded.last_name`,
          email: sql`excluded.email`,
          phone: sql`excluded.phone`,
          jobTitle: sql`excluded.job_title`,
          companyId: sql`excluded.company_id`,
          lastSyncedAt: now,
          updatedAt: now,
        },
      })
      .returning({
        id: crmContacts.id,
        externalId: crmContacts.externalId,
      });

    for (const item of saved) {
      if (item.externalId) ids.set(item.externalId, item.id);
    }
  }

  return ids;
}

async function upsertDeals(
  records: HubSpotRecord[],
  companyAssociations: HubSpotAssociation[],
  contactAssociations: HubSpotAssociation[],
  companyIds: Map<string, string>,
  contactIds: Map<string, string>,
) {
  const ids = new Map<string, string>();
  const companyByDeal = associationMap(companyAssociations);
  const contactByDeal = associationMap(contactAssociations);

  const { pipelineLabels, stageLabels } =
  await getDealPipelineLabels();

  const now = new Date();

  for (const batch of chunks(records, BATCH_SIZE)) {
    const rows = batch.map((record) => {
      const pipelineId = value(record, "pipeline");
      const stageId = value(record, "dealstage");
      const rawAmount = value(record, "amount");
const parsedAmount = rawAmount === null ? null : Number(rawAmount);

const amountEur =
  parsedAmount !== null && Number.isFinite(parsedAmount)
    ? Math.round(parsedAmount)
    : null;

      const companyExternalId = companyByDeal.get(record.id);
      const contactExternalId = contactByDeal.get(record.id);

      return {
        name: value(record, "dealname") ?? `Transaction ${record.id}`,
        companyId: companyExternalId
          ? companyIds.get(companyExternalId) ?? null
          : null,
        contactId: contactExternalId
          ? contactIds.get(contactExternalId) ?? null
          : null,
        hubspotPipelineId: pipelineId,
       hubspotPipelineLabel: pipelineId
  ? pipelineLabels.get(pipelineId) ?? pipelineId
  : null,
        hubspotStageId: stageId,
        hubspotStageLabel:
  pipelineId && stageId
    ? stageLabels.get(`${pipelineId}:${stageId}`) ?? stageId
    : stageId,
        hubspotCreatedAt: parseDate(value(record, "createdate")),
        hubspotUpdatedAt: parseDate(value(record, "hs_lastmodifieddate")),
        amountEur,
        expectedCloseDate: parseDateOnly(value(record, "closedate")),
        source: SOURCE,
        externalId: record.id,
        lastSyncedAt: now,
        updatedAt: now,
      };
    });

    const saved = await db
      .insert(crmDeals)
      .values(rows)
      .onConflictDoUpdate({
        target: [crmDeals.source, crmDeals.externalId],
        targetWhere: sql`${crmDeals.externalId} is not null`,
        set: {
          name: sql`excluded.name`,
          companyId: sql`excluded.company_id`,
          contactId: sql`excluded.contact_id`,
          hubspotPipelineId: sql`excluded.hubspot_pipeline_id`,
          hubspotPipelineLabel: sql`excluded.hubspot_pipeline_label`,
          hubspotStageId: sql`excluded.hubspot_stage_id`,
          hubspotStageLabel: sql`excluded.hubspot_stage_label`,
          hubspotCreatedAt: sql`excluded.hubspot_created_at`,
          hubspotUpdatedAt: sql`excluded.hubspot_updated_at`,
          amountEur: sql`excluded.amount_eur`,
          expectedCloseDate: sql`excluded.expected_close_date`,
          lastSyncedAt: now,
          updatedAt: now,
        },
      })
      .returning({
        id: crmDeals.id,
        externalId: crmDeals.externalId,
      });

    for (const item of saved) {
      if (item.externalId) ids.set(item.externalId, item.id);
    }
  }

  return ids;
}

export async function runHubSpotCrmSync() {
  const [companies, contacts, deals] = await Promise.all([
    searchAll("companies", {
      filterGroups: [],
      properties: ["name", "domain", "city", "country", "industry"],
    }, MAX_RECORDS),

    searchAll("contacts", {
      filterGroups: [],
      properties: [
        "firstname",
        "lastname",
        "email",
        "phone",
        "jobtitle",
      ],
    }, MAX_RECORDS),

    searchAll("deals", {
      filterGroups: [],
      properties: [
        "dealname",
        "amount",
        "dealstage",
        "closedate",
        "pipeline",
        "createdate",
        "hs_lastmodifieddate",
      ],
    }, MAX_RECORDS),
  ]);

  const companyIds = await upsertCompanies(companies);

  const companyAssociations = await readHubSpotAssociations(
    "companies",
    "contacts",
    companies.map((record) => record.id),
  );

  const contactIds = await upsertContacts(
    contacts,
    companyAssociations,
    companyIds,
  );

  const [dealCompanyAssociations, dealContactAssociations] =
    await Promise.all([
      readHubSpotAssociations(
        "deals",
        "companies",
        deals.map((record) => record.id),
      ),
      readHubSpotAssociations(
        "deals",
        "contacts",
        deals.map((record) => record.id),
      ),
    ]);

  const dealIds = await upsertDeals(
    deals,
    dealCompanyAssociations,
    dealContactAssociations,
    companyIds,
    contactIds,
  );

  return {
    companies: companyIds.size,
    contacts: contactIds.size,
    deals: dealIds.size,
    synchronizedAt: new Date().toISOString(),
    limit: MAX_RECORDS,
  };
}
