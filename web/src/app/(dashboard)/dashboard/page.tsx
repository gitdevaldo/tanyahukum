"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { clearSession, getAccessToken } from "@/lib/auth-session";
import styles from "./dashboard.module.css";

type AccountType = "personal" | "business";
type Plan = "free" | "starter" | "plus" | "business" | "enterprise" | null;
type DashboardSection = "overview" | "documents" | "account";
type DocumentStatus =
  | "draft"
  | "analyzed"
  | "pending_signatures"
  | "partially_signed"
  | "completed"
  | "expired"
  | "rejected";

const SIDEBAR_STORAGE_KEY = "th_dashboard_sidebar_collapsed";

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

type DashboardDocumentItem = {
  document_id: string;
  filename: string;
  status: DocumentStatus;
  analysis_id: string | null;
  company_pays_analysis: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  owner_id: string;
  owner_email: string | null;
  is_owner: boolean;
  my_signer_role: "sender" | "recipient" | null;
  my_signer_status: "pending" | "signed" | "rejected" | null;
  signers_total: number;
  signers_pending: number;
  signers_signed: number;
  signers_rejected: number;
};

type DocumentListResponse = {
  total: number;
  owned_total: number;
  pending_my_action: number;
  documents: DashboardDocumentItem[];
};

type DocumentSigner = {
  email: string;
  name: string | null;
  role: "sender" | "recipient";
  status: "pending" | "signed" | "rejected";
  signed_at: string | null;
  rejection_reason: string | null;
};

type DocumentSignersResponse = {
  document_id: string;
  status: DocumentStatus;
  company_pays_analysis: boolean;
  expires_at: string | null;
  signers: DocumentSigner[];
};

