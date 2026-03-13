"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui";
import { clearSession, getAccessToken } from "@/lib/auth-session";

type AccountType = "personal" | "business";
type Plan = "free" | "starter" | "plus" | "business" | "enterprise" | null;

type QuotaInfo = {
  analysis_used: number;
  analysis_limit: number | null;
  analysis_remaining: number | null;
  esign_used: number;
  esign_limit: number | null;
  esign_remaining: number | null;
  chat_per_doc_limit: number;
  reset_at: string | null;
};

type MeResponse = {
  user_id: string;
  email: string;
  name: string;
  account_type: AccountType;
  plan: Plan;
  quota: QuotaInfo;
};

type QuotaResponse = {
  user_id: string;
  account_type: AccountType;
  plan: Plan;
  quota: QuotaInfo;
};

type StatCardProps = {
  title: string;
  value: string;
  detail: string;
};

type UsageRowProps = {
  title: string;
  used: number;
  limit: number | null;
  progress: number | null;
  progressClass: string;
  note: string;
};

function formatAccountType(value: AccountType) {
  return value === "business" ? "Bisnis" : "Personal";
}

function formatPlan(value: Plan) {
  if (value === null) return "Belum dipilih";
  const map = {
    free: "Free",
    starter: "Starter",
    plus: "Plus",
    business: "Business",
    enterprise: "Enterprise",
  };
  return map[value];
}

