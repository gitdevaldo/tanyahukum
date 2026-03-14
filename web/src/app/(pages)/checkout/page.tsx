"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { clearSession, getValidAccessToken } from "@/lib/auth-session";

type AccountType = "personal" | "business";
type TargetPlan = "starter" | "plus" | "business";
type CheckoutSource = "landing" | "bisnis" | "dashboard" | "checkout";
type UserPlan = "free" | "starter" | "plus" | "business" | "enterprise" | null;
type AuthState = "checking" | "guest" | "authenticated";
type PaymentState = "pending" | "paid" | "failed" | "expired" | "cancelled";

type PlanOption = {
  accountType: AccountType;
  targetPlan: TargetPlan;
  label: string;
  price: string;
  description: string;
};

type AuthMeResponse = {
  user_id: string;
  email: string;
  name: string;
  phone: string | null;
  billing_email?: string | null;
  billing_mobile?: string | null;
  account_type: AccountType;
  plan: UserPlan;
};

type PaymentCheckoutResponse = {
  payment_id: string;
  target_plan: TargetPlan;
  status: PaymentState;
  checkout_url: string;
};

type PaymentStatusResponse = {
  payment_id: string;
  account_type: AccountType;
  target_plan: TargetPlan;
  status: PaymentState;
  checkout_url: string | null;
};

const PLAN_OPTIONS: PlanOption[] = [
  {
    accountType: "personal",
    targetPlan: "starter",
    label: "Starter Personal",
    price: "Rp 29.000 / bulan",
    description: "Untuk pengguna personal dengan kuota analisis lebih besar.",
  },
  {
    accountType: "business",
    targetPlan: "plus",
    label: "Starter Bisnis",
    price: "Rp 499.000 / bulan",
    description: "Untuk tim kecil yang mulai mengelola kontrak secara digital.",
  },
  {
    accountType: "business",
    targetPlan: "business",
    label: "Bisnis",
    price: "Rp 1.500.000 / bulan",
    description: "Untuk perusahaan dengan volume dokumen dan analisis tinggi.",
  },
];

function normalizeAccountType(value: string | null): AccountType | null {
  if (value === "personal" || value === "business") return value;
  return null;
}

function normalizeTargetPlan(value: string | null): TargetPlan | null {
  if (value === "starter" || value === "plus" || value === "business") return value;
  return null;
}

function normalizeSource(value: string | null): CheckoutSource {
  if (value === "landing" || value === "bisnis" || value === "dashboard" || value === "checkout") {
    return value;
  }
  return "checkout";
}

function formatPlan(plan: UserPlan) {
  const map: Record<Exclude<UserPlan, null>, string> = {
    free: "Gratis",
    starter: "Starter",
    plus: "Plus",
    business: "Bisnis",
    enterprise: "Enterprise",
  };
  return plan ? map[plan] : "Belum dipilih";
}

function formatPaymentStatus(status: PaymentState | null) {
  if (!status) return "-";
  const map: Record<PaymentState, string> = {
    pending: "Menunggu pembayaran",
    paid: "Pembayaran berhasil",
    failed: "Pembayaran gagal",
    expired: "Pembayaran kedaluwarsa",
    cancelled: "Pembayaran dibatalkan",
  };
  return map[status];
}