type DocumentEvent = {
  id: string;
  event_type: string;
  actor_email: string | null;
  request_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type DocumentEventsResponse = {
  document_id: string;
  events: DocumentEvent[];
};

type SignatureRecord = {
  signer_email: string;
  signer_name: string;
  document_hash: string;
  signed_at: string;
};

type CertificateResponse = {
  document_id: string;
  filename: string;
  status: DocumentStatus;
  completed_at: string | null;
  certificate_pdf_url: string | null;
  signed_pdf_url: string | null;
  signatures: SignatureRecord[];
};

type ShareDocumentResponse = {
  document_id: string;
  status: DocumentStatus;
  signers_count: number;
  message: string;
};

type DocumentActionResponse = {
  success: boolean;
  document_id: string;
  status: DocumentStatus;
  message: string;
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

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatLimit(value: number | null) {
  if (value === null) return "Unlimited";
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function calcProgress(used: number, limit: number | null) {
  if (limit === null || limit <= 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

function formatStatus(status: DocumentStatus) {
  const map: Record<DocumentStatus, string> = {
    draft: "Draft",
    analyzed: "Sudah dianalisis",
    pending_signatures: "Menunggu tanda tangan",
    partially_signed: "Sebagian sudah tanda tangan",
    completed: "Selesai",
    expired: "Kedaluwarsa",
    rejected: "Ditolak",
  };
  return map[status];
}

function statusBadgeClass(status: DocumentStatus) {
  const map: Record<DocumentStatus, string> = {
    draft: "border-gray-200 bg-gray-50 text-gray-700",
    analyzed: "border-blue-200 bg-blue-50 text-blue-700",
    pending_signatures: "border-amber-200 bg-amber-50 text-amber-700",
    partially_signed: "border-indigo-200 bg-indigo-50 text-indigo-700",
    completed: "border-green-200 bg-green-50 text-green-700",
    expired: "border-gray-200 bg-gray-50 text-gray-600",
    rejected: "border-red-200 bg-red-50 text-red-700",
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

function parseFilenameFromDisposition(contentDisposition: string | null, fallback: string) {
  if (!contentDisposition) return fallback;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utf && utf[1]) {
    try {
      return decodeURIComponent(utf[1]);
    } catch {
      return fallback;
    }
  }
  const standard = /filename="?([^";]+)"?/i.exec(contentDisposition);
  if (standard && standard[1]) return standard[1];
  return fallback;
}

function formatShortDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTopbarDate() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

function toDisplayName(email: string | null, fallback = "System") {
  if (!email) return fallback;
  const local = email.split("@")[0] || fallback;
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toInitials(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "NA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function statusVariant(status: DocumentStatus) {
  if (status === "completed") return "signed";
  if (status === "pending_signatures" || status === "partially_signed") return "pending";
  if (status === "rejected") return "rejected";
  return "draft";
}

export default function DashboardPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<DashboardSection>("overview");
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [quota, setQuota] = useState<QuotaResponse | null>(null);
  const [documents, setDocuments] = useState<DashboardDocumentItem[]>([]);
  const [documentsMeta, setDocumentsMeta] = useState({
    total: 0,
    owned_total: 0,
    pending_my_action: 0,
  });
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedSigners, setSelectedSigners] = useState<DocumentSignersResponse | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<DocumentEventsResponse | null>(null);
  const [selectedCertificate, setSelectedCertificate] = useState<CertificateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingDocuments, setRefreshingDocuments] = useState(false);
  const [loadingDocumentDetails, setLoadingDocumentDetails] = useState(false);
  const [processingShare, setProcessingShare] = useState(false);
  const [processingSign, setProcessingSign] = useState(false);
  const [processingReject, setProcessingReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [shareForm, setShareForm] = useState({
    filename: "",
    analysisId: "",
    signerEmails: "",
    companyPaysAnalysis: false,
    expiresAt: "",
  });
  const [signForm, setSignForm] = useState({
    signerName: "",
    consentText: "Saya menyetujui penandatanganan elektronik dokumen ini.",
    documentHash: "",
  });
  const [rejectReason, setRejectReason] = useState("");

  const selectedDocument = useMemo(
    () => documents.find((doc) => doc.document_id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  );

  const signedCount = selectedDocument?.signers_signed ?? 0;
  const totalSignerCount = selectedDocument?.signers_total ?? 0;

  const requestWithAuth = useCallback(
    async (
      url: string,
      options?: {
        method?: "GET" | "POST";
        body?: string;
        headers?: Record<string, string>;
        timeoutMs?: number;
      },
    ) => {
      const token = getAccessToken();
      if (!token) {
        clearSession();
        router.replace("/login/");
        throw new Error("Sesi berakhir. Silakan login ulang.");
      }
      const res = await fetch(url, {
        method: options?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options?.headers || {}),
        },
        body: options?.body,
        signal: AbortSignal.timeout(options?.timeoutMs ?? 25000),
      });

      if (res.status === 401) {
        clearSession();
        router.replace("/login/");
        throw new Error("Sesi berakhir. Silakan login ulang.");
      }

      return res;
    },
    [router],
  );

  const requestJson = useCallback(
    async <T,>(
      url: string,
      options?: {
        method?: "GET" | "POST";
        body?: string;
        headers?: Record<string, string>;
        timeoutMs?: number;
        fallbackError?: string;
      },
    ) => {
      const res = await requestWithAuth(url, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(parseApiError(data, options?.fallbackError || "Permintaan gagal."));
      }
      return data as T;
    },
    [requestWithAuth],
  );

  const loadDocuments = useCallback(
    async (options?: { preferredDocumentId?: string | null; preserveSelection?: boolean }) => {
      setRefreshingDocuments(true);
      try {
        const payload = await requestJson<DocumentListResponse>("/api/documents/?limit=120", {
          fallbackError: "Gagal memuat daftar dokumen.",
        });
        setDocuments(payload.documents);
        setDocumentsMeta({
          total: payload.total,
          owned_total: payload.owned_total,
          pending_my_action: payload.pending_my_action,
        });
        setSelectedDocumentId((prev) => {
          const preferred = options?.preferredDocumentId;
          if (preferred && payload.documents.some((d) => d.document_id === preferred)) {
            return preferred;
          }
          if (options?.preserveSelection !== false && prev && payload.documents.some((d) => d.document_id === prev)) {
            return prev;
          }
          const pendingMine = payload.documents.find((doc) => doc.my_signer_status === "pending");
          if (pendingMine) return pendingMine.document_id;
          return payload.documents[0]?.document_id ?? null;
        });
      } finally {
        setRefreshingDocuments(false);
      }
    },
    [requestJson],
  );

  const loadDocumentDetails = useCallback(
    async (documentId: string, statusHint?: DocumentStatus) => {
      setLoadingDocumentDetails(true);
      setDetailError(null);
      try {
        const [signers, events] = await Promise.all([
          requestJson<DocumentSignersResponse>(`/api/documents/${documentId}/signers/`, {
            fallbackError: "Gagal memuat signer dokumen.",
          }),
          requestJson<DocumentEventsResponse>(`/api/documents/${documentId}/events/`, {
            fallbackError: "Gagal memuat audit trail dokumen.",
          }),
        ]);

        setSelectedSigners(signers);
        setSelectedEvents(events);

        const effectiveStatus = statusHint || signers.status;
        if (effectiveStatus === "completed") {
          try {
            const certificate = await requestJson<CertificateResponse>(`/api/documents/${documentId}/certificate/`, {
              fallbackError: "Gagal memuat sertifikat.",
            });
            setSelectedCertificate(certificate);
          } catch (certificateError) {
            setSelectedCertificate(null);
            setDetailError(certificateError instanceof Error ? certificateError.message : "Gagal memuat sertifikat.");
          }
        } else {
          setSelectedCertificate(null);
        }
      } catch (err) {
        setSelectedSigners(null);
        setSelectedEvents(null);
        setSelectedCertificate(null);
        setDetailError(err instanceof Error ? err.message : "Gagal memuat detail dokumen.");
      } finally {
        setLoadingDocumentDetails(false);
      }
    },
    [requestJson],
  );

  const loadData = useCallback(async () => {
    if (!getAccessToken()) {
      router.replace("/login/");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const [meData, quotaData, docsData] = await Promise.all([
        requestJson<MeResponse>("/api/auth/me/", {
          fallbackError: "Gagal memuat profil.",
        }),
        requestJson<QuotaResponse>("/api/quota/", {
          fallbackError: "Gagal memuat kuota.",
        }),
        requestJson<DocumentListResponse>("/api/documents/?limit=120", {
          fallbackError: "Gagal memuat daftar dokumen.",
        }),
      ]);

      setProfile(meData);
      setQuota(quotaData);
      setDocuments(docsData.documents);
      setDocumentsMeta({
        total: docsData.total,
        owned_total: docsData.owned_total,
        pending_my_action: docsData.pending_my_action,
      });
      setSignForm((prev) => ({
        ...prev,
        signerName: meData.name || prev.signerName,
      }));

      const pendingMine = docsData.documents.find((doc) => doc.my_signer_status === "pending");
      const defaultDocId = pendingMine?.document_id ?? docsData.documents[0]?.document_id ?? null;
      setSelectedDocumentId(defaultDocId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat dashboard.");
    } finally {
      setLoading(false);
    }
  }, [router, requestJson]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const persisted = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (persisted === "1") {
      setSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!selectedDocumentId) {
      setSelectedSigners(null);
      setSelectedEvents(null);
      setSelectedCertificate(null);
      return;
    }
    const selected = documents.find((doc) => doc.document_id === selectedDocumentId) ?? null;
    loadDocumentDetails(selectedDocumentId, selected?.status);
  }, [selectedDocumentId, documents, loadDocumentDetails]);

  const quotaInfo = quota?.quota ?? null;
  const analysisProgress = useMemo(
    () => calcProgress(quotaInfo?.analysis_used ?? 0, quotaInfo?.analysis_limit ?? null),
    [quotaInfo],
  );
  const esignProgress = useMemo(
    () => calcProgress(quotaInfo?.esign_used ?? 0, quotaInfo?.esign_limit ?? null),
    [quotaInfo],
  );

  async function handleDownloadPdf(path: string, fallbackFilename: string) {
    try {
      const res = await requestWithAuth(path, { method: "GET", timeoutMs: 30000 });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(parseApiError(errData, "Gagal mengunduh file."));
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const filename = parseFilenameFromDisposition(
        res.headers.get("content-disposition"),
        fallbackFilename,
      );
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      setNotice("File berhasil diunduh.");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunduh file.");
      setNotice(null);
    }
  }

  async function submitShare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (processingShare) return;

    const emails = shareForm.signerEmails
      .split(/[,\n;]/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (!shareForm.filename.trim()) {
      setError("Nama dokumen wajib diisi.");
      setNotice(null);
      return;
    }
    if (emails.length === 0) {
      setError("Masukkan minimal satu email penerima.");
      setNotice(null);
      return;
    }

    setProcessingShare(true);
    setError(null);
    try {
      const expiresAtIso = shareForm.expiresAt ? new Date(shareForm.expiresAt).toISOString() : null;
      const payload = {
        analysis_id: shareForm.analysisId.trim() || null,
        filename: shareForm.filename.trim(),
        signer_emails: emails,
        company_pays_analysis: shareForm.companyPaysAnalysis,
        expires_at: expiresAtIso,
      };

      const result = await requestJson<ShareDocumentResponse>("/api/documents/share/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        fallbackError: "Gagal membagikan dokumen.",
      });

      setShareForm({
        filename: "",
        analysisId: "",
        signerEmails: "",
        companyPaysAnalysis: false,
        expiresAt: "",
      });
      setNotice(result.message);
      await loadDocuments({
        preferredDocumentId: result.document_id,
        preserveSelection: false,
      });
      setActiveSection("documents");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membagikan dokumen.");
      setNotice(null);
    } finally {
      setProcessingShare(false);
    }
  }

  async function submitSign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedDocumentId || processingSign) return;
    if (!signForm.signerName.trim() || !signForm.documentHash.trim() || !signForm.consentText.trim()) {
      setError("Nama signer, consent, dan document hash wajib diisi.");
      setNotice(null);
      return;
    }

    setProcessingSign(true);
    setError(null);
    try {
      const payload = {
        signer_name: signForm.signerName.trim(),
        consent_text: signForm.consentText.trim(),
        document_hash: signForm.documentHash.trim(),
      };
      const result = await requestJson<DocumentActionResponse>(
        `/api/documents/${selectedDocumentId}/sign/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          fallbackError: "Gagal menandatangani dokumen.",
        },
      );
      setNotice(result.message);
      await loadDocuments({ preferredDocumentId: selectedDocumentId });
      await loadDocumentDetails(selectedDocumentId, result.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menandatangani dokumen.");
      setNotice(null);
    } finally {
      setProcessingSign(false);
    }
  }

  async function submitReject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedDocumentId || processingReject) return;

    setProcessingReject(true);
    setError(null);
    try {
      const payload = {
        reason: rejectReason.trim() || null,
      };
      const result = await requestJson<DocumentActionResponse>(
        `/api/documents/${selectedDocumentId}/reject/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          fallbackError: "Gagal menolak dokumen.",
        },
      );
      setNotice(result.message);
      setRejectReason("");
      await loadDocuments({ preferredDocumentId: selectedDocumentId });
      await loadDocumentDetails(selectedDocumentId, result.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menolak dokumen.");
      setNotice(null);
    } finally {
      setProcessingReject(false);
    }
  }

  function navItemClass(label: string) {
    return `${styles.navItem} ${activeNav === label ? styles.navItemActive : ""}`;
  }

  const pendingDocuments = useMemo(
    () => documents.filter((doc) => doc.my_signer_status === "pending").slice(0, 8),
    [documents],
  );
  const userInitial = toInitials(profile?.name || "Akun");
  const topbarDate = useMemo(() => formatTopbarDate(), []);
  const topbarTitle = activeSection === "documents" ? "Documents" : activeSection === "account" ? "Account" : "Overview";

  function renderOverview() {
    const recentDocuments = documents.slice(0, 6);
    const feedItems = (selectedEvents?.events || []).slice(0, 5);
    const pendingRows = pendingDocuments.slice(0, 5);
    const signedThisMonth = documents.filter((doc) => doc.status === "completed").length;
    const awaitingSignatures = documents.filter(
      (doc) => doc.status === "pending_signatures" || doc.status === "partially_signed",
    ).length;
    const verifiedUsers = new Set(documents.map((doc) => doc.owner_email).filter(Boolean)).size || 1;
    const chartRows = [55, 70, 45, 90, 65, 30, 20];
    const planPill = profile ? formatPlan(profile.plan) : "Enterprise";

    const quotaRows = [
      {
        key: "signatures",
        label: "Signatures",
        value: `${quotaInfo?.esign_used ?? 0} / ${formatLimit(quotaInfo?.esign_limit ?? null)}`,
        progress: esignProgress ?? 0,
        tone: "blue" as const,
      },
      {
        key: "storage",
        label: "Document Storage",
        value: `${documentsMeta.total} / 500`,
        progress: Math.min(100, Math.round((documentsMeta.total / 500) * 100)),
        tone: "green" as const,
      },
      {
        key: "kyc",
        label: "KYC Verifications",
        value: `${quotaInfo?.analysis_used ?? 0} / ${formatLimit(quotaInfo?.analysis_limit ?? null)}`,
        progress: analysisProgress ?? 0,
        tone: "amber" as const,
      },
      {
        key: "meterai",
        label: "e-Meterai Used",
        value: `${documentsMeta.pending_my_action} / 200`,
        progress: Math.min(100, Math.round((documentsMeta.pending_my_action / 200) * 100)),
        tone: "blue" as const,
      },
    ];

    return (
      <section>
        <div className={styles.statGrid}>
          <article className={styles.statCard}>
            <div className={styles.statCardTop}>
              <p className={styles.statLabel}>Total Documents</p>
              <span className={`${styles.statIconWrap} ${styles.iconBlue}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </span>
            </div>
            <p className={styles.statValue}>{formatNumber(documentsMeta.total)}</p>
            <p className={`${styles.statChange} ${styles.changeUp}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <polyline points="18 15 12 9 6 15" />
              </svg>
              +12.4% <span>vs last month</span>
            </p>
          </article>

          <article className={styles.statCard}>
            <div className={styles.statCardTop}>
              <p className={styles.statLabel}>Signed This Month</p>
              <span className={`${styles.statIconWrap} ${styles.iconGreen}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            </div>
            <p className={styles.statValue}>{formatNumber(signedThisMonth)}</p>
            <p className={`${styles.statChange} ${styles.changeUp}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <polyline points="18 15 12 9 6 15" />
              </svg>
              +8.7% <span>vs last month</span>
            </p>
          </article>

          <article className={styles.statCard}>
            <div className={styles.statCardTop}>
              <p className={styles.statLabel}>Awaiting Signatures</p>
              <span className={`${styles.statIconWrap} ${styles.iconAmber}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </span>
            </div>
            <p className={styles.statValue}>{formatNumber(awaitingSignatures)}</p>
            <p className={`${styles.statChange} ${styles.changeDown}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
              +3.2% <span>vs last month</span>
            </p>
          </article>

          <article className={styles.statCard}>
            <div className={styles.statCardTop}>
              <p className={styles.statLabel}>Verified Users</p>
              <span className={`${styles.statIconWrap} ${styles.iconPurple}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
            </div>
            <p className={styles.statValue}>{formatNumber(verifiedUsers)}</p>
            <p className={`${styles.statChange} ${styles.changeUp}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <polyline points="18 15 12 9 6 15" />
              </svg>
              +21.1% <span>vs last month</span>
            </p>
          </article>
        </div>

        <div className={styles.twoCol}>
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardTitle}>Recent Documents</p>
                <p className={styles.cardSub}>Latest document activity across your organization</p>
              </div>
              <a
                href="#"
                className={styles.cardLink}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveSection("documents");
                  setActiveNav("Documents");
                }}
              >
                View all →
              </a>
            </div>

            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Signer</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentDocuments.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No document activity yet.</td>
                  </tr>
                ) : (
                  recentDocuments.map((doc, index) => {
                    const displayName = toDisplayName(doc.owner_email, "User");
                    const initials = toInitials(displayName);
                    const variant = statusVariant(doc.status);
                    const badgeClass =
                      variant === "signed"
                        ? styles.badgeSigned
                        : variant === "pending"
                          ? styles.badgePending
                          : variant === "rejected"
                            ? styles.badgeRejected
                            : styles.badgeDraft;
                    const badgeLabel =
                      variant === "signed"
                        ? "Signed"
                        : variant === "pending"
                          ? "Pending"
                          : variant === "rejected"
                            ? "Rejected"
                            : "Draft";
                    const ext = doc.filename.includes(".") ? doc.filename.split(".").pop()?.toUpperCase() : "FILE";
                    const avatarClass =
                      index % 3 === 0
                        ? styles.docAvatarGreen
                        : index % 3 === 1
                          ? styles.docAvatarAmber
                          : styles.docAvatarBlue;

                    return (
                      <tr key={doc.document_id}>
                        <td>
                          <p className={styles.docName}>{doc.filename}</p>
                          <p className={styles.docMeta}>{formatStatus(doc.status)} · {ext}</p>
                        </td>
                        <td>
                          <div className={styles.docSigner}>
                            <span className={`${styles.docAvatar} ${avatarClass}`}>{initials}</span>
                            <span className={styles.docSignerName}>{displayName}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`${styles.badge} ${badgeClass}`}>{badgeLabel}</span>
                        </td>
                        <td className={styles.docDate}>{formatShortDate(doc.updated_at)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </article>

          <div className={styles.stackCol}>
            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>Quick Actions</div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.quickGrid}>
                  <Link href="/cek-dokumen/" className={styles.quickBtn}>
                    <span className={`${styles.quickIcon} ${styles.quickIconBlue}`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </span>
                    <p className={styles.quickName}>Upload Doc</p>
                    <p className={styles.quickDesc}>PDF or DOCX</p>
                  </Link>

                  <a
                    href="#"
                    className={styles.quickBtn}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveSection("documents");
                      setActiveNav("Documents");
                    }}
                  >
                    <span className={`${styles.quickIcon} ${styles.quickIconGreen}`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </span>
                    <p className={styles.quickName}>Sign Now</p>
                    <p className={styles.quickDesc}>Pending docs</p>
                  </a>

                  <a href="#" className={styles.quickBtn}>
                    <span className={`${styles.quickIcon} ${styles.quickIconAmber}`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </span>
                    <p className={styles.quickName}>Verify KYC</p>
                    <p className={styles.quickDesc}>New request</p>
                  </a>

                  <Link href="/bisnis/" className={styles.quickBtn}>
                    <span className={`${styles.quickIcon} ${styles.quickIconPurple}`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                    </span>
                    <p className={styles.quickName}>Use Template</p>
                    <p className={styles.quickDesc}>12 available</p>
                  </Link>
                </div>
              </div>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>Plan Usage</div>
                <span className={styles.planPill}>{planPill}</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.quotaWrap}>
                  {quotaRows.map((row) => (
                    <div key={row.key} className={styles.quotaItem}>
                      <div className={styles.quotaTop}>
                        <span className={styles.quotaName}>{row.label}</span>
                        <span className={styles.quotaVal}>{row.value}</span>
                      </div>
                      <div className={styles.quotaBar}>
                        <div
                          className={`${styles.quotaFill} ${
                            row.tone === "green"
                              ? styles.quotaFillGreen
                              : row.tone === "amber"
                                ? styles.quotaFillAmber
                                : styles.quotaFillBlue
                          }`}
                          style={{ width: `${row.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </div>

        <div className={styles.threeCol}>
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardTitle}>Signing Volume</p>
                <p className={styles.cardSub}>Last 7 days</p>
              </div>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.chartArea}>
                {chartRows.map((height, index) => (
                  <div key={index} className={styles.chartBarWrap}>
                    <div
                      className={`${styles.chartBar} ${index < 5 ? styles.chartBarPrimary : styles.chartBarLight}`}
                      style={{ height: `${height}%` }}
                      data-val={String(height)}
                    />
                    <div className={styles.chartLabel}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}</div>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>Activity Feed</div>
              <a
                href="#"
                className={styles.cardLink}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveSection("documents");
                  setActiveNav("Audit Trail");
                }}
              >
                See all
              </a>
            </div>
            <div className={`${styles.cardBody} ${styles.cardBodyCompact}`}>
              <div className={styles.activityList}>
                {feedItems.length === 0 ? (
                  <p className={styles.activityTime}>No activity yet.</p>
                ) : (
                  feedItems.map((event, index) => {
                    const actor = toDisplayName(event.actor_email, "System");
                    const eventText = event.event_type.replace(/_/g, " ").toLowerCase();
                    const dotClass =
                      index % 4 === 0
                        ? styles.dotGreen
                        : index % 4 === 1
                          ? styles.dotBlue
                          : index % 4 === 2
                            ? styles.dotAmber
                            : styles.dotRed;

                    return (
                      <div key={event.id} className={styles.activityItem}>
                        <div className={styles.activityDotWrap}>
                          <div className={`${styles.activityDot} ${dotClass}`} />
                          <div className={styles.activityLine} />
                        </div>
                        <div className={styles.activityContent}>
                          <p className={styles.activityText}>
                            <b>{actor}</b> {eventText}
                          </p>
                          <p className={styles.activityTime}>{formatDateTime(event.created_at)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardTitle}>Awaiting Signers</p>
                <p className={styles.cardSub}>Requires attention</p>
              </div>
              <span className={styles.pendingPill}>{pendingRows.length} pending</span>
            </div>
            <div className={`${styles.cardBody} ${styles.cardBodyCompact}`}>
              <div className={styles.signerList}>
                {pendingRows.length === 0 ? (
                  <p className={styles.activityTime}>No pending signer.</p>
                ) : (
                  pendingRows.map((doc, index) => {
                    const signerName = toDisplayName(doc.owner_email, "Signer");
                    const avatarClass =
                      index % 3 === 0
                        ? styles.docAvatarAmber
                        : index % 3 === 1
                          ? styles.docAvatarBlue
                          : styles.docAvatarGreen;

                    return (
                      <div key={doc.document_id} className={styles.signerRow}>
                        <span className={`${styles.docAvatar} ${avatarClass}`}>{toInitials(signerName)}</span>
                        <div className={styles.signerInfo}>
                          <p className={styles.signerName}>{signerName}</p>
                          <p className={styles.signerEmail}>{doc.filename}</p>
                        </div>
                        <a href="#" className={`${styles.iconBtn} ${styles.signerAction}`}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                          </svg>
                        </a>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </article>
        </div>
      </section>
    );
  }

  function renderDocumentsPanel() {
    return (
      <section className="space-y-4">
        <article className="border-b border-border-light bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-gray">Document Center</h2>
              <p className="text-xs text-neutral-gray">Kelola kolaborasi tanda tangan dan audit dokumen.</p>
            </div>
            <button
              type="button"
              onClick={() => loadDocuments()}
              disabled={refreshingDocuments}
              className="rounded-md border border-border-light px-3 py-1.5 text-xs font-semibold text-dark-navy hover:border-dark-navy/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshingDocuments ? "Memuat..." : "Muat Ulang"}
            </button>
          </div>

          <details className="px-4 py-3 sm:px-5">
            <summary className="cursor-pointer list-none text-sm font-semibold text-dark-navy">
              Bagikan dokumen baru
            </summary>
            <form className="mt-4 grid gap-3 lg:grid-cols-2" onSubmit={submitShare}>
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-gray">Nama Dokumen</label>
                <input
                  type="text"
                  value={shareForm.filename}
                  onChange={(e) => setShareForm((prev) => ({ ...prev, filename: e.target.value }))}
                  className="w-full rounded-md border border-border-light px-3 py-2 text-sm text-dark-navy outline-none focus:border-dark-navy"
                  placeholder="Perjanjian Kerja Sama Vendor"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-gray">Analysis ID (Opsional)</label>
                <input
                  type="text"
                  value={shareForm.analysisId}
                  onChange={(e) => setShareForm((prev) => ({ ...prev, analysisId: e.target.value }))}
                  className="w-full rounded-md border border-border-light px-3 py-2 text-sm text-dark-navy outline-none focus:border-dark-navy"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-neutral-gray">Email Signer</label>
                <textarea
                  value={shareForm.signerEmails}
                  onChange={(e) => setShareForm((prev) => ({ ...prev, signerEmails: e.target.value }))}
                  className="h-24 w-full rounded-md border border-border-light px-3 py-2 text-sm text-dark-navy outline-none focus:border-dark-navy"
                  placeholder="email1@contoh.com, email2@contoh.com"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-gray">Batas Waktu (Opsional)</label>
                <input
                  type="datetime-local"
                  value={shareForm.expiresAt}
                  onChange={(e) => setShareForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
                  className="w-full rounded-md border border-border-light px-3 py-2 text-sm text-dark-navy outline-none focus:border-dark-navy"
                />
              </div>

              <div className="flex items-end justify-between gap-4">
                <label className="flex items-center gap-2 text-xs text-neutral-gray">
                  <input
                    type="checkbox"
                    checked={shareForm.companyPaysAnalysis}
                    onChange={(e) => setShareForm((prev) => ({ ...prev, companyPaysAnalysis: e.target.checked }))}
                  />
                  Company pays analysis
                </label>
                <button
                  type="submit"
                  disabled={processingShare}
                  className="rounded-md bg-dark-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {processingShare ? "Memproses..." : "Bagikan"}
                </button>
              </div>
            </form>
          </details>
        </article>

        <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
          <article className="bg-white">
            <div className="border-b border-border-light px-4 py-3 sm:px-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-gray">Daftar Dokumen</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border-light bg-gray-50/70 text-left text-xs font-semibold uppercase tracking-wide text-neutral-gray">
                    <th className="px-4 py-2 sm:px-5">Dokumen</th>
                    <th className="px-4 py-2 sm:px-5">Status</th>
                    <th className="px-4 py-2 sm:px-5">Signer</th>
                    <th className="px-4 py-2 sm:px-5">Peran Anda</th>
                    <th className="px-4 py-2 sm:px-5">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-center text-neutral-gray sm:px-5">
                        Belum ada dokumen kolaborasi.
                      </td>
                    </tr>
                  ) : (
                    documents.map((doc) => {
                      const selected = selectedDocumentId === doc.document_id;
                      return (
                        <tr
                          key={doc.document_id}
                          onClick={() => setSelectedDocumentId(doc.document_id)}
                          className={[
                            "cursor-pointer border-b border-border-light align-top transition-colors last:border-b-0",
                            selected ? "bg-gray-50" : "hover:bg-gray-50/60",
                          ].join(" ")}
                        >
                          <td className="px-4 py-3 sm:px-5">
                            <p className="font-medium text-dark-navy">{doc.filename}</p>
                            <p className="mt-1 text-xs text-neutral-gray">{doc.document_id}</p>
                          </td>
                          <td className="px-4 py-3 sm:px-5">
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(doc.status)}`}>
                              {formatStatus(doc.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 sm:px-5 text-dark-navy">
                            {doc.signers_signed}/{doc.signers_total} signed
                          </td>
                          <td className="px-4 py-3 sm:px-5 text-dark-navy">
                            {doc.my_signer_role || "-"} / {doc.my_signer_status || "-"}
                          </td>
                          <td className="px-4 py-3 sm:px-5 text-neutral-gray">{formatDateTime(doc.updated_at)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="bg-white lg:border-l border-border-light">
            <div className="border-b border-border-light px-4 py-3 sm:px-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-gray">Detail & Aksi</h3>
                {selectedDocument ? (
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(selectedDocument.status)}`}>
                    {formatStatus(selectedDocument.status)}
                  </span>
                ) : null}
              </div>
            </div>
            {!selectedDocument ? (
              <div className="px-4 py-4 text-sm text-neutral-gray sm:px-5">Pilih dokumen untuk melihat detail.</div>
            ) : (
              <div className="space-y-4 px-4 py-4 sm:px-5">
                <div className="space-y-1 border-b border-border-light pb-3">
                  <p className="text-sm font-semibold text-dark-navy">{selectedDocument.filename}</p>
                  <p className="text-xs text-neutral-gray">Updated {formatDateTime(selectedDocument.updated_at)}</p>
                  <p className="text-xs text-neutral-gray">
                    {signedCount}/{totalSignerCount} signer selesai
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => loadDocumentDetails(selectedDocument.document_id, selectedDocument.status)}
                    disabled={loadingDocumentDetails}
                    className="rounded-md border border-border-light px-3 py-1.5 text-xs font-semibold text-dark-navy hover:border-dark-navy/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingDocumentDetails ? "Memuat..." : "Refresh Detail"}
                  </button>
                  {selectedDocument.analysis_id ? (
                    <Link
                      href={`/cek-dokumen/${selectedDocument.analysis_id}/`}
                      className="rounded-md border border-border-light px-3 py-1.5 text-xs font-semibold text-dark-navy hover:border-dark-navy/40"
                    >
                      Buka Analisis
                    </Link>
                  ) : null}
                  {selectedDocument.status === "completed" ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadPdf(
                            `/api/documents/${selectedDocument.document_id}/certificate/pdf/`,
                            "certificate.pdf",
                          )
                        }
                        className="rounded-md border border-border-light px-3 py-1.5 text-xs font-semibold text-dark-navy hover:border-dark-navy/40"
                      >
                        Sertifikat PDF
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadPdf(
                            `/api/documents/${selectedDocument.document_id}/signed-pdf/`,
                            "signed-document.pdf",
                          )
                        }
                        className="rounded-md border border-border-light px-3 py-1.5 text-xs font-semibold text-dark-navy hover:border-dark-navy/40"
                      >
                        Signed PDF
                      </button>
                    </>
                  ) : null}
                </div>

                <div className="grid gap-3 border-b border-border-light pb-4">
                  <form onSubmit={submitSign} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-gray">Aksi Sign</p>
                    <input
                      type="text"
                      value={signForm.signerName}
                      onChange={(e) => setSignForm((prev) => ({ ...prev, signerName: e.target.value }))}
                      className="w-full rounded-md border border-border-light px-3 py-2 text-sm outline-none focus:border-dark-navy"
                      placeholder="Nama signer"
                      required
                    />
                    <textarea
                      value={signForm.consentText}
                      onChange={(e) => setSignForm((prev) => ({ ...prev, consentText: e.target.value }))}
                      className="h-16 w-full rounded-md border border-border-light px-3 py-2 text-sm outline-none focus:border-dark-navy"
                      required
                    />
                    <input
                      type="text"
                      value={signForm.documentHash}
                      onChange={(e) => setSignForm((prev) => ({ ...prev, documentHash: e.target.value }))}
                      className="w-full rounded-md border border-border-light px-3 py-2 text-sm outline-none focus:border-dark-navy"
                      placeholder="Document hash"
                      required
                    />
                    <button
                      type="submit"
                      disabled={processingSign}
                      className="rounded-md bg-dark-navy px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {processingSign ? "Memproses..." : "Kirim Tanda Tangan"}
                    </button>
                  </form>

                  <form onSubmit={submitReject} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-gray">Aksi Reject</p>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="h-16 w-full rounded-md border border-border-light px-3 py-2 text-sm outline-none focus:border-dark-navy"
                      placeholder="Alasan penolakan (opsional)"
                    />
                    <button
                      type="submit"
                      disabled={processingReject}
                      className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {processingReject ? "Memproses..." : "Tolak Dokumen"}
                    </button>
                  </form>
                </div>

                {detailError ? (
                  <div className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {detailError}
                  </div>
                ) : null}

                <div className="grid gap-3">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-gray">Signer</p>
                    <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                      {(selectedSigners?.signers || []).length === 0 ? (
                        <p className="text-xs text-neutral-gray">Belum ada data signer.</p>
                      ) : (
                        selectedSigners?.signers.map((signer) => (
                          <div key={`${signer.email}-${signer.role}`} className="border-b border-border-light px-3 py-2 last:border-b-0">
                            <p className="text-xs font-medium text-dark-navy">{signer.email}</p>
                            <p className="text-[11px] text-neutral-gray">
                              {signer.role} • {signer.status}
                              {signer.signed_at ? ` • ${formatDateTime(signer.signed_at)}` : ""}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-gray">Audit Trail</p>
                    <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                      {(selectedEvents?.events || []).length === 0 ? (
                        <p className="text-xs text-neutral-gray">Belum ada event.</p>
                      ) : (
                        selectedEvents?.events.map((event) => (
                          <div key={event.id} className="border-b border-border-light px-3 py-2 last:border-b-0">
                            <p className="text-xs font-medium text-dark-navy">{event.event_type}</p>
                            <p className="text-[11px] text-neutral-gray">
                              {event.actor_email || "system"} • {formatDateTime(event.created_at)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {selectedCertificate ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-gray">Sertifikat</p>
                      <p className="mb-2 text-[11px] text-neutral-gray">
                        Selesai pada {formatDateTime(selectedCertificate.completed_at)}
                      </p>
                      <div className="max-h-32 space-y-2 overflow-y-auto pr-1">
                        {selectedCertificate.signatures.map((signature) => (
                          <div
                            key={`${signature.signer_email}-${signature.signed_at}`}
                            className="border-b border-border-light px-3 py-2 last:border-b-0"
                          >
                            <p className="text-xs font-medium text-dark-navy">{signature.signer_name}</p>
                            <p className="text-[11px] text-neutral-gray">
                              {signature.signer_email} • {formatDateTime(signature.signed_at)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </article>
        </div>
      </section>
    );
  }

  function renderAccountPanel() {
    return (
      <section className="space-y-4">
        <article className="border-b border-border-light bg-white">
          <div className="border-b border-border-light px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-gray">Profil Akun</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <tbody>
                <tr className="border-b border-border-light">
                  <td className="w-56 px-4 py-3 text-neutral-gray sm:px-5">Nama</td>
                  <td className="px-4 py-3 font-medium text-dark-navy sm:px-5">{profile?.name || "-"}</td>
                </tr>
                <tr className="border-b border-border-light">
                  <td className="px-4 py-3 text-neutral-gray sm:px-5">Email</td>
                  <td className="px-4 py-3 font-medium text-dark-navy sm:px-5">{profile?.email || "-"}</td>
                </tr>
                <tr className="border-b border-border-light">
                  <td className="px-4 py-3 text-neutral-gray sm:px-5">Tipe Akun</td>
                  <td className="px-4 py-3 font-medium text-dark-navy sm:px-5">
                    {profile ? formatAccountType(profile.account_type) : "-"}
                  </td>
                </tr>
                <tr className="border-b border-border-light">
                  <td className="px-4 py-3 text-neutral-gray sm:px-5">Plan</td>
                  <td className="px-4 py-3 font-medium text-dark-navy sm:px-5">{profile ? formatPlan(profile.plan) : "-"}</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-neutral-gray sm:px-5">User ID</td>
                  <td className="px-4 py-3 font-medium text-dark-navy sm:px-5">{profile?.user_id || "-"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <article className="border-b border-border-light bg-white p-4 sm:p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-gray">Langkah Lanjutan</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/bisnis/"
              className="border border-border-light px-3 py-2 text-sm font-medium text-dark-navy hover:border-dark-navy/40"
            >
              Lihat Paket Bisnis
            </Link>
            <Link
              href="/cek-dokumen/"
              className="border border-border-light px-3 py-2 text-sm font-medium text-dark-navy hover:border-dark-navy/40"
            >
              Analisis Dokumen Baru
            </Link>
          </div>
        </article>
      </section>
    );
  }

  if (loading) {
    return (
      <main className={styles.app}>
        <div className="animate-pulse w-full">
          <div className="h-[60px] border-b border-border-light bg-white" />
          <div className="grid min-h-[calc(100vh-60px)] md:grid-cols-[244px_1fr]">
            <div className="hidden border-r border-border-light bg-white md:block" />
            <div className="space-y-4 p-4">
              <div className="h-8 w-40 bg-gray-100" />
              <div className="h-44 border border-border-light bg-white" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.app}>
      <aside className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ""}`}>
        <div className={styles.sidebarHeader}>
          <img src="/favicon.svg" alt="TanyaHukum logo" className={styles.logoMark} />
          <span className={styles.logoText}>TanyaHukum</span>
        </div>

        <button
          type="button"
          className={styles.sidebarToggle}
          onClick={() => setSidebarCollapsed((prev) => !prev)}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M7.5 9L4.5 6L7.5 3" />
          </svg>
        </button>

        <nav className={styles.nav}>
          <div className={styles.navSection}>
            <p className={styles.navLabel}>Main</p>
            <a
              href="#"
              className={navItemClass("Dashboard")}
              onClick={(e) => {
                e.preventDefault();
                setActiveNav("Dashboard");
                setActiveSection("overview");
              }}
            >
              <span className={styles.navIcon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
              </span>
              <span className={styles.navItemLabel}>Dashboard</span>
            </a>
            <a
              href="#"
              className={navItemClass("Documents")}
              onClick={(e) => {
                e.preventDefault();
                setActiveNav("Documents");
                setActiveSection("documents");
              }}
            >
              <span className={styles.navIcon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </span>
              <span className={styles.navItemLabel}>Documents</span>
              <span className={styles.navBadge}>{documentsMeta.pending_my_action || 12}</span>
            </a>
            <a href="#" className={navItemClass("Signers")} onClick={(e) => { e.preventDefault(); setActiveNav("Signers"); }}>
              <span className={styles.navIcon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <span className={styles.navItemLabel}>Signers</span>
            </a>
            <a href="#" className={navItemClass("Templates")} onClick={(e) => { e.preventDefault(); setActiveNav("Templates"); }}>
              <span className={styles.navIcon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </span>
              <span className={styles.navItemLabel}>Templates</span>
            </a>
          </div>

          <div className={styles.navSection}>
            <p className={styles.navLabel}>Identity</p>
            <a href="#" className={navItemClass("e-KYC Verification")} onClick={(e) => { e.preventDefault(); setActiveNav("e-KYC Verification"); }}>
              <span className={styles.navIcon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
              <span className={styles.navItemLabel}>e-KYC Verification</span>
            </a>
            <a href="#" className={navItemClass("Digital Identity")} onClick={(e) => { e.preventDefault(); setActiveNav("Digital Identity"); }}>
              <span className={styles.navIcon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </span>
              <span className={styles.navItemLabel}>Digital Identity</span>
            </a>
            <a href="#" className={navItemClass("Certificates")} onClick={(e) => { e.preventDefault(); setActiveNav("Certificates"); }}>
              <span className={styles.navIcon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <span className={styles.navItemLabel}>Certificates</span>
            </a>
            <a href="#" className={navItemClass("Audit Trail")} onClick={(e) => { e.preventDefault(); setActiveNav("Audit Trail"); }}>
              <span className={styles.navIcon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </span>
              <span className={styles.navItemLabel}>Audit Trail</span>
            </a>
          </div>

          <div className={styles.navSection}>
            <p className={styles.navLabel}>System</p>
            <a href="#" className={navItemClass("API & Integrations")} onClick={(e) => { e.preventDefault(); setActiveNav("API & Integrations"); }}>
              <span className={styles.navIcon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M17.66 17.66l-1.41-1.41M6.34 17.66l1.41-1.41" />
                </svg>
              </span>
              <span className={styles.navItemLabel}>API & Integrations</span>
            </a>
            <a
              href="#"
              className={navItemClass("Settings")}
              onClick={(e) => {
                e.preventDefault();
                setActiveNav("Settings");
                setActiveSection("account");
              }}
            >
              <span className={styles.navIcon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </span>
              <span className={styles.navItemLabel}>Settings</span>
            </a>
          </div>
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userCard}>
            <span className={styles.avatar}>{userInitial}</span>
            <div className={styles.userInfo}>
              <p className={styles.userName}>{profile?.name || "Akun"}</p>
              <p className={styles.userRole}>{profile ? formatAccountType(profile.account_type) : "Memuat akun..."}</p>
            </div>
          </div>
        </div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <p className={styles.topbarTitle}>{topbarTitle}</p>
            <p className={styles.topbarSub}>{topbarDate}</p>
          </div>

          <div className={styles.topbarActions}>
            <label className={styles.searchBox}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input type="text" placeholder="Search documents…" aria-label="Search documents" />
            </label>

            <a href="#" className={styles.iconBtn} title="Notifications">
              <span className={styles.notifDot} />
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </a>

            <Link href="/cek-dokumen/" className={styles.primaryBtn}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Send for Signature
            </Link>
          </div>
        </header>

        <div className={styles.content}>
          {error && (
            <div className={styles.alertError}>
              <p>{error}</p>
              <button
                type="button"
                onClick={loadData}
                className="mt-2 border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {notice ? <div className={styles.alertSuccess}>{notice}</div> : null}

          {activeSection === "overview" && renderOverview()}
          {activeSection === "documents" && renderDocumentsPanel()}
          {activeSection === "account" && renderAccountPanel()}
        </div>
      </section>
    </main>
  );
}
