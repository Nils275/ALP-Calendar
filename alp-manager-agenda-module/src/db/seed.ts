import { sql } from "drizzle-orm";

import { db } from "@/db";
import { calendarEvents, eventParticipants, eventReminders, users } from "@/db/schema";
import { addDaysKey, fromParisWallTime, parisDateKey, weekdayIndex } from "@/lib/time";

let seedPromise: Promise<void> | null = null;

export function ensureAgendaSeed(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
}

const COLLABORATORS = [
  {
    name: "Alexandre Leclerc",
    email: "alexandre@alpracing.fr",
    role: "admin",
    jobTitle: "Direction",
    initials: "AL",
    color: "#3ee07d",
  },
  {
    name: "Marion Perrin",
    email: "marion@alpracing.fr",
    role: "manager",
    jobTitle: "Responsable commerciale",
    initials: "MP",
    color: "#3b82f6",
  },
  {
    name: "Julien Vasseur",
    email: "julien@alpracing.fr",
    role: "collaborateur",
    jobTitle: "Technicien atelier",
    initials: "JV",
    color: "#f59e0b",
  },
  {
    name: "Sofia Benali",
    email: "sofia@alpracing.fr",
    role: "collaborateur",
    jobTitle: "Administration & ADV",
    initials: "SB",
    color: "#22d3ee",
  },
  {
    name: "Thomas Roussel",
    email: "thomas@alpracing.fr",
    role: "collaborateur",
    jobTitle: "Responsable projets",
    initials: "TR",
    color: "#a855f7",
  },
  {
    name: "Camille Noel",
    email: "camille@alpracing.fr",
    role: "lecture",
    jobTitle: "Marketing & communication",
    initials: "CN",
    color: "#94a3b8",
  },
];

type SeedTemplate = {
  offset: number;
  endOffset?: number;
  start: string;
  end: string;
  title: string;
  description: string;
  category: string;
  assignee: string; // email
  participants?: string[];
  priority?: string;
  status?: string;
  allDay?: boolean;
  location?: string;
  reminder?: number;
  visibility?: string;
  recurrenceRule?: string;
};

