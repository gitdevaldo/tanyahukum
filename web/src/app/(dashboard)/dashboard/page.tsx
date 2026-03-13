"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { clearSession, getAccessToken, getValidAccessToken, refreshAccessToken, setSession } from "@/lib/auth-session";
import { AnalysisResults } from "@/components/cek-dokumen/AnalysisResults";
import { ChatPanel } from "@/components/cek-dokumen/ChatPanel";
import type { AnalysisResponse } from "@/components/cek-dokumen/types";
import styles from "./dashboard.module.css";

const PdfViewer = dynamic(() => import("@/components/cek-dokumen/PdfViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin w-8 h-8 border-2 border-primary-orange border-t-transparent rounded-full" />
    </div>
  ),
});

const SignaturePad = dynamic(() => import("@/components/cek-dokumen/SignaturePad"), {
  ssr: false,
});

const PdfSigningViewer = dynamic(() => import("@/components/cek-dokumen/PdfSigningViewer"), {
  ssr: false,
});

const SignatureCreator = dynamic(() => import("@/components/cek-dokumen/SignatureCreator").then(m => ({ default: m.SignatureCreator })), {
  ssr: false,
});

type AccountType = "personal" | "business";
type Plan = "free" | "starter" | "plus" | "business" | "enterprise" | null;
type DashboardSection = "overview" | "documents" | "analysis" | "sign" | "consultation" | "account";
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
    free: "Gratis",
    starter: "Starter",
    plus: "Plus",
    business: "Bisnis",
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
  if (value === null) return "Tanpa Batas";
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatNumber(value: number) {
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

function formatShortDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTopbarDate() {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

function toDisplayName(email: string | null, fallback = "Sistem") {
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
  if (parts.length === 0) return "TDK";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function statusVariant(status: DocumentStatus) {
  if (status === "completed") return "signed";
  if (status === "pending_signatures" || status === "partially_signed") return "pending";
  if (status === "rejected") return "rejected";
  if (status === "analyzed") return "analyzed";
  return "draft";
}

export default function DashboardPage() {
  const router = useRouter();
  const [activeSection, setActiveSectionState] = useState<DashboardSection>("overview");
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
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    // Initialize activeNav from localStorage or default to "Ringkasan"
  const [activeNav, setActiveNavState] = useState("Ringkasan");
  
  // Load from localStorage on mount and save when it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dashboardActiveNav");
      if (saved) {
        setActiveNavState(saved);
        // Also update activeSection to match the nav
        const sectionMapping: { [key: string]: DashboardSection } = {
          "Ringkasan": "overview",
          "Tanda Tangan": "sign",
          "Pusat Dokumen": "documents",
          "Analisis Dokumen": "analysis",
          "Konsultasi": "consultation",
          "Pengaturan Akun": "account",
        };
        const section = sectionMapping[saved];
        if (section) {
          setActiveSectionState(section);
        }
      }
    }
  }, []);

  // Wrapper function to save to localStorage when changing nav
  const setActiveNav = (newNav: string) => {
    setActiveNavState(newNav);
    if (typeof window !== "undefined") {
      localStorage.setItem("dashboardActiveNav", newNav);
    }
  };

  // Mapping from nav label to section
  const navToSection: { [key: string]: DashboardSection } = {
    "Ringkasan": "overview",
    "Tanda Tangan": "sign",
    "Pusat Dokumen": "documents",
    "Analisis Dokumen": "analysis",
    "Konsultasi": "consultation",
    "Pengaturan Akun": "account",
  };

  // Wrapper function to save activeSection to localStorage
  const setActiveSection = (newSection: DashboardSection) => {
    setActiveSectionState(newSection);
    if (typeof window !== "undefined") {
      localStorage.setItem("dashboardActiveSection", newSection);
    }
  };

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
  const [consultForm, setConsultForm] = useState({
    name: "",
    email: "",
    whatsapp: "",
    analysisId: "",
  });
  const [consultSubmitting, setConsultSubmitting] = useState(false);

  // Quick sign state
  const [signFile, setSignFile] = useState<File | null>(null);
  const [signQuickName, setSignQuickName] = useState("");
  const [signingInProgress, setSigningInProgress] = useState(false);
  const [signResult, setSignResult] = useState<{ url: string; filename: string; documentId: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [signActiveTab, setSignActiveTab] = useState<"list" | "quick" | "share">("list");
  const [signPanelDocId, setSignPanelDocId] = useState<string | null>(null);
  const [signPanelSigners, setSignPanelSigners] = useState<DocumentSignersResponse | null>(null);
  const [signPanelEvents, setSignPanelEvents] = useState<DocumentEventsResponse | null>(null);
  const [signPanelLoading, setSignPanelLoading] = useState(false);
  const [signPanelForm, setSignPanelForm] = useState({ signerName: "", consentText: "Saya menyetujui penandatanganan elektronik dokumen ini.", documentHash: "" });
  const [signPanelRejectReason, setSignPanelRejectReason] = useState("");
  const [signPanelProcessing, setSignPanelProcessing] = useState(false);
  const [signShareForm, setSignShareForm] = useState({ selectedDocId: "", filename: "", signerEmails: "", companyPaysAnalysis: false, expiresAt: "" });
  const [signShareProcessing, setSignShareProcessing] = useState(false);

  // Signature pad and visual signing state
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [showPdfSigner, setShowPdfSigner] = useState(false);
  const [signaturePositions, setSignaturePositions] = useState<
    Array<{ id: string; x: number; y: number; width: number; height: number }>
  >([]);

  // Panel signature state (for Detail & Aksi panel signing - NEW FLOW)
  const [panelSignatureImage, setPanelSignatureImage] = useState<string | null>(null);
  const [panelShowPdfSigner, setPanelShowPdfSigner] = useState(false);
  const [panelSignaturePositions, setPanelSignaturePositions] = useState<
    Array<{ id: string; x: number; y: number; width: number; height: number }>
  >([]);
  const [panelSignatureName, setPanelSignatureName] = useState<string>("");
  const [panelSignatureType, setPanelSignatureType] = useState<"text" | "drawn" | "image" | null>(null);
  const [panelCanSign, setPanelCanSign] = useState(false);

  // --- Inline analysis state ---
  const [analysisFile, setAnalysisFile] = useState<File | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<Record<string, unknown> | null>(null);
  const [analysisDragOver, setAnalysisDragOver] = useState(false);
  const [viewingAnalysisId, setViewingAnalysisId] = useState<string | null>(null);
  const [viewingAnalysis, setViewingAnalysis] = useState<AnalysisResponse | null>(null);
  const [viewingAnalysisLoading, setViewingAnalysisLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [highlightText, setHighlightText] = useState<string | null>(null);
  const [highlightColor, setHighlightColor] = useState("rgba(251, 146, 60, 0.35)");
  const [activeClauseIndex, setActiveClauseIndex] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const handleLogout = async () => {
    try {
      const token = await getValidAccessToken();
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (e) {
      console.error("Logout error:", e);
    } finally {
      clearSession();
      router.replace("/login/");
    }
  };

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
      let token = await getValidAccessToken();
      if (!token) {
        // Try refresh before giving up
        token = await getValidAccessToken();
        if (!token) {
          clearSession();
          router.replace("/login/");
          throw new Error("Sesi berakhir. Silakan login ulang.");
        }
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
        // Token might be expired, attempt refresh
        const newToken = await refreshAccessToken();
        if (newToken) {
          // Retry the request with the new token
          const retryRes = await fetch(url, {
            method: options?.method ?? "GET",
            headers: {
              Authorization: `Bearer ${newToken}`,
              ...(options?.headers || {}),
            },
            body: options?.body,
            signal: AbortSignal.timeout(options?.timeoutMs ?? 25000),
          });
          if (!retryRes.ok && retryRes.status === 401) {
            clearSession();
            router.replace("/login/");
            throw new Error("Sesi berakhir. Silakan login ulang.");
          }
          return retryRes;
        }
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
      setError(null);
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
            setError(certificateError instanceof Error ? certificateError.message : "Gagal memuat sertifikat.");
          }
        } else {
          setSelectedCertificate(null);
        }
      } catch (err) {
        setSelectedSigners(null);
        setSelectedEvents(null);
        setSelectedCertificate(null);
        setError(err instanceof Error ? err.message : "Gagal memuat detail dokumen.");
      } finally {
        setLoadingDocumentDetails(false);
      }
    },
    [requestJson],
  );

  const loadData = useCallback(async () => {
    const accToken = await getValidAccessToken();
    if (!accToken) {
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
      setConsultForm((prev) => ({
        ...prev,
        name: prev.name || meData.name || "",
        email: prev.email || meData.email || "",
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
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

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

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Listen for signing completion from new tab
  useEffect(() => {
    const handleSigningComplete = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "SIGNATURE_COMPLETE") {
        const docId = event.data.documentId;
        // Refresh document list
        loadDocuments();
        // Show success message
        setNotice("✓ Dokumen berhasil ditandatangani");
        // Clear signing panel state
        setPanelCanSign(false);
        setPanelSignatureName("");
        setPanelSignatureType(null);
        setPanelSignatureImage(null);
      }
    };

    window.addEventListener("message", handleSigningComplete);
    return () => window.removeEventListener("message", handleSigningComplete);
  }, [loadDocuments]);

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

  async function submitConsultation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (consultSubmitting) return;

    if (!consultForm.name.trim() || !consultForm.email.trim() || !consultForm.whatsapp.trim()) {
      setError("Nama, email, dan WhatsApp wajib diisi untuk konsultasi.");
      setNotice(null);
      return;
    }

    setConsultSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: consultForm.name.trim(),
        email: consultForm.email.trim(),
        whatsapp: consultForm.whatsapp.trim(),
        analysis_id: consultForm.analysisId.trim() || null,
      };

      const res = await fetch("/api/consultation/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(25000),
      });
      const data = await res.json().catch(() => ({ detail: "Permintaan konsultasi gagal." }));
      if (!res.ok) {
        throw new Error(parseApiError(data, "Permintaan konsultasi gagal."));
      }

      setNotice("Permintaan konsultasi berhasil dikirim. Tim kami akan menghubungi Anda.");
      setConsultForm((prev) => ({ ...prev, whatsapp: "", analysisId: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Permintaan konsultasi gagal.");
      setNotice(null);
    } finally {
      setConsultSubmitting(false);
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
  const topbarTitle =
    activeSection === "documents"
      ? "Pusat Dokumen"
      : activeSection === "analysis"
        ? "Analisis Dokumen"
        : activeSection === "sign"
          ? "Tanda Tangan"
          : activeSection === "consultation"
            ? "Konsultasi"
            : activeSection === "account"
              ? "Pengaturan Akun"
              : "Ringkasan";

  function renderOverview() {
    const recentDocuments = documents.slice(0, 6);
    const feedItems = (selectedEvents?.events || []).slice(0, 5);
    const pendingRows = pendingDocuments.slice(0, 5);
    const signedThisMonth = documents.filter((doc) => doc.status === "completed").length;
    const awaitingSignatures = documents.filter(
      (doc) => doc.status === "pending_signatures" || doc.status === "partially_signed",
    ).length;
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    
    const chartLabels = last7Days.map((d) =>
      d.toLocaleDateString("id-ID", { weekday: "short" })
    );

    const chartCounts = last7Days.map((d) => {
      // Create fresh Date objects for start/end to avoid mutating `d` if we reuse it
      const clone = new Date(d);
      const startOfDay = new Date(clone.setHours(0, 0, 0, 0));
      const endOfDay = new Date(clone.setHours(23, 59, 59, 999));
      
      return documents.filter((doc) => {
        if (!doc.updated_at) return false;
        const docDate = new Date(doc.updated_at);
        return docDate >= startOfDay && docDate <= endOfDay;
      }).length;
    });

    const maxCount = Math.max(...chartCounts, 1);
    const chartRows = chartCounts.map((count) => (count / maxCount) * 100);
    const planPill = profile ? formatPlan(profile.plan) : "Gratis";

    const docLimit =
      profile?.plan === "enterprise" || profile?.plan === "business"
        ? Infinity
        : profile?.plan === "plus"
          ? 5000
          : profile?.plan === "starter"
            ? 500
            : 100;
            
    const storageProgress = docLimit === Infinity ? 0 : Math.min(100, Math.round((documentsMeta.total / docLimit) * 100));
    const storageValue = docLimit === Infinity ? `${documentsMeta.total} Dokumen` : `${documentsMeta.total} / ${formatNumber(docLimit)}`;

    const quotaRows = [
      {
        key: "analysis",
        label: "Analisis Kontrak",
        value: `${quotaInfo?.analysis_used ?? 0} / ${formatLimit(quotaInfo?.analysis_limit ?? null)}`,
        progress: analysisProgress ?? 0,
        tone: "blue" as const,
      },
      {
        key: "signatures",
        label: "Tanda Tangan Elektronik",
        value: `${quotaInfo?.esign_used ?? 0} / ${formatLimit(quotaInfo?.esign_limit ?? null)}`,
        progress: esignProgress ?? 0,
        tone: "green" as const,
      },
      {
        key: "storage",
        label: "Pusat Dokumen",
        value: storageValue,
        progress: storageProgress,
        tone: "amber" as const,
      },
    ];

    return (
      <section>
        <div className={styles.statGrid}>
          <article className={styles.statCard}>
            <div className={styles.statCardTop}>
              <p className={styles.statLabel}>Total Dokumen</p>
              <span className={`${styles.statIconWrap} ${styles.iconBlue}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </span>
            </div>
            <p className={styles.statValue}>{formatNumber(documentsMeta.total)}</p>
            <p className={styles.statMeta}>
              Semua dokumen
            </p>
          </article>

          <article className={styles.statCard}>
            <div className={styles.statCardTop}>
              <p className={styles.statLabel}>Ditandatangani Bulan Ini</p>
              <span className={`${styles.statIconWrap} ${styles.iconGreen}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            </div>
            <p className={styles.statValue}>{formatNumber(signedThisMonth)}</p>
            <p className={styles.statMeta}>
              Bulan ini
            </p>
          </article>

          <article className={styles.statCard}>
            <div className={styles.statCardTop}>
              <p className={styles.statLabel}>Menunggu Tanda Tangan</p>
              <span className={`${styles.statIconWrap} ${styles.iconAmber}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </span>
            </div>
            <p className={styles.statValue}>{formatNumber(awaitingSignatures)}</p>
            <p className={styles.statMeta}>
              Butuh perhatian
            </p>
          </article>

          <article className={styles.statCard}>
            <div className={styles.statCardTop}>
              <p className={styles.statLabel}>Tindakan Tertunda</p>
              <span className={`${styles.statIconWrap} ${styles.iconPurple}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </span>
            </div>
            <p className={styles.statValue}>{formatNumber(documentsMeta.pending_my_action)}</p>
            <p className={styles.statMeta}>
              Dokumen menunggu Anda
            </p>
          </article>
        </div>

        <div className={styles.twoCol}>
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardTitle}>Dokumen Terbaru</p>
                <p className={styles.cardSub}>Aktivitas dokumen terbaru di organisasi Anda</p>
              </div>
              <a
                href="#"
                className={styles.cardLink}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveSection("documents");
                  setActiveNav("Pusat Dokumen");
                }}
              >
                Lihat semua &rarr;
              </a>
            </div>

            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Dokumen</th>
                  <th>Penandatangan</th>
                  <th>Status</th>
                  <th>Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {recentDocuments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-0">
                      <div className="flex w-full min-h-[160px] items-center justify-center p-6 text-sm text-neutral-gray text-center">Belum ada aktivitas dokumen.</div>
                    </td>
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
                        ? "Selesai"
                        : variant === "pending"
                          ? "Tertunda"
                          : variant === "rejected"
                            ? "Ditolak"
                            : "Draf";
                    const ext = doc.filename.includes(".") ? doc.filename.split(".").pop()?.toUpperCase() : "BERKAS";
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
                          <p className={styles.docMeta}>{formatStatus(doc.status)} - {ext}</p>
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
                <div className={styles.cardTitle}>Aksi Cepat</div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.quickGrid}>
                  <button type="button" onClick={() => { setActiveSection("analysis"); setActiveNav("Analisis Dokumen"); }} className={styles.quickBtn}>
                    <span className={`${styles.quickIcon} ${styles.quickIconBlue}`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </span>
                    <p className={styles.quickName}>Unggah Dok</p>
                    <p className={styles.quickDesc}>PDF atau DOCX</p>
                  </button>

                  <a
                    href="#"
                    className={styles.quickBtn}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveSection("documents");
                      setActiveNav("Pusat Dokumen");
                    }}
                  >
                    <span className={`${styles.quickIcon} ${styles.quickIconGreen}`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </span>
                    <p className={styles.quickName}>Tanda Tangan</p>
                    <p className={styles.quickDesc}>Dokumen tertunda</p>
                  </a>

                  <a
                    href="#"
                    className={styles.quickBtn}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveSection("consultation");
                      setActiveNav("Konsultasi");
                    }}
                  >
                    <span className={`${styles.quickIcon} ${styles.quickIconAmber}`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </span>
                    <p className={styles.quickName}>Konsultasi</p>
                    <p className={styles.quickDesc}>Ahli hukum</p>
                  </a>

                  <a
                    href="#"
                    className={styles.quickBtn}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveSection("account");
                      setActiveNav("Pengaturan Akun");
                    }}
                  >
                    <span className={`${styles.quickIcon} ${styles.quickIconPurple}`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </span>
                    <p className={styles.quickName}>Pengaturan</p>
                    <p className={styles.quickDesc}>Akun & paket</p>
                  </a>
                </div>
              </div>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>Penggunaan Paket</div>
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
                <p className={styles.cardTitle}>Volume Penandatanganan</p>
                <p className={styles.cardSub}>7 hari terakhir</p>
              </div>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.chartArea}>
                {chartRows.map((height, index) => (
                  <div key={index} className={styles.chartBarWrap}>
                    <div
                      className={`${styles.chartBar} ${index === 6 ? styles.chartBarPrimary : styles.chartBarLight}`}
                      style={{ height: `${height}%` }}
                      data-val={String(Math.round(chartCounts[index]))}
                      title={`${chartCounts[index]} dokumen`}
                    />
                    <div className={styles.chartLabel}>{chartLabels[index]}</div>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>Aktivitas Terbaru</div>
              <a
                href="#"
                className={styles.cardLink}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveSection("documents");
                  setActiveNav("Pusat Dokumen");
                }}
              >
                Lihat semua
              </a>
            </div>
            <div className={`${styles.cardBody} ${styles.cardBodyCompact}`}>
              <div className={styles.activityList}>
                {feedItems.length === 0 ? (
                  <div className="flex w-full min-h-[160px] items-center justify-center p-6 text-sm text-neutral-gray text-center">Belum ada aktivitas.</div>
                ) : (
                  feedItems.map((event, index) => {
                    const actor = toDisplayName(event.actor_email, "Sistem");
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
                <p className={styles.cardTitle}>Menunggu Penandatangan</p>
                <p className={styles.cardSub}>Membutuhkan perhatian</p>
              </div>
              <span className={styles.pendingPill}>{pendingRows.length} tertunda</span>
            </div>
            <div className={`${styles.cardBody} ${styles.cardBodyCompact}`}>
              <div className={styles.signerList}>
                {pendingRows.length === 0 ? (
                  <div className="flex w-full min-h-[160px] items-center justify-center p-6 text-sm text-neutral-gray text-center">Tidak ada penandatangan yang tertunda.</div>
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

  function renderAnalysisPanel() {
    const analysisDocuments = documents.filter((doc) => Boolean(doc.analysis_id));

    const handleAnalysisDrop = (e: React.DragEvent) => { e.preventDefault(); setAnalysisDragOver(false); const f = e.dataTransfer.files[0]; if (f && f.type === "application/pdf") { setAnalysisFile(f); setError(null); setAnalysisResult(null); } else { setError("Hanya file PDF yang didukung."); } };
    const handleAnalysisFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) { setAnalysisFile(f); setError(null); setAnalysisResult(null); } };

    const handleAnalyze = async () => {
      if (!analysisFile) return;
      setAnalysisRunning(true); setError(null); setAnalysisResult(null);
      try {
        const token = await getValidAccessToken(); if (!token) { clearSession(); router.replace("/login/"); return; }
        const fd = new FormData(); fd.append("file", analysisFile);
        const res = await fetch("/api/analyze", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
        if (!res.ok) { const err = await res.json().catch(() => ({ detail: "Gagal menganalisis." })); throw new Error(parseApiError(err, "Gagal menganalisis dokumen.")); }
        const data = await res.json();
        setPdfUrl(URL.createObjectURL(analysisFile));
        setAnalysisResult(data); setNotice("Analisis selesai!"); loadDocuments();
      } catch (err) { setError(err instanceof Error ? err.message : "Terjadi kesalahan."); } finally { setAnalysisRunning(false); }
    };

    const loadAnalysisResult = async (analysisId: string) => {
      setViewingAnalysisId(analysisId); setViewingAnalysisLoading(true); setViewingAnalysis(null); setPdfUrl(null);
      try {
        const data = await requestJson<AnalysisResponse>(`/api/analysis/${analysisId}`, { fallbackError: "Gagal memuat analisis." });
        setViewingAnalysis(data);

        // Fetch the PDF
        try {
          const res = await requestWithAuth(`/api/analysis/${analysisId}/pdf/`, { method: "GET" });
          if (res.ok) {
            const blob = await res.blob();
            setPdfUrl(URL.createObjectURL(blob));
          }
        } catch { /* PDF not available */ }
      } catch { /* ignore */ } finally { setViewingAnalysisLoading(false); }
    };

    const handleClauseSelect = (text: string | null, clauseIndex: number) => {
      if (text) {
        setHighlightText(text);
        setActiveClauseIndex(clauseIndex);
        const result = viewingAnalysis || analysisResult;
        const clause = (result?.clauses as any[])?.find((c: any) => c.clause_index === clauseIndex);
        if (clause) {
          const colorMap: Record<string, string> = {
            high: "rgba(239, 68, 68, 0.3)",
            medium: "rgba(245, 158, 11, 0.3)",
            low: "rgba(59, 130, 246, 0.3)",
            safe: "rgba(34, 197, 94, 0.3)",
          };
          setHighlightColor(colorMap[clause.risk_level] || "rgba(251, 146, 60, 0.35)");
        }
      } else {
        setHighlightText(null);
        setActiveClauseIndex(null);
      }
    };

    const handleReset = () => {
      setViewingAnalysisId(null);
      setViewingAnalysis(null);
      setAnalysisResult(null);
      setAnalysisFile(null);
      setPdfUrl(null);
      setChatOpen(false);
    };

    // If viewing a specific analysis result or just completed an analysis
    if (viewingAnalysisId || analysisResult) {
      const activeResult = viewingAnalysis || (analysisResult as unknown as AnalysisResponse);
      const isLoading = viewingAnalysisId && viewingAnalysisLoading;

      if (isLoading || !activeResult) {
        return (
          <section className="min-h-[60vh] flex items-center justify-center border border-border-light bg-white rounded-xl">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-2 border-primary-orange border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm text-neutral-gray">Memuat hasil analisis...</p>
            </div>
          </section>
        );
      }

      return (
        <section className="h-[calc(100vh-100px)] flex flex-col bg-white border border-border-light rounded-xl overflow-hidden relative">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-light bg-gray-50/50">
            <div>
              <p className="text-sm font-semibold text-dark-navy">Hasil Analisis</p>
              <p className="text-xs text-neutral-gray">{activeResult.filename || "Dokumen"}</p>
            </div>
            <button type="button" onClick={handleReset} className={styles.actionBtn}>
              Analisis Baru
            </button>
          </div>

          <div className="flex-1 flex flex-col md:flex-row min-h-0 relative">
            {/* Left panel */}
            <div className="w-full md:w-[60%] overflow-y-auto border-b md:border-b-0 md:border-r border-border-light min-h-0 flex-1 md:flex-none p-4 lg:p-6 bg-light-cream">
              {pdfUrl && (
                <div className="md:hidden mb-3">
                  <a href={pdfUrl} download={activeResult.filename || "dokumen.pdf"} className="flex items-center justify-center gap-2 w-full py-2 bg-dark-navy text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors">
                    📄 Lihat PDF
                  </a>
                </div>
              )}
              <AnalysisResults
                result={activeResult}
                onReset={handleReset}
                onClauseSelect={handleClauseSelect}
                activeClauseIndex={activeClauseIndex}
              />
            </div>

            {/* Right panel */}
            {pdfUrl ? (
              <div className="hidden md:block md:w-[40%] bg-gray-100 min-h-0 relative">
                <PdfViewer
                  pdfUrl={pdfUrl}
                  highlightText={highlightText}
                  highlightColor={highlightColor}
                />
              </div>
            ) : (
              <div className="hidden md:flex md:w-[40%] items-center justify-center bg-gray-50">
                <p className="text-neutral-gray text-sm">PDF tidak tersedia</p>
              </div>
            )}
          </div>

          {/* Chat Panel placed absolutely within this container wrapper */}
          <div className="absolute inset-y-0 right-0 z-50 overflow-hidden pointer-events-none" style={{ width: '100%', maxWidth: '400px' }}>
             <ChatPanel
                analysisId={activeResult.analysis_id}
                analysisResult={activeResult}
                isOpen={chatOpen}
                onToggle={() => setChatOpen(!chatOpen)}
                initialRemainingChats={activeResult.remaining_chats ?? null}
             />
          </div>
        </section>
      );
    }

    return (
      <section className="space-y-4">
        {/* Upload + Analyze */}
        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <div><p className={styles.cardTitle}>Analisis Dokumen</p><p className={styles.cardSub}>Unggah kontrak PDF untuk dianalisis oleh AI.</p></div>
          </div>
          <div className={styles.cardBody}>
            {!analysisFile && !analysisRunning && (
              <div className={`${styles.uploadZone} ${analysisDragOver ? styles.uploadZoneActive : ""}`} onDragOver={(e) => { e.preventDefault(); setAnalysisDragOver(true); }} onDragLeave={() => setAnalysisDragOver(false)} onDrop={handleAnalysisDrop} onClick={() => document.getElementById("analysis-file-input")?.click()}>
                <input id="analysis-file-input" type="file" accept=".pdf" onChange={handleAnalysisFileSelect} style={{ display: "none" }} />
                <div className={styles.uploadIcon}><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
                <p className={styles.uploadTitle}>Tarik &amp; lepas PDF atau klik untuk unggah</p>
                <p className={styles.uploadHint}>Maksimal 20MB - Hanya file PDF</p>
              </div>
            )}
            {analysisFile && !analysisRunning && (
              <div className={styles.signFormWrap}>
                <div className={styles.filePreview}>
                  <div className={styles.fileIcon}><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
                  <div className={styles.fileInfo}><p className={styles.fileName}>{analysisFile.name}</p><p className={styles.fileMeta}>{(analysisFile.size / (1024*1024)).toFixed(1)} MB - PDF</p></div>
                  <button type="button" className={styles.fileRemove} onClick={() => { setAnalysisFile(null); setError(null); }}>&times;</button>
                </div>
                <button type="button" onClick={handleAnalyze} className={styles.signBtn} style={{ marginTop: 12 }}>Analisis Sekarang</button>
              </div>
            )}
            {analysisRunning && (
              <div style={{ textAlign: "center", padding: 32 }}>
                <div className={styles.spinner} style={{ width: 32, height: 32, borderWidth: 3, margin: "0 auto 12px" }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Menganalisis dokumen...</p>
                <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Proses ini memakan waktu sekitar 15 detik.</p>
              </div>
            )}

          </div>
        </article>

        {/* Previous analysis results */}
        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <div><p className={styles.cardTitle}>Riwayat Analisis</p><p className={styles.cardSub}>Dokumen yang sudah pernah dianalisis.</p></div>
          </div>
          <div className={styles.cardBody}>
            {analysisDocuments.length === 0 ? (
              <div className="flex w-full min-h-[160px] items-center justify-center p-6 text-sm text-neutral-gray text-center">Belum ada hasil analisis. Unggah dokumen di atas untuk memulai.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {analysisDocuments.slice(0, 20).map((doc) => (
                  <div key={doc.document_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "1px solid #f0f0f0", borderRadius: 10, background: "#fafbfc" }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.filename}</p>
                      <p style={{ fontSize: 11, color: "#94a3b8" }}>ID: {doc.analysis_id} - {formatDateTime(doc.updated_at)}</p>
                    </div>
                    <button type="button" onClick={() => loadAnalysisResult(doc.analysis_id!)} className={styles.actionBtn}>Lihat Hasil</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>
      </section>
    );
  }

  function renderSignPanel() {
    // --- Helpers ---
    const handleFileDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f && f.type === "application/pdf") { setSignFile(f); setSignResult(null); setError(null); } else { setError("Hanya file PDF yang didukung."); } };
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) { setSignFile(f); setSignResult(null); setError(null); } };
    const formatFileSize = (b: number) => b < 1024 ? `${b} B` : b < 1024*1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/(1024*1024)).toFixed(1)} MB`;

    const handleQuickSign = async () => {
      if (!signFile || !signatureImage || signaturePositions.length === 0) return;
      const name = signQuickName.trim() || profile?.name || "";
      if (!name) { setError("Nama penandatangan wajib diisi."); return; }
      setSigningInProgress(true); setError(null); setSignResult(null);
      try {
        const token = await getValidAccessToken(); if (!token) { clearSession(); router.replace("/login/"); return; }
        
        // Create FormData with PDF, signature image, and positions
        const fd = new FormData();
        fd.append("pdf_file", signFile);
        fd.append("signature_image", await fetch(signatureImage).then(r => r.blob()), "signature.png");
        fd.append("positions_json", JSON.stringify(signaturePositions));
        fd.append("signer_name", name);
        
        const res = await fetch("/api/signatures/apply", { 
          method: "POST", 
          headers: { Authorization: `Bearer ${token}` }, 
          body: fd 
        });
        
        if (!res.ok) { 
          const err = await res.json().catch(() => ({ detail: "Gagal menandatangani." })); 
          throw new Error(parseApiError(err, "Gagal menandatangani dokumen."));
        }
        
        const result = await res.json();
        
        // Convert base64 to blob and download
        const binaryString = atob(result.signed_pdf);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) { bytes[i] = binaryString.charCodeAt(i); }
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        
        setSignResult({ url, filename: result.filename, documentId: "" });
        setNotice("Dokumen berhasil ditandatangani!"); 
        loadDocuments();
      } catch (err) { 
        setError(err instanceof Error ? err.message : "Terjadi kesalahan."); 
      } finally { 
        setSigningInProgress(false); 
      }
    };

    const loadSignPanelDoc = async (docId: string) => {
      setSignPanelDocId(docId); setSignPanelLoading(true); setSignPanelSigners(null); setSignPanelEvents(null);
      try {
        const [signers, events] = await Promise.all([
          requestJson<DocumentSignersResponse>(`/api/documents/${docId}/signers`, { fallbackError: "Gagal memuat signer." }),
          requestJson<DocumentEventsResponse>(`/api/documents/${docId}/events`, { fallbackError: "Gagal memuat events." }),
        ]);
        setSignPanelSigners(signers); setSignPanelEvents(events);
        setSignPanelForm((prev) => ({ ...prev, signerName: profile?.name || "" }));
      } catch { /* ignore */ } finally { setSignPanelLoading(false); }
    };

    const handlePanelSign = async (e: FormEvent) => {
      e.preventDefault(); if (!signPanelDocId) return;
      setSignPanelProcessing(true);
      try {
        await requestJson<DocumentActionResponse>(`/api/documents/${signPanelDocId}/sign`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signer_name: signPanelForm.signerName, consent_text: signPanelForm.consentText, document_hash: signPanelForm.documentHash || "consent-only" }),
          fallbackError: "Gagal menandatangani.",
        });
        setNotice("Berhasil menandatangani!"); loadDocuments(); loadSignPanelDoc(signPanelDocId);
      } catch (err) { setError(err instanceof Error ? err.message : "Gagal."); } finally { setSignPanelProcessing(false); }
    };

    const handlePanelReject = async (e: FormEvent) => {
      e.preventDefault(); if (!signPanelDocId) return;
      setSignPanelProcessing(true);
      try {
        await requestJson<DocumentActionResponse>(`/api/documents/${signPanelDocId}/reject`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: signPanelRejectReason || null }),
          fallbackError: "Gagal menolak.",
        });
        setNotice("Dokumen berhasil ditolak."); loadDocuments(); loadSignPanelDoc(signPanelDocId);
      } catch (err) { setError(err instanceof Error ? err.message : "Gagal."); } finally { setSignPanelProcessing(false); }
    };

    const handlePanelVisualSign = async () => {
      if (!signPanelDocId || !panelSignatureImage || panelSignaturePositions.length === 0 || !panelDoc) return;
      const name = signPanelForm.signerName.trim() || profile?.name || "";
      if (!name) { setError("Nama penandatangan wajib diisi."); return; }
      setSignPanelProcessing(true); setError(null);
      try {
        const token = await getValidAccessToken(); if (!token) { clearSession(); router.replace("/login/"); return; }
        
        // Fetch PDF from document
        const pdfRes = await fetch(`/api/documents/${signPanelDocId}/pdf`, { 
          headers: { Authorization: `Bearer ${token}` } 
        });
        if (!pdfRes.ok) throw new Error("Gagal memuat dokumen PDF.");
        const pdfBlob = await pdfRes.blob();
        
        // Create FormData with PDF, signature, and positions
        const fd = new FormData();
        fd.append("pdf_file", pdfBlob, "document.pdf");
        fd.append("signature_image", await fetch(panelSignatureImage).then(r => r.blob()), "signature.png");
        fd.append("positions_json", JSON.stringify(panelSignaturePositions));
        fd.append("signer_name", name);
        
        const res = await fetch("/api/signatures/apply", { 
          method: "POST", 
          headers: { Authorization: `Bearer ${token}` }, 
          body: fd 
        });
        
        if (!res.ok) { 
          const err = await res.json().catch(() => ({ detail: "Gagal menandatangani." })); 
          throw new Error(parseApiError(err, "Gagal menandatangani dokumen."));
        }
        
        const result = await res.json();
        
        // Save the signed PDF back to the document
        const signedFd = new FormData();
        const binaryString = atob(result.signed_pdf);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) { bytes[i] = binaryString.charCodeAt(i); }
        const signedBlob = new Blob([bytes], { type: "application/pdf" });
        signedFd.append("signed_pdf", signedBlob, result.filename);
        signedFd.append("signer_name", name);
        
        await fetch(`/api/documents/${signPanelDocId}/sign-visual`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: signedFd
        });
        
        setNotice("Dokumen berhasil ditandatangani!"); 
        setPanelSignatureImage(null);
        setPanelSignaturePositions([]);
        setPanelShowPdfSigner(false);
        loadDocuments(); 
        loadSignPanelDoc(signPanelDocId);
      } catch (err) { 
        setError(err instanceof Error ? err.message : "Terjadi kesalahan."); 
      } finally { 
        setSignPanelProcessing(false); 
      }
    };

    const handleOpenSigningPage = () => {
      if (!signPanelDocId || !panelSignatureName || !panelCanSign) return;
      // Store signature data in sessionStorage for new tab
      const sigData = {
        name: panelSignatureName,
        type: panelSignatureType,
        content: panelSignatureImage,
      };
      sessionStorage.setItem(`sig_data_${signPanelDocId}`, JSON.stringify(sigData));
      // Open new tab for full-screen signing
      window.open(`/dashboard/sign/${signPanelDocId}`, '_blank');
    };

    const handleShareSubmit = async (e: FormEvent) => {
      e.preventDefault(); setSignShareProcessing(true);
      try {
        const selectedDoc = documents.find((d) => d.document_id === signShareForm.selectedDocId);
        await requestJson<ShareDocumentResponse>("/api/documents/share", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: selectedDoc?.filename || signShareForm.filename, analysis_id: selectedDoc?.analysis_id || null,
            signer_emails: signShareForm.signerEmails.split(",").map((s) => s.trim()).filter(Boolean),
            company_pays_analysis: signShareForm.companyPaysAnalysis, expires_at: signShareForm.expiresAt || null,
          }),
          fallbackError: "Gagal membagikan dokumen.",
        });
        setNotice("Dokumen berhasil dikirim untuk ditandatangani!"); loadDocuments();
        setSignShareForm({ selectedDocId: "", filename: "", signerEmails: "", companyPaysAnalysis: false, expiresAt: "" });
        setSignActiveTab("list");
      } catch (err) { setError(err instanceof Error ? err.message : "Gagal."); } finally { setSignShareProcessing(false); }
    };

    const panelDoc = signPanelDocId ? documents.find((d) => d.document_id === signPanelDocId) : null;
    const canSign = panelDoc && (
      (panelDoc.status === "analyzed" && panelDoc.my_signer_role === "sender") ||
      panelDoc.my_signer_status === "pending"
    );
    const canReject = panelDoc && panelDoc.my_signer_status === "pending";
    const isCompleted = panelDoc?.status === "completed";

    const tabClass = (t: string) => `${styles.signTab} ${signActiveTab === t ? styles.signTabActive : ""}`;

    return (
      <section>
        {/* Tab Navigation */}
        <div className={styles.signTabs}>
          <button type="button" className={tabClass("list")} onClick={() => setSignActiveTab("list")}>
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Dokumen Saya
          </button>
          <button type="button" className={tabClass("quick")} onClick={() => setSignActiveTab("quick")}>
            <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Tanda Tangan Cepat
          </button>
          <button type="button" className={tabClass("share")} onClick={() => setSignActiveTab("share")}>
            <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Bagikan Dokumen
          </button>
        </div>

        {/* Tab 1: Dokumen Saya */}
        {signActiveTab === "list" && (
          <div className={styles.twoCol}>
            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <div><p className={styles.cardTitle}>Daftar Dokumen</p><p className={styles.cardSub}>Semua dokumen — tanda tangani, lacak status, dan unduh.</p></div>
                <button type="button" onClick={() => loadDocuments()} className={styles.actionBtn}>Muat Ulang</button>
              </div>
              <div className={styles.cardBody} style={{ padding: 0 }}>
                {documents.length === 0 ? (
                  <div className="flex w-full min-h-[200px] items-center justify-center p-6 text-sm text-neutral-gray text-center">Belum ada dokumen. Gunakan &quot;Tanda Tangan Cepat&quot; atau &quot;Bagikan Dokumen&quot; untuk memulai.</div>
                ) : (
                  <table className={styles.table}>
                    <thead><tr><th>Dokumen</th><th>Status</th><th>Peran</th><th>Progress</th><th>Updated</th></tr></thead>
                    <tbody>
                      {documents.map((doc) => (
                        <tr key={doc.document_id} onClick={() => loadSignPanelDoc(doc.document_id)} style={{ cursor: "pointer", background: signPanelDocId === doc.document_id ? "#f8fafc" : undefined }}>
                          <td><span className={styles.docName}>{doc.filename}</span></td>
                          <td><span className={`${styles.badge} ${styles[`badge${statusVariant(doc.status).charAt(0).toUpperCase() + statusVariant(doc.status).slice(1)}` as keyof typeof styles] || ""}`}>{formatStatus(doc.status)}</span></td>
                          <td style={{ fontSize: 12, color: "#64748b" }}>{doc.my_signer_role === "sender" ? "Pemilik" : "Penandatangan"}</td>
                          <td style={{ fontSize: 12, color: "#64748b" }}>{doc.signers_signed}/{doc.signers_total} ditandatangani</td>
                          <td style={{ fontSize: 12, color: "#94a3b8" }}>{formatShortDate(doc.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </article>

            {/* Detail Panel */}
            <article className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.cardTitle}>Detail &amp; Aksi</p></div></div>
              <div className={styles.cardBody}>
                {!panelDoc ? (
                  <div className="flex w-full min-h-[250px] items-center justify-center p-6 text-sm text-neutral-gray text-center">Pilih dokumen untuk melihat detail.</div>
                ) : signPanelLoading ? (
                  <p style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: 24 }}>Memuat...</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Doc info */}
                    <div style={{ padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{panelDoc.filename}</p>
                      <p style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Status: {formatStatus(panelDoc.status)} - {panelDoc.signers_signed}/{panelDoc.signers_total} tanda tangan</p>
                    </div>

                    {/* Signers list */}
                    {signPanelSigners && (
                      <div>
                        <p className={styles.signLabel} style={{ marginBottom: 8 }}>Penandatangan</p>
                        <div className={styles.signerList}>
                          {signPanelSigners.signers.map((s) => (
                            <div key={s.email} className={styles.signerRow}>
                              <span className={`${styles.docAvatar} ${s.status === "signed" ? styles.docAvatarGreen : s.status === "rejected" ? styles.docAvatarAmber : styles.docAvatarBlue}`}>{toInitials(s.name || s.email)}</span>
                              <div className={styles.signerInfo}><p className={styles.signerName}>{s.name || s.email}</p><p className={styles.signerEmail}>{s.email} - {s.role === "sender" ? "Pemilik" : "Penandatangan"}</p></div>
                              <span className={`${styles.badge} ${s.status === "signed" ? styles.badgeSigned : s.status === "rejected" ? styles.badgeRejected : styles.badgePending}`}>{s.status === "signed" ? "Telah TTD" : s.status === "rejected" ? "Ditolak" : "Tertunda"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sign form - NEW Signature Creator Flow */}
                    {canSign && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
                        {!panelCanSign ? (
                          <>
                            <SignatureCreator 
                              onSignatureCreated={(sig) => {
                                setPanelSignatureName(sig.displayName);
                                setPanelSignatureType(sig.type);
                                setPanelSignatureImage(sig.content);
                              }}
                              onCanSignChange={setPanelCanSign}
                            />
                          </>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div style={{ padding: "12px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", fontSize: 13, color: "#166534" }}>✓ Tanda tangan siap</div>
                            <p style={{ fontSize: 12, color: "#64748b" }}><strong>Nama:</strong> {panelSignatureName}</p>
                            <button type="button" onClick={handleOpenSigningPage} className={styles.signBtn}>
                              Buka Editor Penandatanganan
                            </button>
                            <button type="button" onClick={() => { setPanelCanSign(false); setPanelSignatureName(""); setPanelSignatureType(null); setPanelSignatureImage(null); }} className={styles.signBtn} style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db" }}>
                              Buat Tanda Tangan Baru
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Reject form */}
                    {canReject && (
                      <form onSubmit={handlePanelReject} style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
                        <p className={styles.signLabel} style={{ color: "#dc2626" }}>Tolak Dokumen</p>
                        <input type="text" placeholder="Alasan penolakan (opsional)" value={signPanelRejectReason} onChange={(e) => setSignPanelRejectReason(e.target.value)} className={styles.signInput} />
                        <button type="submit" disabled={signPanelProcessing} className={styles.signBtn} style={{ background: "#dc2626", boxShadow: "0 2px 8px rgba(220,38,38,0.2)", alignSelf: "flex-start" }}>
                          {signPanelProcessing ? "Menolak..." : "Tolak Dokumen"}
                        </button>
                      </form>
                    )}

                    {/* Download buttons for completed */}
                    {isCompleted && (
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <a href={`/api/documents/${panelDoc.document_id}/certificate/pdf`} target="_blank" rel="noopener" className={styles.downloadBtn}>Sertifikat</a>
                        <a href={`/api/documents/${panelDoc.document_id}/signed-pdf`} target="_blank" rel="noopener" className={styles.downloadBtn} style={{ background: "#1a56e8" }}>PDF Hasil TTD</a>
                      </div>
                    )}

                    {/* Audit trail */}
                    {signPanelEvents && signPanelEvents.events.length > 0 && (
                      <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
                        <p className={styles.signLabel}>Audit Trail</p>
                        <div className={styles.activityList}>
                          {signPanelEvents.events.slice(0, 8).map((ev) => (
                            <div key={ev.id} className={styles.activityItem}>
                              <div className={styles.activityDotWrap}><div className={`${styles.activityDot} ${ev.event_type === "signed" || ev.event_type === "quick_signed" ? styles.dotGreen : ev.event_type === "rejected" ? styles.dotRed : styles.dotBlue}`}/><div className={styles.activityLine}/></div>
                              <div className={styles.activityContent}><p className={styles.activityText}><b>{ev.event_type.replace(/_/g, " ")}</b> oleh {toDisplayName(ev.actor_email)}</p><p className={styles.activityTime}>{formatDateTime(ev.created_at)}</p></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </article>
          </div>
        )}

        {/* Tab 2: Tanda Tangan Cepat */}
        {signActiveTab === "quick" && (
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div><p className={styles.cardTitle}>Tanda Tangan Cepat</p><p className={styles.cardSub}>Unggah PDF dan tanda tangani langsung dengan sertifikat digital.</p></div>
            </div>
            <div className={styles.cardBody}>
              {!signFile && !signResult && (
                <div className={`${styles.uploadZone} ${dragOver ? styles.uploadZoneActive : ""}`} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleFileDrop} onClick={() => document.getElementById("sign-file-input")?.click()}>
                  <input id="sign-file-input" type="file" accept=".pdf" onChange={handleFileSelect} style={{ display: "none" }} />
                  <div className={styles.uploadIcon}><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
                  <p className={styles.uploadTitle}>Tarik &amp; lepas PDF atau klik untuk unggah</p>
                  <p className={styles.uploadHint}>Maksimal 20MB - Hanya file PDF</p>
                </div>
              )}
              {signFile && !showPdfSigner && !signResult && (
                <div className={styles.signFormWrap}>
                  <div className={styles.filePreview}>
                    <div className={styles.fileIcon}><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
                    <div className={styles.fileInfo}><p className={styles.fileName}>{signFile.name}</p><p className={styles.fileMeta}>{formatFileSize(signFile.size)} - PDF</p></div>
                    <button type="button" className={styles.fileRemove} onClick={() => { setSignFile(null); setSignatureImage(null); setSignaturePositions([]); setError(null); }}>&times;</button>
                  </div>
                  <div className={styles.signFields}>
                    <div><label className={styles.signLabel}>Nama Penandatangan</label><input type="text" value={signQuickName} onChange={(e) => setSignQuickName(e.target.value)} placeholder={profile?.name || "Nama lengkap"} className={styles.signInput} /></div>
                    {!signatureImage && <SignaturePad onSignatureChange={setSignatureImage} />}
                    {signatureImage && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ padding: "12px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", fontSize: 13, color: "#166534" }}>✓ Tanda tangan siap</div>
                        <button type="button" onClick={() => setShowPdfSigner(true)} className={styles.signBtn}>Lanjut ke Pemosisian</button>
                        <button type="button" onClick={() => { setSignatureImage(null); setSignaturePositions([]); }} className={styles.signBtn} style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db" }}>Ganti Tanda Tangan</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {signFile && showPdfSigner && signatureImage && !signResult && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "600px" }}>
                  <PdfSigningViewer
                    pdfUrl={URL.createObjectURL(signFile)}
                    signatureImage={signatureImage}
                    onPositionsChange={setSignaturePositions}
                    onClose={() => setShowPdfSigner(false)}
                  />
                  <div className={styles.consentBox}><svg viewBox="0 0 24 24" className={styles.consentIcon}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><p>Saya menyetujui penandatanganan elektronik dokumen ini secara sah.</p></div>
                  <button type="button" onClick={handleQuickSign} disabled={signingInProgress || signaturePositions.length === 0} className={styles.signBtn}>
                    {signingInProgress ? <><span className={styles.spinner}/>Menandatangani...</> : <>Tanda Tangani Sekarang</>}
                  </button>
                </div>
              )}
              {signResult && (
                <div className={styles.signSuccess}>
                  <div className={styles.successIcon}><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
                  <p className={styles.successTitle}>Dokumen Berhasil Ditandatangani!</p>
                  <p className={styles.successSub}>Sertifikat digital telah ditambahkan ke dalam PDF Anda.</p>
                  <div className={styles.successActions}>
                    <a href={signResult.url} download={signResult.filename} className={styles.downloadBtn}><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Unduh</a>
                    <button type="button" className={styles.signAgainBtn} onClick={() => { setSignFile(null); setSignResult(null); setError(null); setSignQuickName(""); setSignatureImage(null); setSignaturePositions([]); setShowPdfSigner(false); }}>Tanda Tangani Lagi</button>
                  </div>
                </div>
              )}

            </div>
          </article>
        )}

        {/* Tab 3: Bagikan Dokumen */}
        {signActiveTab === "share" && (
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div><p className={styles.cardTitle}>Bagikan Dokumen untuk Ditandatangani</p><p className={styles.cardSub}>Pilih dokumen, tambahkan penerima, dan kirim untuk co-sign.</p></div>
            </div>
            <div className={styles.cardBody}>
              <form onSubmit={handleShareSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label className={styles.signLabel}>Pilih Dokumen</label>
                  <select value={signShareForm.selectedDocId} onChange={(e) => { const doc = documents.find((d) => d.document_id === e.target.value); setSignShareForm((f) => ({ ...f, selectedDocId: e.target.value, filename: doc?.filename || "" })); }} className={styles.signInput} style={{ appearance: "auto" }} required>
                    <option value="">-- Pilih dokumen yang akan dibagikan --</option>
                    {documents.filter((d) => d.my_signer_role === "sender").map((doc) => (
                      <option key={doc.document_id} value={doc.document_id}>{doc.filename} {doc.analysis_id ? "(sudah dianalisis)" : ""}</option>
                    ))}
                  </select>
                  {!documents.some((d) => d.my_signer_role === "sender") && (
                    <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>Belum ada dokumen milik Anda. Gunakan &quot;Tanda Tangan Cepat&quot; untuk membuat dokumen terlebih dahulu.</p>
                  )}
                </div>
                {(() => { const sd = documents.find((d) => d.document_id === signShareForm.selectedDocId); return sd ? (
                  <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #f0f0f0", fontSize: 12, color: "#475569" }}>
                    <p><strong>Dokumen:</strong> {sd.filename}</p>
                    <p><strong>Status:</strong> {formatStatus(sd.status)} - {sd.signers_signed}/{sd.signers_total} ditandatangani</p>
                    {sd.analysis_id && <p style={{ color: "#059669" }}>Analisis AI terdeteksi otomatis</p>}
                  </div>
                ) : null; })()}
                <div><label className={styles.signLabel}>Email Penerima</label><input type="text" value={signShareForm.signerEmails} onChange={(e) => setSignShareForm((f) => ({ ...f, signerEmails: e.target.value }))} placeholder="nama@email.com, nama2@email.com" className={styles.signInput} required /><p style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Pisahkan beberapa email dengan koma</p></div>
                <div><label className={styles.signLabel}>Batas Waktu (opsional)</label><input type="datetime-local" value={signShareForm.expiresAt} onChange={(e) => setSignShareForm((f) => ({ ...f, expiresAt: e.target.value }))} className={styles.signInput} /></div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#475569", cursor: "pointer" }}>
                  <input type="checkbox" checked={signShareForm.companyPaysAnalysis} onChange={(e) => setSignShareForm((f) => ({ ...f, companyPaysAnalysis: e.target.checked }))} />
                  Dibayar Perusahaan -- tanggung biaya analisis AI untuk penerima
                </label>
                <button type="submit" disabled={signShareProcessing || !signShareForm.selectedDocId} className={styles.signBtn}>
                  {signShareProcessing ? <><span className={styles.spinner}/>Mengirim...</> : <>Kirim untuk Ditandatangani</>}
                </button>
              </form>
            </div>
          </article>
        )}
      </section>
    );
  }

  function renderConsultationPanel() {
    const analysisOptions = documents.filter((doc) => Boolean(doc.analysis_id));

    return (
      <section className="space-y-4">
        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardTitle}>Jadwalkan Konsultasi Hukum</p>
              <p className={styles.cardSub}>Kirim permintaan konsultasi ke tim ahli hukum TanyaHukum.</p>
            </div>
          </div>
          <div className={styles.cardBody}>
            <form onSubmit={submitConsultation} className="grid gap-3 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-gray">Nama Lengkap</label>
                <input
                  type="text"
                  value={consultForm.name}
                  onChange={(e) => setConsultForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-md border border-border-light px-3 py-2 text-sm text-dark-navy outline-none focus:border-dark-navy"
                  placeholder="Nama lengkap"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-gray">Email</label>
                <input
                  type="email"
                  value={consultForm.email}
                  onChange={(e) => setConsultForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full rounded-md border border-border-light px-3 py-2 text-sm text-dark-navy outline-none focus:border-dark-navy"
                  placeholder="nama@email.com"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-gray">WhatsApp</label>
                <input
                  type="text"
                  value={consultForm.whatsapp}
                  onChange={(e) => setConsultForm((prev) => ({ ...prev, whatsapp: e.target.value }))}
                  className="w-full rounded-md border border-border-light px-3 py-2 text-sm text-dark-navy outline-none focus:border-dark-navy"
                  placeholder="+62 8xx xxxx xxxx"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-gray">Terkait Analysis ID (Opsional)</label>
                <select
                  value={consultForm.analysisId}
                  onChange={(e) => setConsultForm((prev) => ({ ...prev, analysisId: e.target.value }))}
                  className="w-full rounded-md border border-border-light px-3 py-2 text-sm text-dark-navy outline-none focus:border-dark-navy"
                >
                  <option value="">Tanpa analysis ID</option>
                  {analysisOptions.map((doc) => (
                    <option key={doc.document_id} value={doc.analysis_id || ""}>
                      {doc.filename} ({doc.analysis_id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <button
                  type="submit"
                  disabled={consultSubmitting}
                  className="rounded-md bg-dark-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {consultSubmitting ? "Mengirim..." : "Kirim Permintaan Konsultasi"}
                </button>
              </div>
            </form>
          </div>
        </article>
      </section>
    );
  }

  function renderDocumentsPanel() {
    return (
      <section className="space-y-4">
        <article className="border-b border-border-light bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-gray">Pusat Dokumen</h2>
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
                  Perusahaan Tanggung Biaya Analisis
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
                    <th className="px-4 py-2 sm:px-5">Penandatangan</th>
                    <th className="px-4 py-2 sm:px-5">Peran Anda</th>
                    <th className="px-4 py-2 sm:px-5">Diperbarui</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <div className="flex w-full min-h-[160px] items-center justify-center p-6 text-sm text-neutral-gray text-center">Belum ada dokumen kolaborasi.</div>
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
                            {doc.signers_signed}/{doc.signers_total} selesai
                          </td>
                          <td className="px-4 py-3 sm:px-5 text-dark-navy">
                            {doc.my_signer_role === "sender" ? "Pemilik" : doc.my_signer_role === "recipient" ? "Penandatangan" : "-"} / {doc.my_signer_status === "signed" ? "Telah TTD" : doc.my_signer_status === "rejected" ? "Ditolak" : doc.my_signer_status === "pending" ? "Tertunda" : "-"}
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
              <div className="flex w-full min-h-[300px] items-center justify-center p-6 text-sm text-neutral-gray text-center">Pilih dokumen untuk melihat detail.</div>
            ) : (
              <div className="space-y-4 px-4 py-4 sm:px-5">
                <div className="space-y-1 border-b border-border-light pb-3">
                  <p className="text-sm font-semibold text-dark-navy">{selectedDocument.filename}</p>
                  <p className="text-xs text-neutral-gray">Diperbarui {formatDateTime(selectedDocument.updated_at)}</p>
                  <p className="text-xs text-neutral-gray">
                    {signedCount}/{totalSignerCount} penandatangan selesai
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => loadDocumentDetails(selectedDocument.document_id, selectedDocument.status)}
                    disabled={loadingDocumentDetails}
                    className="rounded-md border border-border-light px-3 py-1.5 text-xs font-semibold text-dark-navy hover:border-dark-navy/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingDocumentDetails ? "Memuat..." : "Muat Ulang Detail"}
                  </button>
                    <button
                      type="button"
                      onClick={() => { setActiveSection("analysis"); setActiveNav("Analisis Dokumen"); if (selectedDocument.analysis_id) { setViewingAnalysisId(selectedDocument.analysis_id); } }}
                      className="rounded-md border border-border-light px-3 py-1.5 text-xs font-semibold text-dark-navy hover:border-dark-navy/40"
                    >
                      Buka Analisis
                    </button>
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
                        PDF Hasil TTD
                      </button>
                    </>
                  ) : null}
                </div>

                <div className="grid gap-3 border-b border-border-light pb-4">
                  <form onSubmit={submitSign} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-gray">Aksi Tanda Tangan</p>
                    <input
                      type="text"
                      value={signForm.signerName}
                      onChange={(e) => setSignForm((prev) => ({ ...prev, signerName: e.target.value }))}
                      className="w-full rounded-md border border-border-light px-3 py-2 text-sm outline-none focus:border-dark-navy"
                      placeholder="Nama penandatangan"
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
                      placeholder="Hash dokumen"
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
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-gray">Aksi Tolak</p>
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



                <div className="grid gap-3">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-gray">Penandatangan</p>
                    <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                      {(selectedSigners?.signers || []).length === 0 ? (
                        <div className="flex w-full min-h-[100px] items-center justify-center p-4 text-xs text-neutral-gray text-center">Belum ada data signer.</div>
                      ) : (
                        selectedSigners?.signers.map((signer) => (
                          <div key={`${signer.email}-${signer.role}`} className="border-b border-border-light px-3 py-2 last:border-b-0">
                            <p className="text-xs font-medium text-dark-navy">{signer.email}</p>
                            <p className="text-[11px] text-neutral-gray">
                              {signer.role === "sender" ? "Pemilik" : "Penandatangan"} &bull; {signer.status === "signed" ? "Telah TTD" : signer.status === "rejected" ? "Ditolak" : "Tertunda"}
                              {signer.signed_at ? ` \u2022 ${formatDateTime(signer.signed_at)}` : ""}
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
                              {event.actor_email || "sistem"} &bull; {formatDateTime(event.created_at)}
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
                              {signature.signer_email} &bull; {formatDateTime(signature.signed_at)}
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
                  <td className="px-4 py-3 text-neutral-gray sm:px-5">Paket</td>
                  <td className="px-4 py-3 font-medium text-dark-navy sm:px-5">{profile ? formatPlan(profile.plan) : "-"}</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-neutral-gray sm:px-5">ID Pengguna</td>
                  <td className="px-4 py-3 font-medium text-dark-navy sm:px-5">{profile?.user_id || "-"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <article className="border-b border-border-light bg-white p-4 sm:p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-gray">Langkah Lanjutan</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setActiveSection("analysis"); setActiveNav("Analisis Dokumen"); }}
              className="border border-border-light px-3 py-2 text-sm font-medium text-dark-navy hover:border-dark-navy/40"
            >
              Analisis Dokumen Baru
            </button>
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
          <Link href="/" className="flex-shrink-0">
            <img src="/logo.svg" alt="TanyaHukum" className={styles.logoImg} />
            <img src="/favicon.svg" alt="TanyaHukum" className={styles.faviconImg} />
          </Link>
        </div>

        <button
          type="button"
          className={styles.sidebarToggle}
          onClick={() => setSidebarCollapsed((prev) => !prev)}
          title={sidebarCollapsed ? "Perluas bilah sisi" : "Tutup bilah sisi"}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M7.5 9L4.5 6L7.5 3" />
          </svg>
        </button>

        <nav className={styles.nav}>
          <div className={styles.navSection}>
            <p className={styles.navLabel}>Ringkasan</p>
            <a
              href="#"
              className={navItemClass("Ringkasan")}
              onClick={(e) => {
                e.preventDefault();
                setActiveNav("Ringkasan");
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
              <span className={styles.navItemLabel}>Dasbor</span>
            </a>
          </div>

          <div className={styles.navSection}>
            <p className={styles.navLabel}>Dokumen</p>
            <a
              href="#"
              className={navItemClass("Analisis Dokumen")}
              onClick={(e) => {
                e.preventDefault();
                setActiveNav("Analisis Dokumen");
                setActiveSection("analysis");
              }}
            >
              <span className={styles.navIcon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </span>
              <span className={styles.navItemLabel}>Analisis Dokumen</span>
            </a>
            <a
              href="#"
              className={navItemClass("Tanda Tangan")}
              onClick={(e) => {
                e.preventDefault();
                setActiveNav("Tanda Tangan");
                setActiveSection("sign");
              }}
            >
              <span className={styles.navIcon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </span>
              <span className={styles.navItemLabel}>Tanda Tangan</span>
            </a>
          </div>

          <div className={styles.navSection}>
            <p className={styles.navLabel}>Kolaborasi</p>
            <a
              href="#"
              className={navItemClass("Pusat Dokumen")}
              onClick={(e) => {
                e.preventDefault();
                setActiveNav("Pusat Dokumen");
                setActiveSection("documents");
              }}
            >
              <span className={styles.navIcon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </span>
              <span className={styles.navItemLabel}>Pusat Dokumen</span>
              <span className={styles.navBadge}>{documentsMeta.pending_my_action}</span>
            </a>
            <a
              href="#"
              className={navItemClass("Konsultasi")}
              onClick={(e) => {
                e.preventDefault();
                setActiveNav("Konsultasi");
                setActiveSection("consultation");
              }}
            >
              <span className={styles.navIcon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span className={styles.navItemLabel}>Konsultasi</span>
            </a>
          </div>



          <div className={styles.navSection}>
            <p className={styles.navLabel}>Akun</p>
            <a
              href="#"
              className={navItemClass("Pengaturan Akun")}
              onClick={(e) => {
                e.preventDefault();
                setActiveNav("Pengaturan Akun");
                setActiveSection("account");
              }}
            >
              <span className={styles.navIcon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </span>
              <span className={styles.navItemLabel}>Pengaturan Akun</span>
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
            <button 
              type="button" 
              onClick={handleLogout}
              className="ml-auto p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="Keluar"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
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
              <input type="text" placeholder="Cari dokumen..." aria-label="Cari dokumen" />
            </label>

            <a href="#" className={styles.iconBtn} title="Notifikasi">
              <span className={styles.notifDot} />
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </a>

            <button type="button" onClick={() => { setActiveSection("analysis"); setActiveNav("Analisis Dokumen"); }} className={styles.primaryBtn}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Analisis Dokumen
            </button>
          </div>
        </header>

        <div className={styles.content}>
          {error && (
            <div className="fixed bottom-6 w-[90%] sm:w-auto sm:max-w-sm left-1/2 -translate-x-1/2 z-[100] px-5 py-3.5 bg-red-600 border border-red-500 text-white text-sm font-medium rounded-2xl shadow-[0_8px_30px_rgba(220,38,38,0.2)] flex items-center gap-3 animate-in slide-in-from-bottom-5">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-red-100">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="flex-1 leading-snug">{error}</span>
              <button type="button" onClick={() => setError(null)} className="shrink-0 p-1.5 text-white/70 hover:text-white hover:bg-red-500 rounded-full transition-colors" aria-label="Tutup">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}

          {notice && (
            <div className="fixed bottom-6 w-[90%] sm:w-auto sm:max-w-sm left-1/2 -translate-x-1/2 z-[100] px-5 py-3.5 bg-dark-navy text-white text-sm font-medium rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.2)] border border-light-cream/10 flex items-center gap-3 animate-in slide-in-from-bottom-5">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-green-400">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span className="flex-1 leading-snug">{notice}</span>
              <button type="button" onClick={() => setNotice(null)} className="shrink-0 p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors" aria-label="Tutup">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}

          {activeSection === "overview" && renderOverview()}
          {activeSection === "documents" && renderDocumentsPanel()}
          {activeSection === "analysis" && renderAnalysisPanel()}
          {activeSection === "sign" && renderSignPanel()}
          {activeSection === "consultation" && renderConsultationPanel()}
          {activeSection === "account" && renderAccountPanel()}
        </div>
      </section>
    </main>
  );
}
