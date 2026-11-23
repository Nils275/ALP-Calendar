/*
 * Client HubSpot (serveur uniquement). Lecture seule.
 *
 * Variables :
 *   HUBSPOT_ACCESS_TOKEN  clé de service (ou jeton d'application) HubSpot — jamais exposée au navigateur.
 *   HUBSPOT_API_BASE      optionnel, défaut https://api.hubapi.com
 *
 * Le jeton n'est envoyé que dans l'en-tête Authorization, jamais dans une URL.
 * Les droits accordés ne sont pas lus via une adresse contenant le jeton : on sonde chaque type d'objet
 * (une lecture de 1 élément) et on déduit les droits manquants des réponses 403.
 * Aucune donnée HubSpot n'est simulée.
 */

export type HubSpotObject = "companies" | "contacts" | "deals";

export const HUBSPOT_SCOPES = {
  companies: "crm.objects.companies.read",
  contacts: "crm.objects.contacts.read",
  deals: "crm.objects.deals.read",
} as const satisfies Record<HubSpotObject, string>;

export type HubSpotStatus = {
  configured: boolean;
  reachable: boolean;
  /** Droits dont la lecture a pu être vérifiée (parmi ceux de HUBSPOT_SCOPES). */
  scopes: string[];
  /** Droits requis par les lectures de l'assistant et dont la lecture est refusée. */
  missingScopes: string[];
  error: string | null;
  checkedAt: string;
};

export class HubSpotError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HubSpotError";
    this.status = status;
  }
}

export type HubSpotRecord = { id: string; properties: Record<string, string | null> };

export type HubSpotOwner = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type HubSpotPropertyOption = {
  value: string;
  label: string;
  displayOrder?: number;
  hidden?: boolean;
};

export type HubSpotProperty = {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  options: HubSpotPropertyOption[];
};

const CACHE_MS = 5 * 60_000;
let cache: { at: number; status: HubSpotStatus } | null = null;

const PROPERTIES: Record<HubSpotObject, string[]> = {
  companies: ["name", "domain", "city", "industry", "lifecyclestage"],
  contacts: ["firstname", "lastname", "email", "jobtitle", "company"],
deals: [
  "dealname",
  "amount",
  "dealstage",
  "closedate",
  "pipeline",
  "createdate",
  "hs_lastmodifieddate",
],
};

export function readToken(): string | null {
  const token = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  return token ? token : null;
}

export function isHubSpotConfigured(): boolean {
  return readToken() !== null;
}

function apiBase(): string {
  return (process.env.HUBSPOT_API_BASE || "https://api.hubapi.com").replace(/\/$/, "");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Appel brut : renvoie la réponse HTTP (sans lever d'erreur sur un statut HTTP), avec un seul retry sur 429. */
async function rawCall(path: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  const token = readToken();
  if (!token) throw new HubSpotError("HubSpot n'est pas connecté (HUBSPOT_ACCESS_TOKEN absent).", 0);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    throw new HubSpotError("HubSpot est injoignable pour le moment.", 0);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429 && attempt < 2) {
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 1500);
    return rawCall(path, init, attempt + 1);
  }
  return res;
}

function explain(status: number, what: string): HubSpotError {
  if (status === 401) return new HubSpotError("Jeton HubSpot invalide ou expiré.", status);
  if (status === 403) {
    return new HubSpotError(`HubSpot refuse la lecture de ${what} : ajoutez le droit de lecture correspondant à la clé de service.`, status);
  }
  if (status === 404) return new HubSpotError(`Objet HubSpot introuvable (${what}).`, status);
  if (status === 429) return new HubSpotError("Limite de requêtes HubSpot atteinte. Réessayez dans un instant.", status);
  return new HubSpotError(`Erreur HubSpot (${status}) sur ${what}.`, status);
}

/** Appel JSON : lève une HubSpotError explicite (français) si la réponse n'est pas 2xx. */
export async function hubspotRequest<T>(path: string, what: string, init: RequestInit = {}): Promise<T> {
  const res = await rawCall(path, init);
  if (!res.ok) throw explain(res.status, what);
  return (await res.json()) as T;
}

/** Sonde une lecture : renvoie le statut HTTP (0 si injoignable). */
async function probe(path: string): Promise<number> {
  try {
    const res = await rawCall(path);
    return res.status;
  } catch (error) {
    return error instanceof HubSpotError ? error.status : 0;
  }
}