function formatResetDate(resetAt: string | null) {
  if (!resetAt) return "Belum tersedia";
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return resetAt;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatLimit(value: number | null) {
  if (value === null) return "Unlimited";
  return new Intl.NumberFormat("id-ID").format(value);
}

function calcProgress(used: number, limit: number | null) {
  if (limit === null || limit <= 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

function StatCard({ title, value, detail }: StatCardProps) {
  return (
    <article className="rounded-xl border border-border-light bg-white p-4 shadow-sm sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-gray">
        {title}
      </p>
      <p className="mt-2 text-2xl font-bold leading-none text-dark-navy">{value}</p>
      <p className="mt-2 text-xs text-neutral-gray">{detail}</p>
    </article>
  );
}

function UsageRow({ title, used, limit, progress, progressClass, note }: UsageRowProps) {
  return (
    <div className="rounded-xl border border-border-light bg-light-cream/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-dark-navy">{title}</p>
        <p className="text-sm text-neutral-gray">
          {used} / {formatLimit(limit)}
        </p>
      </div>

      {progress === null ? (
        <p className="mt-2 text-xs text-neutral-gray">{note}</p>
      ) : (
        <>
          <div className="mt-3 h-2 rounded-full bg-white">
            <div
              className={`h-2 rounded-full ${progressClass}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-neutral-gray">{progress}% terpakai</p>
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [quota, setQuota] = useState<QuotaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login/");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [meRes, quotaRes] = await Promise.all([
        fetch("/api/auth/me/", {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20000),
        }),
        fetch("/api/quota/", {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20000),
        }),
      ]);

      const meData = await meRes.json().catch(() => ({ detail: "Gagal memuat profil." }));
      const quotaData = await quotaRes.json().catch(() => ({ detail: "Gagal memuat kuota." }));

      if (meRes.status === 401 || quotaRes.status === 401) {
        clearSession();
        router.replace("/login/");
        return;
      }

      if (!meRes.ok) {
        throw new Error(meData.detail || "Gagal memuat profil.");
      }
      if (!quotaRes.ok) {
        throw new Error(quotaData.detail || "Gagal memuat kuota.");
      }

      setProfile(meData as MeResponse);
      setQuota(quotaData as QuotaResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat dashboard.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      const token = getAccessToken();
      if (token) {
        await fetch("/api/auth/logout/", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20000),
        });
      }
    } finally {
      clearSession();
      router.replace("/login/");
    }
  }

  const quotaInfo = quota?.quota ?? null;
  const analysisProgress = useMemo(
    () => calcProgress(quotaInfo?.analysis_used ?? 0, quotaInfo?.analysis_limit ?? null),
    [quotaInfo],
  );
  const esignProgress = useMemo(
    () => calcProgress(quotaInfo?.esign_used ?? 0, quotaInfo?.esign_limit ?? null),
    [quotaInfo],
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-light-cream px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-[1240px] animate-pulse space-y-4">
          <div className="h-14 rounded-xl bg-white" />
          <div className="h-40 rounded-2xl bg-dark-navy/20" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="h-24 rounded-xl bg-white" />
            <div className="h-24 rounded-xl bg-white" />
            <div className="h-24 rounded-xl bg-white" />
            <div className="h-24 rounded-xl bg-white" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-light-cream">
      <header className="border-b border-border-light bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-3">
          <Link href="/" className="flex-shrink-0">
            <img src="/logo.svg" alt="TanyaHukum" className="h-9 sm:h-10" />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button href="/cek-dokumen/" variant="secondary" size="sm">
              Cek Dokumen
            </Button>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-lg bg-dark-navy px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loggingOut ? "Memproses..." : "Keluar"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 sm:py-8">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p>{error}</p>
            <button
              type="button"
              onClick={loadData}
              className="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700"
            >
              Coba Lagi
            </button>
          </div>
        )}

        <section className="rounded-2xl bg-gradient-to-br from-dark-navy to-[#243246] p-5 text-white shadow-lg sm:p-7">
          <div className="grid gap-4 lg:grid-cols-3 lg:items-end">
            <div className="lg:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-text">
                Dashboard
              </p>
              <h1 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">
                Selamat datang, {profile?.name || "Pengguna"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-text sm:text-base">
                Ringkasan akun, kuota, dan aktivitas utama Anda dalam satu tampilan
                yang ringkas.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold">
                  Akun {profile ? formatAccountType(profile.account_type) : "-"}
                </span>
                <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold">
                  Paket {profile ? formatPlan(profile.plan) : "-"}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-white/20 bg-white/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-text">
                Reset Kuota
              </p>
              <p className="mt-2 text-sm font-semibold text-white">
                {formatResetDate(quotaInfo?.reset_at ?? null)}
              </p>
              <p className="mt-1 text-xs text-muted-text">
                Pastikan penggunaan kuota tetap sesuai kebutuhan tim Anda.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Analisis Tersisa"
            value={String(quotaInfo?.analysis_remaining ?? "Unlimited")}
            detail={`Terpakai ${quotaInfo?.analysis_used ?? 0}`}
          />
          <StatCard
            title="e-Sign Tersisa"
            value={String(quotaInfo?.esign_remaining ?? "Unlimited")}
            detail={`Terpakai ${quotaInfo?.esign_used ?? 0}`}
          />
          <StatCard
            title="Chat per Dokumen"
            value={String(quotaInfo?.chat_per_doc_limit ?? "-")}
            detail="Batas pesan AI untuk satu dokumen"
          />
          <StatCard
            title="Status Paket"
            value={profile ? formatPlan(profile.plan) : "-"}
            detail={profile ? formatAccountType(profile.account_type) : "-"}
          />
        </section>

        <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-border-light bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-bold text-dark-navy">Pemakaian Kuota</h2>
            <p className="mt-1 text-sm text-neutral-gray">
              Pantau penggunaan dan sisa kuota untuk periode berjalan.
            </p>

            <div className="mt-4 space-y-3">
              <UsageRow
                title="Analisis AI"
                used={quotaInfo?.analysis_used ?? 0}
                limit={quotaInfo?.analysis_limit ?? null}
                progress={analysisProgress}
                progressClass="bg-primary-orange"
                note="Paket ini memiliki analisis unlimited."
              />
              <UsageRow
                title="e-Sign"
                used={quotaInfo?.esign_used ?? 0}
                limit={quotaInfo?.esign_limit ?? null}
                progress={esignProgress}
                progressClass="bg-dark-navy"
                note="Paket ini memiliki e-sign unlimited."
              />
            </div>
          </article>

          <article className="rounded-2xl border border-border-light bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-dark-navy">Aksi Cepat</h2>
            <div className="mt-4 space-y-2">
              <Link
                href="/cek-dokumen/"
                className="block rounded-lg border border-border-light px-4 py-3 text-sm font-medium text-dark-navy transition-colors hover:border-primary-orange hover:text-primary-orange"
              >
                Mulai Analisis Dokumen
              </Link>
              <Link
                href="/bisnis/"
                className="block rounded-lg border border-border-light px-4 py-3 text-sm font-medium text-dark-navy transition-colors hover:border-primary-orange hover:text-primary-orange"
              >
                Lihat Paket Bisnis
              </Link>
              <Link
                href="/cek-dokumen/"
                className="block rounded-lg border border-border-light px-4 py-3 text-sm font-medium text-dark-navy transition-colors hover:border-primary-orange hover:text-primary-orange"
              >
                Buka Dokumen Terbaru
              </Link>
            </div>
          </article>
        </section>

        <section className="mt-4 rounded-2xl border border-border-light bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-dark-navy">Ringkasan Akun</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg bg-light-cream px-4 py-3">
              <p className="text-neutral-gray">Nama</p>
              <p className="mt-1 font-medium text-dark-navy">{profile?.name || "-"}</p>
            </div>
            <div className="rounded-lg bg-light-cream px-4 py-3">
              <p className="text-neutral-gray">Email</p>
              <p className="mt-1 break-all font-medium text-dark-navy">{profile?.email || "-"}</p>
            </div>
            <div className="rounded-lg bg-light-cream px-4 py-3">
              <p className="text-neutral-gray">Tipe Akun</p>
              <p className="mt-1 font-medium text-dark-navy">
                {profile ? formatAccountType(profile.account_type) : "-"}
              </p>
            </div>
            <div className="rounded-lg bg-light-cream px-4 py-3">
              <p className="text-neutral-gray">User ID</p>
              <p className="mt-1 break-all font-medium text-dark-navy">
                {profile?.user_id || "-"}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
