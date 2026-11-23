import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const currentUser = await getCurrentUser();

  if (currentUser) {
    redirect("/");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-alp-ink px-4 py-12">
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-alp-green/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-emerald-900/20 blur-[120px]" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-alp-green text-xl font-black tracking-tight text-alp-ink shadow-[0_12px_36px_rgba(61,220,132,0.25)]">
            ALP
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-alp-green">
            Racing Suspension
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            ALP Manager
          </h1>

          <p className="mt-2 text-sm text-zinc-500">
            Votre espace de travail collaboratif
          </p>
        </div>

        <section className="rounded-2xl border border-white/[0.08] bg-alp-carbon/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="mb-7">
            <h2 className="text-lg font-semibold text-white">
              Connexion à votre espace
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Connectez-vous avec vos identifiants ALP.
            </p>
          </div>

          <LoginForm />

          <div className="mt-7 flex items-center justify-center gap-2 border-t border-white/[0.06] pt-5 text-xs text-zinc-500">
            <ShieldCheck className="h-4 w-4 text-alp-green" />
            Connexion sécurisée · Accès réservé aux collaborateurs
          </div>
        </section>

        <p className="mt-6 text-center text-xs text-zinc-600">
          ALP Racing Suspension · Application interne
        </p>
      </div>
    </main>
  );
}
