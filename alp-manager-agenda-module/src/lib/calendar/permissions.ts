/*
 * Règles d'accès de l'agenda, en fonction du rôle existant de l'utilisateur.
 *
 * - direction   : voit tous les événements, modifie tous les événements.
 * - responsable : voit les événements partagés + ceux qui le concernent ;
 *                 modifie les événements partagés + ceux qu'il a créés / qui lui sont assignés.
 * - collaborateur : voit les événements partagés + ceux qui le concernent ;
 *                 modifie uniquement ceux qu'il a créés ou qui lui sont assignés.
 *
 * Ces fonctions sont utilisées côté API. Le filtrage SQL (service.ts) reprend la même logique.
 */
import type { CalendarUser, EventVisibility } from "./types";

export type AccessSubject = {
  visibility: EventVisibility;
  createdById: string;
  assignedToId: string | null;
  participantIds: string[];
};

export function canViewEvent(user: CalendarUser, subject: AccessSubject): boolean {
  if (user.role === "direction") return true;
  if (subject.visibility === "shared") return true;
  return (
    subject.createdById === user.id ||
    subject.assignedToId === user.id ||
    subject.participantIds.includes(user.id)
  );
}

export function canEditEvent(user: CalendarUser, subject: AccessSubject): boolean {
  if (user.role === "direction") return true;
  if (subject.createdById === user.id || subject.assignedToId === user.id) return true;
  return user.role === "responsable" && subject.visibility === "shared";
}

/** Un événement « concerne » un collaborateur s'il en est l'auteur, le responsable ou un participant. */
export function concernsUser(
  userId: string,
  subject: { createdById: string | null; assignedToId: string | null; participantIds: string[] },
): boolean {
  return (
    subject.createdById === userId ||
    subject.assignedToId === userId ||
    subject.participantIds.includes(userId)
  );
}
