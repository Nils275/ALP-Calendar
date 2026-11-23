import { CalendarApp } from "@/components/agenda/calendar-app";
import { getCurrentUser } from "@/lib/auth/session";
import { listActiveUsers } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Agenda · ALP Manager",
};

export default async function AgendaPage() {
  const [currentUser, users] = await Promise.all([getCurrentUser(), listActiveUsers()]);

  if (!currentUser) {
    return (
      <main className="grid min-h-[60vh] place-items-center px-6 text-center text-zinc-400">
        Aucun collaborateur disponible. Créez au moins un compte dans la table <code>users</code>.
      </main>
    );
  }

  return <CalendarApp key={currentUser.id} currentUser={currentUser} users={users} />;
}
