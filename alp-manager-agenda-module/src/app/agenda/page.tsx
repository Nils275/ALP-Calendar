import type { Metadata } from "next";

import { AgendaWorkspace } from "@/components/agenda/AgendaWorkspace";
import { AppShell } from "@/components/shell/AppShell";
import { getCurrentUser, listCollaborators } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agenda commun — ALP Manager",
  description:
    "Calendrier commun de l'équipe ALP Racing Suspension : commercial, atelier, livraisons et révisions.",
};

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ collaborateur?: string }>;
}) {
  const [user, collaborators, params] = await Promise.all([
    getCurrentUser(),
    listCollaborators(),
    searchParams,
  ]);

  const parsedAssignee = params.collaborateur
    ? Number.parseInt(params.collaborateur, 10)
    : Number.NaN;
  const initialAssignee = collaborators.some(
    (collaborator) => collaborator.id === parsedAssignee,
  )
    ? String(parsedAssignee)
    : "all";

  const syncConfigured = Boolean(
    process.env.HUBSPOT_PRIVATE_APP_TOKEN || process.env.HUBSPOT_API_KEY,
  );

  return (
    <AppShell
      user={user}
      collaborators={collaborators}
      syncConfigured={syncConfigured}
    >
      <AgendaWorkspace
        currentUser={user}
        collaborators={collaborators}
        initialAssignee={initialAssignee}
      />
    </AppShell>
  );
}
