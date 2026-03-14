"use client";

import type { ReactNode } from "react";

export type SidebarDocumentStatus =
  | "draft"
  | "analyzed"
  | "pending_signatures"
  | "partially_signed"
  | "completed"
  | "expired"
  | "rejected";

export interface SidebarDocumentItem {
  document_id: string;
  filename: string;
  status: SidebarDocumentStatus;
  analysis_id: string | null;
  updated_at: string;
}

export interface SidebarDocumentSigner {
  email: string;
  role: "sender" | "recipient";
  status: "pending" | "signed" | "rejected";
  signed_at: string | null;
}

export interface SidebarDocumentSignersResponse {
  signers: SidebarDocumentSigner[];
}

export interface SidebarDocumentEvent {
  id: string;
  event_type: string;
  actor_email: string | null;
  created_at: string;
}

export interface SidebarDocumentEventsResponse {
  events: SidebarDocumentEvent[];
}

export interface SidebarSignatureRecord {
  signer_email: string;
  signer_name: string;
  signed_at: string;
}

export interface SidebarCertificateResponse {
  completed_at: string | null;
  signatures: SidebarSignatureRecord[];
}

interface DocumentDetailSidebarProps {
  selectedDocument: SidebarDocumentItem | null;
  selectedSigners: SidebarDocumentSignersResponse | null;
  selectedEvents: SidebarDocumentEventsResponse | null;
  selectedCertificate: SidebarCertificateResponse | null;
  loadingDocumentDetails: boolean;
  signedCount: number;
  totalSignerCount: number;
  statusBadgeClass: (status: SidebarDocumentStatus) => string;
  formatStatus: (status: SidebarDocumentStatus) => string;
  formatDateTime: (value: string | null) => string;
  onRefreshDetails: (documentId: string, status: SidebarDocumentStatus) => void;
  onOpenAnalysis: (analysisId: string | null) => void;
  onDownloadCertificate: (documentId: string) => void;
  onDownloadSignedPdf: (documentId: string) => void;
  actionContent?: ReactNode;
  className?: string;
}

export function DocumentDetailSidebar({
  selectedDocument,
  selectedSigners,
  selectedEvents,
  selectedCertificate,
  loadingDocumentDetails,
  signedCount,
  totalSignerCount,
  statusBadgeClass,
  formatStatus,
  formatDateTime,
  onRefreshDetails,
  onOpenAnalysis,
  onDownloadCertificate,
  onDownloadSignedPdf,
  actionContent,
  className,
}: DocumentDetailSidebarProps) {
  return (
    <article className={className || "bg-white lg:border-l border-border-light"}>
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
        <div className="flex w-full min-h-[300px] items-center justify-center p-6 text-sm text-neutral-gray text-center">
          Pilih dokumen untuk melihat detail.
        </div>
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
              onClick={() => onRefreshDetails(selectedDocument.document_id, selectedDocument.status)}
              disabled={loadingDocumentDetails}
              className="rounded-md border border-border-light px-3 py-1.5 text-xs font-semibold text-dark-navy hover:border-dark-navy/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingDocumentDetails ? "Memuat..." : "Muat Ulang Detail"}
            </button>
            <button
              type="button"
              onClick={() => onOpenAnalysis(selectedDocument.analysis_id)}
              className="rounded-md border border-border-light px-3 py-1.5 text-xs font-semibold text-dark-navy hover:border-dark-navy/40"
            >
              Buka Analisis
            </button>
            {selectedDocument.status === "completed" ? (
              <>
                <button
                  type="button"
                  onClick={() => onDownloadCertificate(selectedDocument.document_id)}
                  className="rounded-md border border-border-light px-3 py-1.5 text-xs font-semibold text-dark-navy hover:border-dark-navy/40"
                >
                  Sertifikat PDF
                </button>
                <button
                  type="button"
                  onClick={() => onDownloadSignedPdf(selectedDocument.document_id)}
                  className="rounded-md border border-border-light px-3 py-1.5 text-xs font-semibold text-dark-navy hover:border-dark-navy/40"
                >
                  PDF Hasil TTD
                </button>
                <p className="w-full text-[11px] text-neutral-gray">
                  Unduhan tersedia untuk pengguna yang sedang login di dashboard.
                </p>
              </>
            ) : null}
          </div>

          {actionContent ? (
            <div className="grid gap-3 border-b border-border-light pb-4">
              {actionContent}
            </div>
          ) : null}

          <div className="grid gap-3">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-gray">Penandatangan</p>
              <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                {(selectedSigners?.signers || []).length === 0 ? (
                  <div className="flex w-full min-h-[100px] items-center justify-center p-4 text-xs text-neutral-gray text-center">
                    Belum ada data signer.
                  </div>
                ) : (
                  selectedSigners?.signers.map((signer) => (
                    <div key={`${signer.email}-${signer.role}`} className="border-b border-border-light px-3 py-2 last:border-b-0">
                      <p className="text-xs font-medium text-dark-navy">{signer.email}</p>
                      <p className="text-[11px] text-neutral-gray">
                        {signer.role === "sender" ? "Pemilik" : "Penandatangan"} &bull; {signer.status === "signed" ? "Telah TTD" : signer.status === "rejected" ? "Ditolak" : "Tertunda"}
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
  );
}
