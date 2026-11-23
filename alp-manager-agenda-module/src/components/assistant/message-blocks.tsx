"use client";

import { AlertTriangle, Check, CheckCircle2, CircleX, Database, Info, Lightbulb, Loader, ShieldCheck, Undo2 } from "lucide-react";
import { useState } from "react";
import {
  ACTION_STATUS_LABEL,
  SOURCE_LABEL,
  type ActionSnapshot,
  type Block,
  type SourceKind,
} from "@/lib/assistant/types";
import { apiRequest, errorMessage } from "@/lib/calendar/client";

export function SourceBadge({ source }: { source: SourceKind }) {
  const Icon = source === "alp" ? ShieldCheck : source === "hubspot" ? Database : Lightbulb;
  const tone =
    source === "alp"
      ? "border-alp-green/30 bg-alp-green/10 text-alp-green"
      : source === "hubspot"
        ? "border-orange-400/30 bg-orange-400/10 text-orange-300"
        : "border-amber-300/30 bg-amber-300/10 text-amber-200";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${tone}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {SOURCE_LABEL[source]}
    </span>
  );
}

const STATUS_STYLE: Record<ActionSnapshot["status"], { border: string; chip: string }> = {
  pending: { border: "border-l-amber-400", chip: "border-amber-300/30 bg-amber-400/15 text-amber-200" },
  confirmed: { border: "border-l-sky-400", chip: "border-sky-300/30 bg-sky-400/15 text-sky-200" },
  executed: { border: "border-l-alp-green", chip: "border-alp-green/30 bg-alp-green/15 text-alp-green" },
  failed: { border: "border-l-red-500", chip: "border-red-400/30 bg-red-500/15 text-red-200" },
  cancelled: { border: "border-l-zinc-500", chip: "border-white/10 bg-white/5 text-zinc-300" },
  expired: { border: "border-l-zinc-600", chip: "border-white/10 bg-white/5 text-zinc-400" },
};

function StatusIcon({ status }: { status: ActionSnapshot["status"] }) {
  const cls = "h-3.5 w-3.5";
  if (status === "pending") return <Info className={cls} aria-hidden />;
  if (status === "confirmed") return <Loader className={`${cls} animate-spin`} aria-hidden />;
  if (status === "executed") return <CheckCircle2 className={cls} aria-hidden />;
  if (status === "failed") return <CircleX className={cls} aria-hidden />;
  if (status === "cancelled") return <Undo2 className={cls} aria-hidden />;
  return <AlertTriangle className={cls} aria-hidden />;
}