function parseApiError(data: unknown, fallback: string) {
  if (typeof data === "object" && data !== null && "detail" in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

function resolvePlanOption(accountType: AccountType | null, targetPlan: TargetPlan | null) {
  if (!accountType || !targetPlan) return null;
  return PLAN_OPTIONS.find(
    (item) => item.accountType === accountType && item.targetPlan === targetPlan,
  ) || null;
}

function CheckoutPageInner() {
  const searchParams = useSearchParams();
  const selectedPlan = useMemo(() => {
    const accountType = normalizeAccountType(searchParams.get("account_type"));
    const targetPlan = normalizeTargetPlan(searchParams.get("target_plan"));
    if (!accountType || !targetPlan) return null;
    return PLAN_OPTIONS.find(
      (item) => item.accountType === accountType && item.targetPlan === targetPlan,
    ) || null;
  }, [searchParams]);
  const source = useMemo(() => normalizeSource(searchParams.get("source")), [searchParams]);
  const paymentRef = (searchParams.get("payment_ref") || "").trim() || null;

  const [authState, setAuthState] = useState<AuthState>("checking");
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthMeResponse | null>(null);
  const [billingEmail, setBillingEmail] = useState("");
  const [billingMobile, setBillingMobile] = useState("");
  const [statusData, setStatusData] = useState<PaymentStatusResponse | null>(null);
  const [resolvedPlan, setResolvedPlan] = useState<PlanOption | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const checkoutPathForAuth = useMemo(() => {
    const params = new URLSearchParams();
    const basePlan = selectedPlan || resolvedPlan;
    if (basePlan) {
      params.set("account_type", basePlan.accountType);
      params.set("target_plan", basePlan.targetPlan);
    }
    params.set("source", source);
    if (paymentRef) {
      params.set("payment_ref", paymentRef);
    }
    if (!basePlan && !paymentRef) return "/checkout/";
    return `/checkout/?${params.toString()}`;
  }, [paymentRef, resolvedPlan, selectedPlan, source]);

  const loginHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("next", checkoutPathForAuth);
    const basePlan = selectedPlan || resolvedPlan;
    if (basePlan) params.set("account_type", basePlan.accountType);
    return `/login/?${params.toString()}`;
  }, [checkoutPathForAuth, resolvedPlan, selectedPlan]);

  const signupHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("next", checkoutPathForAuth);
    const basePlan = selectedPlan || resolvedPlan;
    if (basePlan) params.set("account_type", basePlan.accountType);
    return `/signup/?${params.toString()}`;
  }, [checkoutPathForAuth, resolvedPlan, selectedPlan]);

  const loadPaymentStatus = useCallback(async (accessToken: string, paymentId: string) => {
    setLoadingStatus(true);
    try {
      const res = await fetch(`/api/payments/${encodeURIComponent(paymentId)}/`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json().catch(() => ({ detail: "Gagal mengambil status pembayaran." }));
      if (!res.ok) {
        throw new Error(parseApiError(data, "Gagal mengambil status pembayaran."));
      }
      const payment = data as PaymentStatusResponse;
      setStatusData(payment);
      const planFromStatus = resolvePlanOption(payment.account_type, payment.target_plan);
      if (planFromStatus) {
        setResolvedPlan(planFromStatus);
      }

      if (payment.status === "paid") {
        const meRes = await fetch("/api/auth/me/", {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(20000),
        });
        const meData = await meRes.json().catch(() => ({}));
        if (meRes.ok) {
          const me = meData as AuthMeResponse;
          setProfile(me);
          setBillingEmail(me.billing_email || me.email || "");
          setBillingMobile(me.billing_mobile || me.phone || "");
        }
      }
      return payment;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengambil status pembayaran.");
      return null;
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const validToken = await getValidAccessToken();
      if (!validToken) {
        if (!cancelled) setAuthState("guest");
        return;
      }

      if (cancelled) return;
      setToken(validToken);

      try {
        const res = await fetch("/api/auth/me/", {
          headers: { Authorization: `Bearer ${validToken}` },
          signal: AbortSignal.timeout(20000),
        });
        const data = await res.json().catch(() => ({ detail: "Gagal memuat profil akun." }));
        if (!res.ok) {
          if (res.status === 401) {
            clearSession();
            if (!cancelled) setAuthState("guest");
            return;
          }
          throw new Error(parseApiError(data, "Gagal memuat profil akun."));
        }

        if (cancelled) return;
        const me = data as AuthMeResponse;
        setProfile(me);
        setBillingEmail(me.billing_email || me.email || "");
        setBillingMobile(me.billing_mobile || me.phone || "");
        setAuthState("authenticated");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Gagal memuat profil akun.");
        setAuthState("guest");
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authState !== "authenticated" || !token || !paymentRef) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      const payment = await loadPaymentStatus(token, paymentRef);
      if (stopped || !payment) return;
      if (payment.status === "pending") {
        timer = setTimeout(poll, 5000);
      }
    };

    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [authState, loadPaymentStatus, paymentRef, token]);

  async function handleCreateCheckout(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting || !selectedPlan || !token || authState !== "authenticated") return;

    setError(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/payments/checkout/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          target_plan: selectedPlan.targetPlan,
          billing_email: billingEmail.trim().toLowerCase(),
          billing_mobile: billingMobile.trim() || null,
          source,
        }),
        signal: AbortSignal.timeout(25000),
      });
      const data = await res.json().catch(() => ({ detail: "Gagal membuat link pembayaran." }));
      if (!res.ok) {
        throw new Error(parseApiError(data, "Gagal membuat link pembayaran."));
      }

      const checkout = data as PaymentCheckoutResponse;
      if (!checkout.checkout_url) {
        throw new Error("Link pembayaran tidak ditemukan.");
      }

      setNotice("Mengalihkan ke halaman pembayaran...");
      window.location.assign(checkout.checkout_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat link pembayaran.");
      setIsSubmitting(false);
    }
  }

  if (!selectedPlan && !paymentRef) {
    return (
      <main className="min-h-screen bg-light-cream px-4 py-10 sm:px-6">
        <section className="mx-auto max-w-3xl rounded-2xl border border-border-light bg-white p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-dark-navy">Paket tidak valid</h1>
          <p className="mt-2 text-sm text-neutral-gray">
            Silakan pilih paket dari halaman harga personal atau bisnis terlebih dahulu.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/#pricing" className="rounded-lg bg-primary-orange px-4 py-2 text-sm font-semibold text-white">
              Kembali ke Harga Personal
            </Link>
            <Link href="/bisnis/#pricing" className="rounded-lg border border-border-light px-4 py-2 text-sm font-semibold text-dark-navy">
              Kembali ke Harga Bisnis
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const planForDisplay = selectedPlan || resolvedPlan;
  const accountMismatch = Boolean(
    selectedPlan
    && authState === "authenticated"
    && profile !== null
    && profile.account_type !== selectedPlan.accountType,
  );
  const alreadyOnPlan = Boolean(
    selectedPlan
    && authState === "authenticated"
    && profile !== null
    && profile.plan === selectedPlan.targetPlan,
  );
  const paymentIsPaid = statusData?.status === "paid";

  return (
    <main className="min-h-screen bg-light-cream px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-3xl rounded-2xl border border-border-light bg-white p-6 sm:p-8">
        <Link href="/" className="inline-block">
          <img src="/logo.svg" alt="TanyaHukum" className="h-10" />
        </Link>

        <h1 className="mt-6 text-2xl font-bold text-dark-navy">Checkout Paket</h1>
        <p className="mt-2 text-sm text-neutral-gray">
          Pastikan data kontak benar sebelum lanjut ke pembayaran Mayar.
        </p>

        {planForDisplay ? (
          <div className="mt-6 rounded-xl border border-border-light bg-gray-50/60 p-4">
            <p className="text-sm font-semibold text-dark-navy">{planForDisplay.label}</p>
            <p className="mt-1 text-lg font-bold text-primary-orange">{planForDisplay.price}</p>
            <p className="mt-2 text-sm text-neutral-gray">{planForDisplay.description}</p>
          </div>
        ) : null}

        {authState === "checking" ? (
          <div className="mt-6 rounded-xl border border-border-light p-4 text-sm text-neutral-gray">
            Memverifikasi sesi akun...
          </div>
        ) : null}

        {authState === "guest" ? (
          <div className="mt-6 rounded-xl border border-border-light p-4">
            <p className="text-sm text-dark-navy">
              {paymentRef
                ? "Silakan masuk atau daftar untuk melihat status pembayaran Anda."
                : "Silakan masuk atau daftar dulu agar proses checkout bisa dilanjutkan tanpa mengulang pilihan paket."}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={loginHref} className="rounded-lg bg-primary-orange px-4 py-2 text-sm font-semibold text-white">
                Masuk untuk Lanjut Checkout
              </Link>
              <Link href={signupHref} className="rounded-lg border border-border-light px-4 py-2 text-sm font-semibold text-dark-navy">
                Daftar Akun dan Lanjut Checkout
              </Link>
            </div>
          </div>
        ) : null}

        {authState === "authenticated" && profile ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-border-light p-4">
              <p className="text-sm text-neutral-gray">Akun saat ini</p>
              <p className="mt-1 text-sm font-medium text-dark-navy">
                {profile.name} - {profile.email}
              </p>
              <p className="mt-1 text-sm text-neutral-gray">
                Tipe akun: {profile.account_type === "business" ? "Bisnis" : "Personal"} | Paket aktif: {formatPlan(profile.plan)}
              </p>
            </div>

            {paymentRef ? (
              <div className="rounded-xl border border-border-light p-4">
                <p className="text-sm font-semibold text-dark-navy">Status Pembayaran</p>
                <p className="mt-1 text-sm text-neutral-gray">
                  {loadingStatus ? "Memuat status..." : formatPaymentStatus(statusData?.status || null)}
                </p>
                {statusData?.status === "pending" && statusData.checkout_url ? (
                  <a
                    href={statusData.checkout_url}
                    className="mt-3 inline-block rounded-lg border border-border-light px-4 py-2 text-sm font-semibold text-dark-navy"
                  >
                    Lanjutkan Pembayaran
                  </a>
                ) : null}
                {paymentIsPaid ? (
                  <Link
                    href="/dashboard/"
                    className="mt-3 inline-block rounded-lg bg-primary-orange px-4 py-2 text-sm font-semibold text-white"
                  >
                    Kembali ke Dashboard
                  </Link>
                ) : null}
              </div>
            ) : null}

            {!paymentRef && !paymentIsPaid ? (
              <form onSubmit={handleCreateCheckout} className="space-y-4 rounded-xl border border-border-light p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-gray">Kontak Pembayaran</h2>
                <div>
                  <label htmlFor="billingEmail" className="mb-1 block text-sm font-medium text-dark-navy">
                    Email
                  </label>
                  <input
                    id="billingEmail"
                    type="email"
                    required
                    value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                    className="w-full rounded-lg border border-border-light px-4 py-3 text-sm text-dark-navy outline-none transition-colors focus:border-primary-orange"
                  />
                </div>
                <div>
                  <label htmlFor="billingMobile" className="mb-1 block text-sm font-medium text-dark-navy">
                    No. HP
                  </label>
                  <input
                    id="billingMobile"
                    required
                    minLength={8}
                    maxLength={32}
                    value={billingMobile}
                    onChange={(e) => setBillingMobile(e.target.value)}
                    className="w-full rounded-lg border border-border-light px-4 py-3 text-sm text-dark-navy outline-none transition-colors focus:border-primary-orange"
                    placeholder="08xxxxxxxxxx"
                  />
                </div>

                {accountMismatch && selectedPlan ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Paket ini untuk akun {selectedPlan.accountType === "business" ? "bisnis" : "personal"}, sementara akun Anda saat ini {profile.account_type === "business" ? "bisnis" : "personal"}.
                  </p>
                ) : null}
                {alreadyOnPlan ? (
                  <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    Paket ini sudah aktif pada akun Anda.
                  </p>
                ) : null}
                {error ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </p>
                ) : null}
                {notice ? (
                  <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    {notice}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={isSubmitting || accountMismatch || alreadyOnPlan}
                  className="w-full rounded-lg bg-primary-orange px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Mengarahkan ke pembayaran..." : "Lanjut ke Pembayaran"}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={(
        <main className="min-h-screen bg-light-cream px-4 py-10 sm:px-6">
          <section className="mx-auto max-w-3xl rounded-2xl border border-border-light bg-white p-6 text-sm text-neutral-gray">
            Memuat checkout...
          </section>
        </main>
      )}
    >
      <CheckoutPageInner />
    </Suspense>
  );
}
