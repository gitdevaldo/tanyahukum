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

export default function DashboardPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<DashboardSection>("documents");
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
  const [loggingOut, setLoggingOut] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  function sectionButtonClass(section: DashboardSection) {
    const active = activeSection === section;
    return `${styles.navItem} ${active ? styles.navItemActive : ""}`;
  }

  const pendingDocuments = useMemo(
    () => documents.filter((doc) => doc.my_signer_status === "pending").slice(0, 8),
    [documents],
  );
  const userInitial = profile?.name?.trim()?.charAt(0)?.toUpperCase() || "A";

  function renderOverview() {
    const recentDocuments = documents.slice(0, 6);
    const feedItems = (selectedEvents?.events || []).slice(0, 5);
    const pendingRows = pendingDocuments.slice(0, 5);

    return (
      <section>
        <div className={styles.statGrid}>
          <article className={styles.statCard}>
            <p className={styles.statLabel}>Total Dokumen</p>
            <p className={styles.statValue}>{documentsMeta.total}</p>
            <p className={styles.statMeta}>{documentsMeta.owned_total} milik akun Anda</p>
          </article>
          <article className={styles.statCard}>
            <p className={styles.statLabel}>Butuh Aksi Anda</p>
            <p className={styles.statValue}>{documentsMeta.pending_my_action}</p>
            <p className={styles.statMeta}>Dokumen menunggu tanda tangan Anda</p>
          </article>
          <article className={styles.statCard}>
            <p className={styles.statLabel}>Analisis Tersisa</p>
            <p className={styles.statValue}>{String(quotaInfo?.analysis_remaining ?? "Unlimited")}</p>
            <p className={styles.statMeta}>
              {quotaInfo?.analysis_used ?? 0} / {formatLimit(quotaInfo?.analysis_limit ?? null)}
            </p>
          </article>
          <article className={styles.statCard}>
            <p className={styles.statLabel}>e-Sign Tersisa</p>
            <p className={styles.statValue}>{String(quotaInfo?.esign_remaining ?? "Unlimited")}</p>
            <p className={styles.statMeta}>
              {quotaInfo?.esign_used ?? 0} / {formatLimit(quotaInfo?.esign_limit ?? null)}
            </p>
          </article>
        </div>

        <div className={styles.twoCol}>
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardTitle}>Recent Documents</p>
                <p className={styles.cardSub}>Latest document activity in your workspace</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection("documents")}
                className={styles.actionBtn}
              >
                View all
              </button>
            </div>

            <div className={styles.cardBody}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Status</th>
                    <th>Signer</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDocuments.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Belum ada dokumen kolaborasi.</td>
                    </tr>
                  ) : (
                    recentDocuments.map((doc) => (
                      <tr key={doc.document_id}>
                        <td>
                          <button
                            type="button"
                            className={styles.tableAction}
                            onClick={() => {
                              setSelectedDocumentId(doc.document_id);
                              setActiveSection("documents");
                            }}
                          >
                            {doc.filename}
                          </button>
                        </td>
                        <td>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(doc.status)}`}>
                            {formatStatus(doc.status)}
                          </span>
                        </td>
                        <td>
                          {doc.signers_signed}/{doc.signers_total}
                        </td>
                        <td>{formatDateTime(doc.updated_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <div className="space-y-4">
            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.cardTitle}>Quick Actions</p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.quickGrid}>
                  <Link href="/cek-dokumen/" className={styles.quickBtn}>
                    <p className={styles.quickName}>Analyze Contract</p>
                    <p className={styles.quickDesc}>Upload and evaluate legal risk</p>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setActiveSection("documents")}
                    className={styles.quickBtn}
                  >
                    <p className={styles.quickName}>Open Document Center</p>
                    <p className={styles.quickDesc}>Signing workflow and audit trail</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection("account")}
                    className={styles.quickBtn}
                  >
                    <p className={styles.quickName}>View Account</p>
                    <p className={styles.quickDesc}>Plan and quota details</p>
                  </button>
                  <Link href="/bisnis/" className={styles.quickBtn}>
                    <p className={styles.quickName}>Upgrade Plan</p>
                    <p className={styles.quickDesc}>Business and enterprise options</p>
                  </Link>
                </div>
              </div>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.cardTitle}>Plan Usage</p>
                  <p className={styles.cardSub}>{profile ? formatPlan(profile.plan) : "-"}</p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.quotaItem}>
                  <div className={styles.quotaTop}>
                    <span>Analisis AI</span>
                    <span>
                      {quotaInfo?.analysis_used ?? 0} / {formatLimit(quotaInfo?.analysis_limit ?? null)}
                    </span>
                  </div>
                  <div className={styles.quotaBar}>
                    <div className={styles.quotaFill} style={{ width: `${analysisProgress ?? 0}%` }} />
                  </div>
                </div>
                <div className={styles.quotaItem}>
                  <div className={styles.quotaTop}>
                    <span>e-Sign</span>
                    <span>
                      {quotaInfo?.esign_used ?? 0} / {formatLimit(quotaInfo?.esign_limit ?? null)}
                    </span>
                  </div>
                  <div className={styles.quotaBar}>
                    <div className={styles.quotaFill} style={{ width: `${esignProgress ?? 0}%` }} />
                  </div>
                </div>
                <p className={styles.statMeta}>Reset kuota: {formatDateTime(quotaInfo?.reset_at ?? null)}</p>
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
              <div className="grid grid-cols-7 gap-2">
                {[55, 70, 45, 90, 65, 30, 20].map((height, index) => (
                  <div key={index} className="flex flex-col items-center justify-end gap-1">
                    <div className="w-full bg-dark-navy/90" style={{ height: `${height}px` }} />
                    <span className="text-[10px] text-neutral-gray">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardTitle}>Activity Feed</p>
              </div>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.activityList}>
                {feedItems.length === 0 ? (
                  <p className={styles.activityTime}>Belum ada activity feed.</p>
                ) : (
                  feedItems.map((event) => (
                    <div key={event.id} className={styles.activityItem}>
                      <p className={styles.activityText}>
                        {event.event_type} • {event.actor_email || "system"}
                      </p>
                      <p className={styles.activityTime}>{formatDateTime(event.created_at)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardTitle}>Awaiting Signers</p>
                <p className={styles.cardSub}>{pendingRows.length} pending</p>
              </div>
            </div>
            <div className={styles.cardBody}>
              {pendingRows.length === 0 ? (
                <p className={styles.activityTime}>Tidak ada signer pending.</p>
              ) : (
                pendingRows.map((doc) => (
                  <div key={doc.document_id} className={styles.pendingRow}>
                    <p className={styles.pendingName}>{doc.filename}</p>
                    <p className={styles.pendingMeta}>
                      Role: {doc.my_signer_role || "-"} • Updated {formatDateTime(doc.updated_at)}
                    </p>
                  </div>
                ))
              )}
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
          <Link href="/" className={styles.sidebarBrand}>
            <img src="/logo.svg" alt="TanyaHukum" className="h-7" />
            <span className={styles.logoText}>TanyaHukum</span>
          </Link>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navSection}>
            <p className={styles.navLabel}>Workspace</p>
            <button
              type="button"
              className={sectionButtonClass("overview")}
              onClick={() => setActiveSection("overview")}
            >
              {sidebarCollapsed ? "OV" : "Overview"}
            </button>
            <button
              type="button"
              className={sectionButtonClass("documents")}
              onClick={() => setActiveSection("documents")}
            >
              {sidebarCollapsed ? "DOC" : "Document Center"}
            </button>
            <button
              type="button"
              className={sectionButtonClass("account")}
              onClick={() => setActiveSection("account")}
            >
              {sidebarCollapsed ? "ACC" : "Account"}
            </button>
          </div>
        </nav>

        <div className={styles.sidebarFooter}>
          <p className={styles.userName}>{sidebarCollapsed ? userInitial : profile?.name || "Akun"}</p>
          <div className={styles.sidebarMeta}>
            <p className={styles.userRole}>{profile ? formatAccountType(profile.account_type) : "Memuat akun..."}</p>
            <p className="mt-2 text-[11px] text-neutral-gray">
              Plan <span className="font-semibold text-dark-navy">{profile ? formatPlan(profile.plan) : "-"}</span>
            </p>
            <p className="mt-1 text-[11px] text-neutral-gray">
              Chat limit/dokumen{" "}
              <span className="font-semibold text-dark-navy">{quotaInfo?.chat_per_doc_limit ?? "-"}</span>
            </p>
          </div>
        </div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <p className={styles.topbarTitle}>Contract Dashboard</p>
            <p className={styles.topbarSub}>Monitor analysis, signing progress, and account quota</p>
          </div>

          <div className={styles.topbarActions}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.sidebarToggleButton}`}
              onClick={() => setSidebarCollapsed((prev) => !prev)}
            >
              {sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            </button>
            <Link href="/cek-dokumen/" className={styles.actionBtn}>
              Cek Dokumen
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className={styles.actionBtn}
            >
              {loggingOut ? "Memproses..." : "Keluar"}
            </button>
          </div>
        </header>

        <div className={styles.content}>
          <div className="mb-4 grid grid-cols-3 gap-2 md:hidden">
            <button type="button" className={sectionButtonClass("overview")} onClick={() => setActiveSection("overview")}>Overview</button>
            <button type="button" className={sectionButtonClass("documents")} onClick={() => setActiveSection("documents")}>Dokumen</button>
            <button type="button" className={sectionButtonClass("account")} onClick={() => setActiveSection("account")}>Akun</button>
          </div>

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