const TEMPLATES: SeedTemplate[] = [
  {
    offset: 0,
    start: "08:30",
    end: "08:50",
    title: "Point atelier du matin",
    description:
      "Revue rapide des interventions en cours, des pièces manquantes et des priorités de la journée.",
    category: "reunion_interne",
    assignee: "julien@alpracing.fr",
    participants: ["alexandre@alpracing.fr", "thomas@alpracing.fr"],
    priority: "normale",
    location: "Atelier ALP",
    reminder: 15,
  },
  {
    offset: 0,
    start: "10:00",
    end: "11:00",
    title: "Relance devis flotte Enduro — Team Moto Sud",
    description:
      "Devis ALP-DEV-2418 envoyé il y a 9 jours. Relance téléphonique puis mail récapitulatif.",
    category: "commercial",
    assignee: "marion@alpracing.fr",
    participants: ["alexandre@alpracing.fr"],
    priority: "haute",
    location: "Téléphone",
    reminder: 30,
  },
  {
    offset: 0,
    start: "14:00",
    end: "15:30",
    title: "Rendez-vous concessionnaire Grenoble",
    description:
      "Présentation de la gamme amortisseurs ALP Racing et mise en place du tarif revendeur 2026.",
    category: "rendez_vous",
    assignee: "marion@alpracing.fr",
    participants: ["alexandre@alpracing.fr"],
    priority: "normale",
    location: "Showroom Grenoble",
    reminder: 60,
  },
  {
    offset: 0,
    start: "16:00",
    end: "17:00",
    title: "Mise à jour stocks joints & ressorts",
    description:
      "Inventaire des références critiques avant la commande fournisseur de fin de semaine.",
    category: "administratif",
    assignee: "sofia@alpracing.fr",
    priority: "basse",
    reminder: 0,
  },
  {
    offset: -1,
    start: "09:00",
    end: "09:30",
    title: "Relance facture ALP-FAC-1193",
    description:
      "Facture échue de 12 jours. Relance envoyée à la comptabilité du client, attendre retour.",
    category: "commercial",
    assignee: "sofia@alpracing.fr",
    participants: ["marion@alpracing.fr"],
    priority: "urgente",
    location: "Bureau ALP",
    reminder: 15,
  },
  {
    offset: -2,
    start: "11:00",
    end: "12:00",
    title: "Réception commande ressorts Ø 8.5 mm",
    description:
      "Contrôle quantitatif et qualitatif à la réception, saisie du bon de livraison fournisseur.",
    category: "reception",
    assignee: "julien@alpracing.fr",
    priority: "normale",
    location: "Quai de réception",
    status: "termine",
    reminder: 0,
  },
  {
    offset: 1,
    start: "08:00",
    end: "12:00",
    title: "Révision amortisseurs — Showa CRF 450",
    description:
      "Révision complète, changement de l'huile, contrôle des clapets et réglage de base pilote.",
    category: "revision",
    assignee: "julien@alpracing.fr",
    participants: ["thomas@alpracing.fr"],
    priority: "haute",
    location: "Atelier ALP",
    reminder: 1440,
  },
  {
    offset: 1,
    endOffset: 4,
    start: "09:00",
    end: "18:00",
    title: "Mise en production kit ALP-X Enduro",
    description:
      "Industrialisation du kit : validation des plans, usinage des premières séries et contrôle qualité.",
    category: "projet",
    assignee: "thomas@alpracing.fr",
    participants: ["alexandre@alpracing.fr", "julien@alpracing.fr"],
    priority: "haute",
    location: "Bureau d'études",
    reminder: 1440,
  },
  {
    offset: 2,
    start: "09:00",
    end: "10:00",
    title: "Expédition commande Moto Shop Lyon",
    description:
      "Préparation des 4 colis, édition des étiquettes et remise au transporteur.",
    category: "livraison",
    assignee: "sofia@alpracing.fr",
    priority: "normale",
    location: "Quai d'expédition",
    reminder: 60,
  },
  {
    offset: 2,
    start: "15:00",
    end: "16:30",
    title: "Prospection circuits Espagne",
    description:
      "Qualification de 6 nouveaux prospects pour la gamme off-road, préparation des appels.",
    category: "commercial",
    assignee: "marion@alpracing.fr",
    priority: "normale",
    reminder: 30,
  },
  {
    offset: 3,
    start: "08:00",
    end: "12:00",
    title: "Montage fourche WP — Husqvarna TE 300",
    description:
      "Montage, mise au point hydraulique et essai statique avant restitution au client.",
    category: "atelier",
    assignee: "julien@alpracing.fr",
    priority: "normale",
    location: "Atelier ALP",
    reminder: 60,
  },
  {
    offset: 3,
    start: "17:00",
    end: "18:00",
    title: "Copilote visio — devis distributeur Italie",
    description:
      "Relecture des conditions commerciales et validation du volume de la première commande.",
    category: "rendez_vous",
    assignee: "alexandre@alpracing.fr",
    participants: ["marion@alpracing.fr", "sofia@alpracing.fr"],
    priority: "haute",
    location: "Google Meet",
    reminder: 30,
  },
  {
    offset: 4,
    start: "10:00",
    end: "10:45",
    title: "Réception palette cartouches hydrauliques",
    description:
      "Palette fournisseur AMT — contrôle visuel, comptage et rangement zone A.",
    category: "reception",
    assignee: "julien@alpracing.fr",
    priority: "normale",
    location: "Quai de réception",
    reminder: 15,
  },
  {
    offset: 5,
    start: "09:00",
    end: "12:00",
    title: "Visite concessionnaire Annecy",
    description:
      "Rendez-vous terrain : présentation de la nouvelle tarification et formation produit de l'équipe.",
    category: "rendez_vous",
    assignee: "marion@alpracing.fr",
    priority: "normale",
    location: "Annecy",
    reminder: 1440,
  },
  {
    offset: 6,
    start: "09:00",
    end: "09:45",
    title: "Réunion hebdo équipe ALP",
    description:
      "Planning commercial, charge atelier, livraisons et points bloquants de la semaine.",
    category: "reunion_interne",
    assignee: "alexandre@alpracing.fr",
    participants: [
      "marion@alpracing.fr",
      "julien@alpracing.fr",
      "sofia@alpracing.fr",
      "thomas@alpracing.fr",
    ],
    priority: "normale",
    location: "Salle de réunion",
    reminder: 30,
    recurrenceRule: "FREQ=WEEKLY;BYDAY=MO;INTERVAL=1",
  },
  {
    offset: 8,
    start: "12:00",
    end: "12:30",
    title: "Échéance homologation cartouche ALP-R",
    description:
      "Dossier technique à transmettre au laboratoire pour validation de la série.",
    category: "projet",
    assignee: "thomas@alpracing.fr",
    priority: "haute",
    reminder: 1440,
  },
  {
    offset: 9,
    start: "14:00",
    end: "15:00",
    title: "Signature contrat distributeur Italie",
    description:
      "Envoi du contrat signé et validation des modalités logistiques avec le distributeur.",
    category: "administratif",
    assignee: "alexandre@alpracing.fr",
    participants: ["sofia@alpracing.fr"],
    priority: "haute",
    location: "Bureau direction",
    reminder: 1440,
  },
  {
    offset: 11,
    start: "09:00",
    end: "10:00",
    title: "Livraison kit suspension — team privée",
    description: "Remise du kit complet révisé, explication des réglages de base au pilote.",
    category: "livraison",
    assignee: "julien@alpracing.fr",
    priority: "basse",
    location: "Atelier ALP",
    reminder: 60,
  },
  {
    offset: 13,
    start: "08:00",
    end: "17:00",
    title: "Journée révision série amortisseurs",
    description:
      "Contrôle qualité systématique du lot de production et traçabilité des numéros de série.",
    category: "revision",
    assignee: "julien@alpracing.fr",
    participants: ["thomas@alpracing.fr"],
    priority: "normale",
    location: "Atelier ALP",
    reminder: 1440,
  },
  {
    offset: 15,
    start: "10:30",
    end: "11:30",
    title: "Salon Enduro — préparation du stand",
    description:
      "Validation du plan de stand, du matériel à expédier et du planning de présence.",
    category: "administratif",
    assignee: "camille@alpracing.fr",
    participants: ["alexandre@alpracing.fr", "marion@alpracing.fr"],
    priority: "normale",
    location: "Bureau ALP",
    reminder: 0,
  },
  {
    offset: -3,
    start: "13:30",
    end: "14:30",
    title: "Réunion fournisseur hydraulique",
    description:
      "Compte-rendu : nouveaux délais annoncés, ajustement du planning de production.",
    category: "reunion_interne",
    assignee: "thomas@alpracing.fr",
    participants: ["alexandre@alpracing.fr"],
    priority: "normale",
    status: "termine",
    reminder: 0,
  },
  {
    offset: -6,
    start: "00:00",
    end: "23:59",
    title: "Clôture comptable mois en cours",
    description:
      "Rapprochement bancaire, vérification des factures fournisseurs et export comptable.",
    category: "administratif",
    assignee: "sofia@alpracing.fr",
    priority: "normale",
    allDay: true,
    status: "termine",
    reminder: 0,
  },
];

