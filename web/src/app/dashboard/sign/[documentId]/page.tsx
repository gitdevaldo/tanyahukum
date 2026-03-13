"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { getValidAccessToken, clearSession } from "@/lib/auth-session";
import styles from "./sign.module.css";

interface DocumentInfo {
  document_id: string;
  filename: string;
  owner_email: string;
  status: string;
}

interface SignatureLocation {
  x: number;
  y: number;
  page: number;
}

export default function SigningEditorPage() {
  const router = useRouter();
  const params = useParams();
  const documentId = Array.isArray(params.documentId) ? params.documentId[0] : params.documentId;

  const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  
  // Get signature data from URL or sessionStorage
  const [signatureData, setSignatureData] = useState<{
    name: string;
    type: string;
    content: string;
  } | null>(null);

  const [signatureLocation, setSignatureLocation] = useState<SignatureLocation | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [placedOnce, setPlacedOnce] = useState(false);
  const draggableRef = useRef<HTMLDivElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Load document info and signature data
  useEffect(() => {
    const load = async () => {
      try {
        const token = await getValidAccessToken();
        if (!token) {
          clearSession();
          router.replace("/login/");
          return;
        }

        // Fetch documents
        const docRes = await fetch(`/api/documents?limit=120`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!docRes.ok) throw new Error("Failed to fetch documents");

        const docData = await docRes.json();
        const doc = docData.documents.find((d: any) => d.document_id === documentId);
        if (!doc) throw new Error("Document not found");

        setDocInfo(doc);

        // Fetch PDF file from backend
        const pdfRes = await fetch(`/api/documents/${documentId}/pdf`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (pdfRes.ok) {
          const blob = await pdfRes.blob();
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
        }

        // Get signature data from sessionStorage (passed from parent tab)
        const sigData = sessionStorage.getItem(`sig_data_${documentId}`);
        if (sigData) {
          setSignatureData(JSON.parse(sigData));
        } else {
          throw new Error("Signature data not found");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load document");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [documentId, router]);

  // Handle drag start
  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
  };

  // Handle drag over PDF area
  const handleDragOver = (e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();

    if (pdfContainerRef.current) {
      const rect = pdfContainerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (draggableRef.current) {
        draggableRef.current.style.left = `${x}px`;
        draggableRef.current.style.top = `${y}px`;
      }
    }
  };

  // Handle drop
  const handleDragEnd = () => {
    setIsDragging(false);

    if (draggableRef.current && pdfContainerRef.current) {
      const rect = pdfContainerRef.current.getBoundingClientRect();
      const x = draggableRef.current.offsetLeft;
      const y = draggableRef.current.offsetTop;

      setSignatureLocation({
        x: Math.max(0, Math.min(x, rect.width - 100)),
        y: Math.max(0, Math.min(y, rect.height - 50)),
        page: 1,
      });
      setPlacedOnce(true);
    }
  };

  // Handle signing
  const handleSign = async () => {
    if (!signatureLocation) {
      alert("Silakan tempatkan tanda tangan di dokumen terlebih dahulu");
      return;
    }

    setSigning(true);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        clearSession();
        router.replace("/login/");
        return;
      }

      // Call backend to finalize signature
      const res = await fetch(`/api/documents/${documentId}/sign-visual-finalize`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signer_name: signatureData?.name,
          signature_type: signatureData?.type,
          signature_image: signatureData?.content,
          positions: [signatureLocation],
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to sign document");
      }

      // Clean up and close
      sessionStorage.removeItem(`sig_data_${documentId}`);

      // Notify parent window and close
      window.opener?.postMessage(
        { type: "SIGNATURE_COMPLETE", documentId },
        window.location.origin
      );

      setTimeout(() => window.close(), 500);
    } catch (err) {
      setSigning(false);
      alert(err instanceof Error ? err.message : "Failed to sign document");
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.sidebar}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.sidebar}>
          <p style={{ color: "#dc2626" }}>Error: {error}</p>
          <button onClick={() => window.close()} className={styles.closeBtn}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Left Sidebar (30%) */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarContent}>
          {/* Document Info */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Dokumen</h4>
            <p className={styles.docName}>{docInfo?.filename}</p>
            <p className={styles.docMeta}>Owner: {docInfo?.owner_email}</p>
            <p className={styles.docStatus}>Status: {docInfo?.status}</p>
          </div>

          {/* Signature Preview */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Tanda Tangan Anda</h4>
            <div
              className={styles.signaturePreview}
              draggable
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              style={{ cursor: "grab" }}
            >
              {signatureData?.type === "text" && (
                <p style={{ fontSize: 20, fontFamily: "Segoe Print, serif", color: "#333" }}>
                  {signatureData.name}
                </p>
              )}
              {signatureData?.type === "drawn" && signatureData.content && (
                <img
                  src={signatureData.content}
                  alt="Signature"
                  style={{ maxWidth: "100%", height: "60px", objectFit: "contain" }}
                />
              )}
              {signatureData?.type === "image" && signatureData.content && (
                <img
                  src={signatureData.content}
                  alt="Signature"
                  style={{ maxWidth: "100%", height: "60px", objectFit: "contain" }}
                />
              )}
            </div>
            <p className={styles.instruction}>
              Drag the signature to the right to place it on the document
            </p>
          </div>

          {/* Action Buttons */}
          <div className={styles.actions}>
            <button
              onClick={handleSign}
              disabled={!signatureLocation || signing}
              className={styles.signBtn}
            >
              {signing ? "Signing..." : "Tanda Tangani"}
            </button>
            <button onClick={() => window.close()} className={styles.cancelBtn}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Right PDF Viewer (70%) */}
      <div
        className={styles.pdfViewer}
        ref={pdfContainerRef}
        onDragOver={handleDragOver}
        onDrop={handleDragEnd}
      >
        {/* Draggable Signature - only visible after placed once */}
        {signatureData && placedOnce && signatureLocation && (
          <div
            ref={draggableRef}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className={styles.draggableSignature}
            style={{
              left: signatureLocation.x,
              top: signatureLocation.y,
              cursor: "grab",
            }}
          >
            {signatureData.type === "text" && (
              <p style={{ fontSize: 18, fontFamily: "Segoe Print, serif", color: "#333", margin: 0 }}>
                {signatureData.name}
              </p>
            )}
            {signatureData.type === "drawn" && signatureData.content && (
              <img
                src={signatureData.content}
                alt="Signature"
                style={{ maxWidth: "150px", height: "auto" }}
              />
            )}
            {signatureData.type === "image" && signatureData.content && (
              <img
                src={signatureData.content}
                alt="Signature"
                style={{ maxWidth: "150px", height: "auto" }}
              />
            )}
          </div>
        )}

        {/* PDF Viewer */}
        {pdfUrl ? (
          <iframe
            src={pdfUrl}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
            }}
            title="Document"
          />
        ) : (
          <div style={{ padding: 20, textAlign: "center", color: "#999" }}>
            <p style={{ fontSize: 14, marginTop: 50 }}>PDF Viewer Area</p>
            <p style={{ fontSize: 12, color: "#bbb" }}>
              Drag your signature from the left to place it on the document
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