/** Carte d'action : état visible, récapitulatif, avertissements, confirmation ou annulation explicites. */
export function ActionCard({ action, onChange }: { action: ActionSnapshot; onChange?: (next: ActionSnapshot) => void }) {
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const style = STATUS_STYLE[action.status];
  const isDelete = action.kind === "event.delete";

  async function run(kind: "confirm" | "cancel") {
    setBusy(kind);
    setError(null);
    try {
      const res = await apiRequest<{ action: ActionSnapshot }>(`/api/assistant/actions/${action.id}/${kind}`, { method: "POST" });
      onChange?.(res.action);
      if (res.action.status === "failed") setError(res.action.error ?? "Erreur inconnue.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <article
      aria-label={`Action : ${action.title}`}
      className={`alp-rise overflow-hidden rounded-2xl border border-l-4 border-white/[0.08] bg-white/[0.035] ${style.border}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-3.5">
        <div className="min-w-0">
          <p className="alp-label">Action proposée</p>
          <p className="mt-0.5 text-sm font-semibold text-white">{action.title}</p>
          <p className="text-[12px] text-zinc-400">{action.preview.summary}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${style.chip}`}>
          <StatusIcon status={action.status} />
          {ACTION_STATUS_LABEL[action.status]}
        </span>
      </header>

      {action.preview.fields.length > 0 && (
        <dl className="mt-3 grid gap-x-4 gap-y-2 px-4 text-[12px] sm:grid-cols-2">
          {action.preview.fields.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-zinc-500">{f.label}</dt>
              <dd className="break-words whitespace-pre-line text-zinc-200">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {action.preview.warnings.length > 0 && action.status === "pending" && (
        <ul className="mx-4 mt-3 space-y-1 rounded-xl bg-amber-400/10 px-3 py-2 text-[12px] text-amber-100">
          {action.preview.warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      {action.status === "executed" && (
        <p className="mx-4 mt-3 flex items-start gap-2 text-[12px] text-alp-green">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {action.result ?? "Action exécutée."}
        </p>
      )}
      {action.status === "failed" && (
        <p className="mx-4 mt-3 text-[12px] text-red-300">
          Échec : {action.error ?? "erreur inconnue"}. Aucune modification n&apos;a été confirmée.
        </p>
      )}
      {action.status === "confirmed" && <p className="mx-4 mt-3 text-[12px] text-sky-200">Exécution en cours…</p>}
      {action.status === "cancelled" && <p className="mx-4 mt-3 text-[12px] text-zinc-400">Action annulée. Aucune modification.</p>}
      {action.status === "expired" && (
        <p className="mx-4 mt-3 text-[12px] text-zinc-400">Proposition expirée. Demandez-la à nouveau si nécessaire.</p>
      )}
      {error && <p className="mx-4 mt-2 text-[12px] text-red-300">{error}</p>}

      {action.status === "pending" && (
        <footer className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-4 py-3">
          <p className="mr-auto text-[11px] text-zinc-500">Rien n&apos;est modifié tant que vous n&apos;avez pas confirmé.</p>
          <button type="button" className="alp-btn h-9 px-3 text-xs" disabled={busy !== null} onClick={() => run("cancel")}>
            {busy === "cancel" ? <Loader className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Undo2 className="h-3.5 w-3.5" aria-hidden />}
            Annuler
          </button>
          <button
            type="button"
            className={`alp-btn h-9 px-3 text-xs ${isDelete ? "alp-btn-danger" : "alp-btn-primary"}`}
            disabled={busy !== null}
            onClick={() => run("confirm")}
          >
            {busy === "confirm" ? <Loader className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
            {isDelete ? "Confirmer la suppression" : "Confirmer"}
          </button>
        </footer>
      )}
    </article>
  );
}

function TableBlock({ block }: { block: Extract<Block, { type: "table" }> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/25">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <p className="min-w-0 truncate text-[12px] font-semibold text-zinc-200">{block.title}</p>
        <SourceBadge source={block.source} />
      </div>
      <div className="alp-scroll overflow-x-auto">
        <table className="w-full min-w-[300px] text-left text-[12px]">
          <thead>
            <tr>
              {block.columns.map((c) => (
                <th key={c} className="whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i} className="border-t border-white/[0.05] transition-colors hover:bg-white/[0.03]">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 align-top text-zinc-300">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.more ? <p className="border-t border-white/[0.05] px-3 py-1.5 text-[11px] text-zinc-500">+ {block.more} autre(s) ligne(s)</p> : null}
    </div>
  );
}

function ListBlock({ block }: { block: Extract<Block, { type: "list" }> }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[12px] font-semibold text-zinc-200">{block.title}</p>
        <SourceBadge source={block.source} />
      </div>
      <ul className="space-y-2">
        {block.items.map((item, j) => (
          <li key={j} className="flex items-start gap-2.5 text-[12.5px]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-alp-green/70" aria-hidden />
            <span className="min-w-0 text-zinc-200">
              {item.text}
              {item.meta && <span className="block text-[11px] text-zinc-500">{item.meta}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KvBlock({ block }: { block: Extract<Block, { type: "kv" }> }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[12px] font-semibold text-zinc-200">{block.title}</p>
        <SourceBadge source={block.source} />
      </div>
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {block.items.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-[11px] text-zinc-500">{item.label}</dt>
            <dd className="break-words text-[13px] text-zinc-100">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AlertBlock({ block }: { block: Extract<Block, { type: "alert" }> }) {
  const tone =
    block.tone === "warning"
      ? { cls: "border-amber-300/25 bg-amber-400/10 text-amber-100", Icon: AlertTriangle }
      : block.tone === "success"
        ? { cls: "border-alp-green/25 bg-alp-green/10 text-alp-green", Icon: CheckCircle2 }
        : { cls: "border-sky-300/20 bg-sky-400/10 text-sky-100", Icon: Info };
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[12.5px] ${tone.cls}`} role="status">
      <tone.Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{block.text}</span>
    </div>
  );
}

/** Rendu de l'ensemble des blocs d'une réponse, dans l'ordre reçu. */
export function MessageBlocks({
  blocks,
  onSuggest,
  onActionChange,
}: {
  blocks: Block[];
  onSuggest?: (text: string) => void;
  onActionChange?: (next: ActionSnapshot) => void;
}) {
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "table":
            return <TableBlock key={i} block={block} />;
          case "list":
            return <ListBlock key={i} block={block} />;
          case "kv":
            return <KvBlock key={i} block={block} />;
          case "alert":
            return <AlertBlock key={i} block={block} />;
          case "action":
            return <ActionCard key={`${block.action.id}-${block.action.status}`} action={block.action} onChange={onActionChange} />;
          case "suggestions":
            return (
              <div key={i} className="flex flex-wrap gap-2">
                {block.items.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSuggest?.(s)}
                    className="rounded-full border border-alp-green/25 bg-alp-green/5 px-3 py-1.5 text-left text-[12px] text-zinc-200 transition hover:border-alp-green/50 hover:bg-alp-green/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            );
        }
      })}
    </div>
  );
}