async function runSeed(): Promise<void> {
  await db
    .insert(users)
    .values(COLLABORATORS)
    .onConflictDoNothing({ target: users.email });

  const existing = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(calendarEvents);
  if ((existing[0]?.count ?? 0) > 0) return;

  const allUsers = await db.select().from(users);
  const byEmail = new Map(allUsers.map((user) => [user.email, user]));
  const admin = byEmail.get("alexandre@alpracing.fr") ?? allUsers[0];
  if (!admin) return;

  const todayKey = parisDateKey(new Date());
  const mondayKey = addDaysKey(todayKey, -weekdayIndex(todayKey));

  for (const template of TEMPLATES) {
    const startKey = addDaysKey(todayKey, template.offset);
    const endKey = addDaysKey(todayKey, template.endOffset ?? template.offset);
    const isWeeklyMaster = template.recurrenceRule?.includes("WEEKLY");
    const masterStartKey = isWeeklyMaster ? mondayKey : startKey;
    const masterEndKey = isWeeklyMaster
      ? addDaysKey(mondayKey, (template.endOffset ?? template.offset) - template.offset)
      : endKey;

    const startAt = fromParisWallTime(masterStartKey, toMinutes(template.start));
    const endAt = fromParisWallTime(masterEndKey, toMinutes(template.end));
    if (endAt <= startAt) {
      endAt.setTime(startAt.getTime() + 60 * 60 * 1000);
    }

    const assignee = byEmail.get(template.assignee) ?? admin;
    const participantUsers = (template.participants ?? [])
      .map((email) => byEmail.get(email))
      .filter((user): user is NonNullable<typeof user> => Boolean(user));

    const [created] = await db
      .insert(calendarEvents)
      .values({
        title: template.title,
        description: template.description,
        category: template.category,
        startAt,
        endAt,
        allDay: template.allDay ?? false,
        location: template.location ?? null,
        assignedTo: assignee.id,
        createdBy: admin.id,
        priority: template.priority ?? "normale",
        status: template.status ?? "a_venir",
        visibility: template.visibility ?? "partage",
        reminder: template.reminder ?? 0,
        recurrenceRule: template.recurrenceRule ?? null,
        source: "local",
        syncStatus: "local",
        syncDirection: "outbound",
      })
      .returning();

    if (!created) continue;

    const participantIds = new Set(participantUsers.map((user) => user.id));
    participantIds.delete(assignee.id);
    if (participantIds.size > 0) {
      await db
        .insert(eventParticipants)
        .values(
          [...participantIds].map((userId) => ({
            eventId: created.id,
            userId,
          })),
        )
        .onConflictDoNothing();
    }

    const reminderMinutes = template.reminder ?? 0;
    if (reminderMinutes > 0) {
      await db.insert(eventReminders).values({
        eventId: created.id,
        userId: assignee.id,
        minutesBefore: reminderMinutes,
        scheduledFor: new Date(startAt.getTime() - reminderMinutes * 60_000),
        status: template.status === "termine" ? "cancelled" : "pending",
      });
    }
  }
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
