"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui";
import { clearSession, getAccessToken } from "@/lib/auth-session";

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
  account_type: "personal" | "business";
  plan: "free" | "starter" | "plus" | "business" | "enterprise";
  quota: QuotaInfo;
};

type QuotaResponse = {
  user_id: string;
  account_type: "personal" | "business";
  plan: "free" | "starter" | "plus" | "business" | "enterprise";
  quota: QuotaInfo;
};

function formatAccountType(value: "personal" | "business") {
  return value === "business" ? "Bisnis" : "Personal";
}

function formatPlan(value: "free" | "starter" | "plus" | "business" | "enterprise") {
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
  if (!resetAt) return "Tidak ada reset";
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return resetAt;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function calcProgress(used: number, limit: number | null) {
  if (limit === null || limit <= 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
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

  const analysisProgress = useMemo(
    () => calcProgress(quota?.quota.analysis_used ?? 0, quota?.quota.analysis_limit ?? null),
    [quota],
  );
  const esignProgress = useMemo(
    () => calcProgress(quota?.quota.esign_used ?? 0, quota?.quota.esign_limit ?? null),
    [quota],
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-light-cream px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-[1200px] rounded-2xl border border-border-light bg-white p-8 text-center">
          <p className="text-sm text-neutral-gray">Memuat dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-light-cream">
      <header className="border-b border-border-light bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3">
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

      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <section className="rounded-2xl border border-border-light bg-white p-5 sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-dark-navy sm:text-3xl">
                {profile?.name || "Dashboard"}
              </h1>
              <p className="mt-1 text-sm text-neutral-gray">
                Kelola akun, kuota, dan aktivitas dokumen Anda dari satu tempat.
              </p>
            </div>

            <div className="rounded-lg border border-border-light bg-light-cream px-4 py-3 text-sm text-dark-navy">
              <p>
                <span className="font-semibold">Akun:</span>{" "}
                {profile ? formatAccountType(profile.account_type) : "-"}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Paket:</span>{" "}
                {profile ? formatPlan(profile.plan) : "-"}
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
        </section>

        <section className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border-light bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-gray">
              Analisis Tersisa
            </p>
            <p className="mt-2 text-2xl font-bold text-dark-navy">
              {quota?.quota.analysis_remaining ?? "Unlimited"}
            </p>
          </div>

          <div className="rounded-xl border border-border-light bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-gray">
              e-Sign Tersisa
            </p>
            <p className="mt-2 text-2xl font-bold text-dark-navy">
              {quota?.quota.esign_remaining ?? "Unlimited"}
            </p>
          </div>

          <div className="rounded-xl border border-border-light bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-gray">
              Batas Chat per Dokumen
            </p>
            <p className="mt-2 text-2xl font-bold text-dark-navy">
              {quota?.quota.chat_per_doc_limit ?? "-"}
            </p>
          </div>

          <div className="rounded-xl border border-border-light bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-gray">
              Reset Kuota
            </p>
            <p className="mt-2 text-sm font-semibold text-dark-navy">
              {formatResetDate(quota?.quota.reset_at ?? null)}
            </p>
          </div>
        </section>

        <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-border-light bg-white p-5 lg:col-span-2">
            <h2 className="text-lg font-bold text-dark-navy">Penggunaan Kuota</h2>

            <div className="mt-4 space-y-5">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <p className="font-medium text-dark-navy">Analisis AI</p>
                  <p className="text-neutral-gray">
                    {quota?.quota.analysis_used ?? 0} /{" "}
                    {quota?.quota.analysis_limit ?? "Unlimited"}
                  </p>
                </div>
                {analysisProgress === null ? (
                  <p className="mt-2 text-xs text-neutral-gray">
                    Paket Anda memiliki kuota analisis unlimited.
                  </p>
                ) : (
                  <div className="mt-2 h-2 rounded-full bg-light-cream">
                    <div
                      className="h-2 rounded-full bg-primary-orange"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between text-sm">
                  <p className="font-medium text-dark-navy">e-Sign</p>
                  <p className="text-neutral-gray">
                    {quota?.quota.esign_used ?? 0} /{" "}
                    {quota?.quota.esign_limit ?? "Unlimited"}
                  </p>
                </div>
                {esignProgress === null ? (
                  <p className="mt-2 text-xs text-neutral-gray">
                    Paket Anda memiliki kuota e-sign unlimited.
                  </p>
                ) : (
                  <div className="mt-2 h-2 rounded-full bg-light-cream">
                    <div
                      className="h-2 rounded-full bg-dark-navy"
                      style={{ width: `${esignProgress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border-light bg-white p-5">
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
                href="/signup/"
                className="block rounded-lg border border-border-light px-4 py-3 text-sm font-medium text-dark-navy transition-colors hover:border-primary-orange hover:text-primary-orange"
              >
                Buat Akun Tambahan
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-border-light bg-white p-5">
          <h2 className="text-lg font-bold text-dark-navy">Ringkasan Akun</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-light-cream px-4 py-3">
              <p className="text-neutral-gray">Email</p>
              <p className="mt-1 font-medium text-dark-navy">{profile?.email || "-"}</p>
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
