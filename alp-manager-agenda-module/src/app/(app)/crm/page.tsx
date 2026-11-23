"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Users,
  BriefcaseBusiness,
  Search,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  Globe,
  StickyNote,
  CalendarDays,
  Euro,
  LoaderCircle,
} from "lucide-react";

type Company = {
  id: string;
  name: string;
  domain: string | null;
  city: string | null;
  country: string | null;
  sector: string | null;
  notes: string | null;
  lastSyncedAt: string | null;
};

type Contact = {
  id: string;
  firstName: string | null;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  notes: string | null;
};

type Deal = {
  id: string;
  name: string;
  hubspotPipelineLabel: string | null;
  hubspotStageLabel: string | null;
  amountEur: number | null;
  hubspotCreatedAt: string | null;
  hubspotUpdatedAt: string | null;
  expectedCloseDate: string | null;
};

type CompanyDetail = {
  company: Company;
  contacts: Contact[];
  deals: Deal[];
  stats: {
    contacts: number;
    transactions: number;
  };
};

type ApiListResponse = {
  ok: boolean;
  error?: string;
  companies?: Company[];
  total?: number;
};

type ApiDetailResponse = {
  ok: boolean;
  error?: string;
  detail?: CompanyDetail;
};

const PAGE_SIZE = 50;

function formatDate(value: string | null | undefined) {
  if (!value) return "â€”";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatAmount(value: number | null) {
  if (value === null) return "â€”";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Building2;
}) {
  return (
    <div className="alp-glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-400">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {value.toLocaleString("fr-FR")}
          </p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-alp-green/10">
          <Icon className="h-5 w-5 text-alp-green" />
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <span className="text-xs text-zinc-500">
        {count} Ã©lÃ©ment(s)
      </span>
    </div>
  );
}