export async function getHubSpotStatus(force = false): Promise<HubSpotStatus> {
  const checkedAt = new Date().toISOString();
  if (!readToken()) {
    return {
      configured: false,
      reachable: false,
      scopes: [],
      missingScopes: Object.values(HUBSPOT_SCOPES),
      error: null,
      checkedAt,
    };
  }
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.status;

  const entries = Object.entries(HUBSPOT_SCOPES) as Array<[HubSpotObject, string]>;
  const codes = await Promise.all(entries.map(([object]) => probe(`/crm/v3/objects/${object}?limit=1`)));

  let status: HubSpotStatus;
  if (codes.some((c) => c === 401)) {
    status = { configured: true, reachable: false, scopes: [], missingScopes: [], error: "Jeton HubSpot invalide ou expiré.", checkedAt };
  } else if (codes.every((c) => c === 0)) {
    status = { configured: true, reachable: false, scopes: [], missingScopes: [], error: "HubSpot est injoignable pour le moment.", checkedAt };
  } else {
    const granted: string[] = [];
    const missing: string[] = [];
    entries.forEach(([, scope], i) => (codes[i] >= 200 && codes[i] < 300 ? granted : missing).push(scope));
    status = { configured: true, reachable: true, scopes: granted, missingScopes: missing, error: null, checkedAt };
  }
  cache = { at: Date.now(), status };
  return status;
}

export type HubSpotSearchResult =
  | { ok: true; results: Array<{ id: string; properties: Record<string, string | null> }> }
  | { ok: false; message: string };

/** Recherche en lecture seule dans un type d'objet HubSpot (utilisée par l'assistant). */
export async function hubspotSearch(object: HubSpotObject, query: string, limit = 10): Promise<HubSpotSearchResult> {
  const status = await getHubSpotStatus();
  if (!status.configured) {
    return { ok: false, message: "HubSpot n'est pas connecté : aucune donnée HubSpot n'est consultée." };
  }
  if (!status.reachable) return { ok: false, message: status.error ?? "HubSpot est injoignable." };
  const required = HUBSPOT_SCOPES[object];
  if (!status.scopes.includes(required)) {
    return {
      ok: false,
      message: `Autorisation HubSpot manquante (${required}). Ajoutez ce droit à la clé de service pour lire ces données.`,
    };
  }
  try {
    const json = await hubspotRequest<{ results?: HubSpotRecord[] }>(`/crm/v3/objects/${object}/search`, object, {
      method: "POST",
      body: JSON.stringify({ query, limit: Math.min(Math.max(limit, 1), 50), properties: PROPERTIES[object] }),
    });
    return { ok: true, results: (json.results ?? []).map((r) => ({ id: r.id, properties: r.properties ?? {} })) };
  } catch (error) {
    return { ok: false, message: error instanceof HubSpotError ? error.message : "Erreur HubSpot." };
  }
}

/* ------------------------------------------------------------------ */
/* Lectures utilisées par la synchronisation de l'agenda               */
/* ------------------------------------------------------------------ */

export type SearchFilter = { propertyName: string; operator: string; value?: string };
export type SearchBody = { filterGroups: Array<{ filters: SearchFilter[] }>; properties: string[] };

/** Parcourt toutes les pages d'une recherche CRM (plafonnée à maxRecords). */
export async function searchAll(objectType: string, body: SearchBody, maxRecords = 1000): Promise<HubSpotRecord[]> {
  const out: HubSpotRecord[] = [];
  let after: string | undefined;
  for (let page = 0; page < 50 && out.length < maxRecords; page++) {
    const json = await hubspotRequest<{
      results?: HubSpotRecord[];
      paging?: { next?: { after?: string } };
    }>(`/crm/v3/objects/${encodeURIComponent(objectType)}/search`, objectType, {
      method: "POST",
      body: JSON.stringify({ ...body, limit: 100, ...(after ? { after } : {}) }),
    });
    for (const r of json.results ?? []) out.push({ id: r.id, properties: r.properties ?? {} });
    after = json.paging?.next?.after;
        if (!after) break;
    await sleep(250);
  }

  if (after && out.length >= maxRecords) {
    console.warn(
      `[HubSpot] Récupération potentiellement incomplète pour ${objectType} : limite de ${maxRecords} enregistrements atteinte.`,
    );
  }

  return out.slice(0, maxRecords);
}



export type HubSpotAssociation = {
  fromId: string;
  toId: string;
  associationTypes: Array<{
    category: string;
    typeId: number;
    label: string | null;
  }>;
};

/**
 * Lit les associations HubSpot entre deux types d'objets.
 */
