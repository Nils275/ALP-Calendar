# ALP Manager — Agenda connecté à HubSpot

Agenda commun de l'équipe ALP Racing (Next.js, Postgres, Drizzle) qui importe depuis HubSpot :

- **l'équipe** (propriétaires HubSpot → collaborateurs),
- **les tâches** et **les réunions**,
- **les dates de livraison, de fermeture et de création** des **transactions** et des **projets**.

La synchronisation est **entrante et en lecture seule** : rien n'est jamais modifié dans HubSpot. Les événements importés se modifient dans HubSpot et sont mis à jour à chaque synchro (sans doublon). Les événements créés dans ALP Manager ne sont jamais touchés.

## ⚠️ Avant toute mise en ligne

**Il n'y a pas encore d'authentification.** L'identité est un simple cookie, et sans cookie c'est le premier compte « direction » qui est utilisé : quiconque connaît l'adresse du site est administrateur et voit les données HubSpot importées. Ne déployez pas avec des données réelles sur une adresse publique avant d'avoir ajouté une vraie connexion (le seul point à modifier est `src/lib/auth/session.ts`).

## Installation en local

1. Installer Node.js (version LTS), puis `npm install`.
2. Copier `.env.example` en `.env` et remplir au minimum `DATABASE_URL` et `HUBSPOT_ACCESS_TOKEN`.
3. Créer les tables : `npm run db:migrate`.
4. Lancer : `npm run dev`, puis ouvrir http://localhost:3000.

## Brancher HubSpot

1. Dans HubSpot : **Paramètres → Intégrations → Clés de service** (ou Développement → Clés), créer une clé en **lecture seule** avec les droits : propriétaires, transactions, entreprises, contacts, **tâches**, **réunions** et **projets** (cherchez ces mots dans la barre de recherche des droits).
2. Mettre la clé dans `.env` (`HUBSPOT_ACCESS_TOKEN`). Ne la partagez jamais et ne la versionnez pas.
3. Renseigner `ALP_DIRECTION_EMAILS` avec votre e-mail HubSpot : ce compte aura le rôle « direction » et pourra lancer la synchro.
4. Ouvrir `/api/calendar/sync/discover` : cette page n'écrit rien et vérifie ce que HubSpot renvoie (équipe reconnue, propriétés « Date livraison », « Date de fermeture », « Date de création », objet Projets).
5. Dans l'agenda, ouvrir la fenêtre **Synchronisation HubSpot** et cliquer sur **Lancer la synchronisation**. Le résultat indique, source par source, ce qui a été importé ou ce qui manque (par exemple un droit à ajouter à la clé).

Les comptes de démonstration (`…@alp-manager.local`) sont désactivés dès que de vrais collaborateurs sont importés.

### Ce que vous pouvez régler

| Besoin | Où |
| --- | --- |
| Quelles dates apparaissent, leur catégorie et leur préfixe | `DATE_RULES` dans `src/lib/integrations/hubspot-mapping.ts` |
| Qui est importé comme équipe | `HUBSPOT_TEAM_FILTER` (noms séparés par des virgules, `*` pour tous) |
| Période importée | `HUBSPOT_SYNC_PAST_DAYS` / `HUBSPOT_SYNC_FUTURE_DAYS` (défaut 60 / 365) |
| Type d'objet des projets si non détecté | `HUBSPOT_PROJECT_OBJECT_TYPE` |

## Synchronisation automatique

La route `GET /api/cron/hubspot` lance la synchro ; elle exige l'en-tête `Authorization: Bearer <CRON_SECRET>` et reste fermée si `CRON_SECRET` fait moins de 16 caractères (`openssl rand -hex 32`).

Le fichier `.github/workflows/hubspot-sync.yml` l'appelle toutes les 15 minutes. Dans GitHub : **Settings → Secrets and variables → Actions**, ajouter `APP_URL` (adresse du site, sans `/` final) et `CRON_SECRET`.

## Publier sur GitHub puis déployer

```bash
git init
git add .
git commit -m "ALP Manager : agenda connecté à HubSpot"
# créer un dépôt PRIVÉ vide sur GitHub, puis :
git remote add origin https://github.com/<compte>/<depot>.git
git branch -M main
git push -u origin main
```

Vérifiez avant le premier `git add` que `git status` ne montre **aucun fichier `.env`**.

Déploiement conseillé : base **Neon** (Postgres hébergé) + hébergeur **Vercel** relié au dépôt. Dans Vercel, saisir les variables du `.env` (sauf celles dont vous n'avez pas besoin), puis lancer une fois `npm run db:migrate` avec la `DATABASE_URL` de production. Les fonctions de synchro demandent jusqu'à 60 s (`maxDuration`) : vérifiez que votre offre l'autorise.

## Limites connues

- Lecture seule : aucune écriture vers HubSpot.
- Jusqu'à 1 000 objets par source et par synchro ; au-delà, l'import est tronqué et le nettoyage des éléments supprimés est suspendu.
- Les événements importés qui ont disparu de HubSpot (ou dont la date est sortie de la période) sont supprimés à la synchro suivante.
- Les propriétés standard des tâches et des réunions (`hs_task_*`, `hs_meeting_*`) sont celles documentées par HubSpot ; elles n'ont pas pu être testées sur votre compte réel.
- L'objet « Projets » est détecté automatiquement (objets personnalisés, puis type standard) ; vérifiez le résultat dans `/api/calendar/sync/discover`.
- Les clés de service HubSpot étaient encore en bêta à l'écriture de ce code.
- 8 avertissements de lint (règle React `set-state-in-effect`) existaient déjà dans les composants d'origine ; ils ne bloquent pas la compilation.