export default function CrmPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          q: query,
          limit: String(PAGE_SIZE),
          offset: String(page * PAGE_SIZE),
        });

        const response = await fetch(`/api/crm/clients?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        const data = (await response.json()) as ApiListResponse;

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Impossible de charger les entreprises.");
        }

        setCompanies(data.companies ?? []);
        setTotal(data.total ?? 0);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Erreur de chargement.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, page]);

  async function openCompany(companyId: string) {
    setSelectedCompanyId(companyId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);

    try {
      const response = await fetch(
        `/api/crm/clients?companyId=${encodeURIComponent(companyId)}`,
        { cache: "no-store" },
      );

      const data = (await response.json()) as ApiDetailResponse;

      if (!response.ok || !data.ok || !data.detail) {
        throw new Error(data.error || "Impossible de charger cette entreprise.");
      }

      setDetail(data.detail);
    } catch (err) {
      setDetailError(
        err instanceof Error ? err.message : "Erreur de chargement.",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function backToList() {
    setSelectedCompanyId(null);
    setDetail(null);
    setDetailError(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1680px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="alp-rise">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-alp-green"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au tableau de bord
        </Link>

        <section className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-alp-green alp-pulse-dot" />
              <span className="alp-label text-alp-green">
                Relation client
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Suivi clients
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Consultez les entreprises, leurs contacts et leur historique commercial.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <span className="h-2 w-2 rounded-full bg-alp-green" />
            <span className="text-xs text-zinc-300">
              DonnÃ©es synchronisÃ©es depuis HubSpot
            </span>
          </div>
        </section>

        {!selectedCompanyId ? (
          <>
            <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard
                label="Entreprises correspondant Ã  la recherche"
                value={total}
                icon={Building2}
              />
              <StatCard
                label="Entreprises affichÃ©es sur cette page"
                value={companies.length}
                icon={Users}
              />
            </section>

            <section className="alp-glass rounded-2xl p-5">
              <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Entreprises
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Recherche par nom, domaine ou ville
                  </p>
                </div>

                <div className="relative w-full sm:max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(0);
                    }}
                    placeholder="Rechercher une entreprise..."
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-alp-green/50"
                  />
                </div>
              </div>

              {error && (
                <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center gap-3 py-16 text-sm text-zinc-400">
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                  Chargement des entreprises...
                </div>
              ) : companies.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 px-5 py-12 text-center">
                  <Building2 className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
                  <p className="text-sm font-medium text-zinc-300">
                    Aucune entreprise trouvÃ©e
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Modifiez votre recherche ou vÃ©rifiez la synchronisation HubSpot.
                  </p>
                </div>
              ) : (
                <div className="alp-scroll overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-xs text-zinc-500">
                        <th className="px-3 py-3 font-medium">Entreprise</th>
                        <th className="px-3 py-3 font-medium">Domaine</th>
                        <th className="px-3 py-3 font-medium">Ville</th>
                        <th className="px-3 py-3 font-medium">Secteur</th>
                        <th className="px-3 py-3 text-right font-medium">Fiche</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companies.map((company) => (
                        <tr
                          key={company.id}
                          className="border-b border-white/[0.045] transition hover:bg-white/[0.025]"
                        >
                          <td className="px-3 py-4 font-medium text-zinc-100">
                            {company.name}
                          </td>
                          <td className="px-3 py-4 text-zinc-400">
                            {company.domain || "â€”"}
                          </td>
                          <td className="px-3 py-4 text-zinc-400">
                            {company.city || "â€”"}
                          </td>
                          <td className="px-3 py-4 text-zinc-400">
                            {company.sector || "â€”"}
                          </td>
                          <td className="px-3 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => openCompany(company.id)}
                              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 transition hover:border-alp-green/40 hover:text-alp-green"
                            >
                              Consulter
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
                <p className="text-xs text-zinc-500">
                  {total === 0
                    ? "Aucun rÃ©sultat"
                    : `${page * PAGE_SIZE + 1} Ã  ${Math.min(
                        (page + 1) * PAGE_SIZE,
                        total,
                      )} sur ${total} entreprise(s)`}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page === 0 || loading}
                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                    className="rounded-lg border border-white/10 p-2 text-zinc-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Page prÃ©cÃ©dente"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-20 text-center text-xs text-zinc-400">
                    Page {page + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page + 1 >= totalPages || loading}
                    onClick={() =>
                      setPage((current) => Math.min(totalPages - 1, current + 1))
                    }
                    className="rounded-lg border border-white/10 p-2 text-zinc-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Page suivante"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={backToList}
              className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-alp-green"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour aux entreprises
            </button>

            {detailLoading && (
              <div className="flex items-center justify-center gap-3 py-20 text-sm text-zinc-400">
                <LoaderCircle className="h-5 w-5 animate-spin" />
                Chargement de la fiche entreprise...
              </div>
            )}

            {detailError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                {detailError}
              </div>
            )}

            {detail && (
              <>
                <section className="alp-glass mb-6 rounded-2xl p-6">
                  <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                    <div>
                      <div className="mb-3 flex items-center gap-2 text-xs text-alp-green">
                        <Building2 className="h-4 w-4" />
                        FICHE ENTREPRISE
                      </div>
                      <h2 className="text-2xl font-semibold text-white">
                        {detail.company.name}
                      </h2>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-400">
                        {detail.company.domain && (
                          <span className="inline-flex items-center gap-2">
                            <Globe className="h-4 w-4" />
                            {detail.company.domain}
                          </span>
                        )}
                        {(detail.company.city || detail.company.country) && (
                          <span className="inline-flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {[detail.company.city, detail.company.country]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-xs text-zinc-400">
                      <p>DerniÃ¨re synchronisation</p>
                      <p className="mt-1 text-zinc-200">
                        {formatDate(detail.company.lastSyncedAt)}
                      </p>
                    </div>
                  </div>

                  {detail.company.sector && (
                    <p className="mt-5 text-sm text-zinc-400">
                      Secteur : {detail.company.sector}
                    </p>
                  )}

                  {detail.company.notes && (
                    <div className="mt-5 rounded-xl border border-alp-green/15 bg-alp-green/[0.04] p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-alp-green">
                        <StickyNote className="h-4 w-4" />
                        Notes internes ALP
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-zinc-300">
                        {detail.company.notes}
                      </p>
                    </div>
                  )}
                </section>

                <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <StatCard
                    label="Contacts associÃ©s"
                    value={detail.stats.contacts}
                    icon={Users}
                  />
                  <StatCard
                    label="Transactions dans l'historique"
                    value={detail.stats.transactions}
                    icon={BriefcaseBusiness}
                  />
                </section>

                <section className="alp-glass mb-6 rounded-2xl p-5">
                  <SectionTitle
                    title="Contacts"
                    count={detail.contacts.length}
                  />

                  {detail.contacts.length === 0 ? (
                    <p className="py-8 text-center text-sm text-zinc-500">
                      Aucun contact associÃ© Ã  cette entreprise.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {detail.contacts.map((contact) => (
                        <article
                          key={contact.id}
                          className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
                        >
                          <h3 className="font-medium text-white">
                            {[contact.firstName, contact.lastName]
                              .filter(Boolean)
                              .join(" ")}
                          </h3>
                          {contact.jobTitle && (
                            <p className="mt-1 text-xs text-zinc-500">
                              {contact.jobTitle}
                            </p>
                          )}
                          <div className="mt-3 space-y-2 text-sm text-zinc-400">
                            {contact.email && (
                              <p className="flex items-center gap-2 break-all">
                                <Mail className="h-4 w-4 shrink-0" />
                                {contact.email}
                              </p>
                            )}
                            {contact.phone && (
                              <p className="flex items-center gap-2">
                                <Phone className="h-4 w-4 shrink-0" />
                                {contact.phone}
                              </p>
                            )}
                          </div>
                          {contact.notes && (
                            <p className="mt-3 whitespace-pre-wrap border-t border-white/[0.06] pt-3 text-xs text-zinc-500">
                              Note interne : {contact.notes}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="alp-glass mb-8 rounded-2xl p-5">
                  <SectionTitle
                    title="Historique des transactions HubSpot"
                    count={detail.deals.length}
                  />

                  {detail.deals.length === 0 ? (
                    <p className="py-8 text-center text-sm text-zinc-500">
                      Aucune transaction associÃ©e Ã  cette entreprise.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {detail.deals.map((deal) => (
                        <article
                          key={deal.id}
                          className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
                        >
                          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                            <div className="min-w-0">
                              <h3 className="font-medium text-white">
                                {deal.name}
                              </h3>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {deal.hubspotPipelineLabel && (
                                  <span className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-xs text-zinc-300">
                                    {deal.hubspotPipelineLabel}
                                  </span>
                                )}
                                {deal.hubspotStageLabel && (
                                  <span className="rounded-lg bg-alp-green/10 px-2.5 py-1 text-xs text-alp-green">
                                    {deal.hubspotStageLabel}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 text-left lg:text-right">
                              <p className="inline-flex items-center gap-1 text-sm font-medium text-zinc-200">
                                <Euro className="h-4 w-4 text-zinc-500" />
                                {formatAmount(deal.amountEur)}
                              </p>
                              <p className="mt-1 text-xs text-zinc-500">
                                CrÃ©Ã©e le {formatDate(deal.hubspotCreatedAt)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.06] pt-3 text-xs text-zinc-500">
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="h-3.5 w-3.5" />
                              Mise Ã  jour : {formatDate(deal.hubspotUpdatedAt)}
                            </span>
                            {deal.expectedCloseDate && (
                              <span>
                                Date prÃ©visionnelle : {formatDate(deal.expectedCloseDate)}
                              </span>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