export async function readHubSpotAssociations(
  fromObjectType: string,
  toObjectType: string,
  fromIds: string[],
): Promise<HubSpotAssociation[]> {
  const associations: HubSpotAssociation[] = [];
  const uniqueIds = [...new Set(fromIds)].filter(Boolean);

  for (let i = 0; i < uniqueIds.length; i += 1000) {
    const batch = uniqueIds.slice(i, i + 1000);

    const json = await hubspotRequest<{
      results?: Array<{
        from: { id: string };
        to?: Array<{
          toObjectId: string | number;
          associationTypes?: Array<{
            category: string;
            typeId: number;
            label?: string | null;
          }>;
        }>;
      }>;
    }>(
      `/crm/v4/associations/${encodeURIComponent(fromObjectType)}/${encodeURIComponent(toObjectType)}/batch/read`,
      `les associations ${fromObjectType} vers ${toObjectType}`,
      {
        method: "POST",
        body: JSON.stringify({
          inputs: batch.map((id) => ({ id })),
        }),
      },
    );

    for (const result of json.results ?? []) {
      for (const target of result.to ?? []) {
        associations.push({
          fromId: String(result.from.id),
          toId: String(target.toObjectId),
          associationTypes: (target.associationTypes ?? []).map((type) => ({
            category: type.category,
            typeId: type.typeId,
            label: type.label ?? null,
          })),
        });
      }
    }

    if (i + 1000 < uniqueIds.length) {
      await sleep(250);
    }
  }

  return associations;
}


/** Propriétaires HubSpot (utilisateurs du compte) — nécessite crm.objects.owners.read. */
export async function listOwners(): Promise<HubSpotOwner[]> {
  const out: HubSpotOwner[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const json = await hubspotRequest<{
      results?: Array<{ id: string; email?: string | null; firstName?: string | null; lastName?: string | null }>;
      paging?: { next?: { after?: string } };
    }>(`/crm/v3/owners?limit=100&archived=false${after ? `&after=${encodeURIComponent(after)}` : ""}`, "les propriétaires");
    for (const o of json.results ?? []) {
      out.push({ id: String(o.id), email: o.email ?? null, firstName: o.firstName ?? null, lastName: o.lastName ?? null });
    }
    after = json.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

/** Propriétés d'un type d'objet (pour retrouver les dates par leur libellé). */
/** Propriétés HubSpot, y compris les options utilisées pour les pipelines et étapes. */
export async function listProperties(objectType: string): Promise<HubSpotProperty[]> {
  const json = await hubspotRequest<{
    results?: Array<{
      name: string;
      label: string;
      type: string;
      fieldType: string;
      options?: Array<{
        value: string;
        label: string;
        displayOrder?: number;
        hidden?: boolean;
      }>;
    }>;
  }>(
    `/crm/v3/properties/${encodeURIComponent(objectType)}`,
    `les propriétés de ${objectType}`,
  );

  return (json.results ?? []).map((p) => ({
    name: p.name,
    label: p.label,
    type: p.type,
    fieldType: p.fieldType,
    options: (p.options ?? []).map((option) => ({
      value: option.value,
      label: option.label,
      ...(option.displayOrder !== undefined ? { displayOrder: option.displayOrder } : {}),
      ...(option.hidden !== undefined ? { hidden: option.hidden } : {}),
    })),
  }));
}

export type HubSpotPipelineStage = {
  id: string;
  label: string;
  archived?: boolean;
};

export type HubSpotPipeline = {
  id: string;
  label: string;
  archived?: boolean;
  stages?: HubSpotPipelineStage[];
};

export async function listDealPipelines(): Promise<HubSpotPipeline[]> {
  const json = await hubspotRequest<{
    results?: HubSpotPipeline[];
  }>("/crm/v3/pipelines/deals", "les pipelines commerciaux");

  return (json.results ?? [])
    .filter((pipeline) => !pipeline.archived)
    .map((pipeline) => ({
      ...pipeline,
      stages: (pipeline.stages ?? []).filter((stage) => !stage.archived),
    }));
}
export type HubSpotSchema = { objectTypeId: string; name: string; singular: string; plural: string };

/** Objets personnalisés du compte — nécessite le droit de lecture des schémas ; peut être refusé. */
export async function listSchemas(): Promise<HubSpotSchema[]> {
  const json = await hubspotRequest<{
    results?: Array<{ objectTypeId: string; name: string; labels?: { singular?: string; plural?: string } }>;
  }>("/crm/v3/schemas", "les objets personnalisés");
  return (json.results ?? []).map((s) => ({
    objectTypeId: s.objectTypeId,
    name: s.name,
    singular: s.labels?.singular ?? s.name,
    plural: s.labels?.plural ?? s.name,
  }));
}
