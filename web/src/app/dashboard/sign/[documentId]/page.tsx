"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getValidAccessToken, clearSession } from "@/lib/auth-session";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import styles from "./sign.module.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface DocumentInfo {
  document_id: string;
  filename: string;
  owner_email: string;
  status: string;
  my_signer_status?: "pending" | "signed" | "rejected" | null;
}

interface RenderedPage {
  pageNumber: number;
  width: number;
  height: number;
  dataUrl: string;
}

interface SignaturePlacement {
  x: number;
  y: number;
  page: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

interface SignatureInteraction {
  mode: "move" | "resize";
  startClientX: number;
  startClientY: number;
  startPlacement: SignaturePlacement;
}

export default function SigningEditorPage() {
  const router = useRouter();
  const params = useParams();
  const documentId = Array.isArray(params.documentId) ? params.documentId[0] : params.documentId;

  const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([]);
  const [signatureData, setSignatureData] = useState<{
    name: string;
    type: string;
    content: string;
  } | null>(null);
  const [signaturePlacement, setSignaturePlacement] = useState<SignaturePlacement | null>(null);

  const interactionRef = useRef<SignatureInteraction | null>(null);
  const isAlreadySigned = docInfo?.my_signer_status === "signed";

  const clampPlacement = (placement: SignaturePlacement, page: RenderedPage): SignaturePlacement => {
    const maxX = Math.max(0, page.width - placement.width);
    const maxY = Math.max(0, page.height - placement.height);
    return {
      ...placement,
      x: Math.max(0, Math.min(placement.x, maxX)),
      y: Math.max(0, Math.min(placement.y, maxY)),
      pageWidth: page.width,
      pageHeight: page.height,
    };
  };

  const handleInteractionMove = (event: MouseEvent) => {
    const interaction = interactionRef.current;
    if (!interaction) return;

    const page = renderedPages.find((p) => p.pageNumber === interaction.startPlacement.page);
    if (!page) return;

    const dx = event.clientX - interaction.startClientX;
    const dy = event.clientY - interaction.startClientY;

    if (interaction.mode === "move") {
      const next = clampPlacement(
        {
          ...interaction.startPlacement,
          x: interaction.startPlacement.x + dx,
          y: interaction.startPlacement.y + dy,
        },
        page,
      );
      setSignaturePlacement(next);
      return;
    }

    const resized = clampPlacement(
      {
        ...interaction.startPlacement,
        width: Math.max(80, interaction.startPlacement.width + dx),
        height: Math.max(36, interaction.startPlacement.height + dy),
      },
      page,
    );
    setSignaturePlacement(resized);
  };

  const stopInteraction = () => {
    interactionRef.current = null;
    window.removeEventListener("mousemove", handleInteractionMove);
    window.removeEventListener("mouseup", stopInteraction);
  };

  const beginInteraction = (
    mode: "move" | "resize",
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (!signaturePlacement || !signatureData || isAlreadySigned) return;

    event.preventDefault();
    event.stopPropagation();

    interactionRef.current = {
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPlacement: signaturePlacement,
    };

    window.addEventListener("mousemove", handleInteractionMove);
    window.addEventListener("mouseup", stopInteraction);
  };

  const startMovePlacedSignature = (event: React.MouseEvent<HTMLDivElement>) => {
    beginInteraction("move", event);
  };

  const startResizePlacedSignature = (event: React.MouseEvent<HTMLDivElement>) => {
    beginInteraction("resize", event);
  };

  useEffect(() => () => stopInteraction(), []);

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getValidAccessToken();
        if (!token) {
          clearSession();
          router.replace("/login/");
          return;
        }

        const docRes = await fetch("/api/documents?limit=120", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!docRes.ok) throw new Error("Failed to fetch documents");

        const docData = await docRes.json();
        const doc = docData.documents.find((d: DocumentInfo) => d.document_id === documentId) as DocumentInfo | undefined;
        if (!doc) throw new Error("Document not found");
        setDocInfo(doc);

        const pdfRes = await fetch(`/api/documents/${documentId}/pdf/`, {
          headers: { Authorization: `Bearer ${token}` },
          redirect: "manual",
        });

        if (pdfRes.ok) {
          setPdfData(await pdfRes.arrayBuffer());
        } else if (pdfRes.status === 307 || pdfRes.status === 308) {
          const redirectUrl = pdfRes.headers.get("location");
          if (!redirectUrl) throw new Error("Failed to resolve PDF redirect");
          const retryRes = await fetch(redirectUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!retryRes.ok) throw new Error("Failed to fetch PDF");
          setPdfData(await retryRes.arrayBuffer());
        } else {
          const errData = await pdfRes.json().catch(() => ({ detail: "Failed to fetch PDF" }));
          throw new Error(errData.detail || "Failed to fetch PDF");
        }

        const sigData = sessionStorage.getItem(`sig_data_${documentId}`);
        if (sigData) {
          setSignatureData(JSON.parse(sigData));
        } else if (doc.my_signer_status !== "signed") {
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

  useEffect(() => {
    if (!pdfData) return;

    const renderPdfPages = async () => {
      try {
        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
        const pages: RenderedPage[] = [];

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.4 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext("2d");
          if (!context) continue;
          await page.render({ canvasContext: context as any, viewport } as any).promise;
          pages.push({
            pageNumber,
            width: viewport.width,
            height: viewport.height,
            dataUrl: canvas.toDataURL("image/png"),
          });
        }

        setRenderedPages(pages);
      } catch (err) {
        setError("Gagal menampilkan PDF.");
      }
    };

    renderPdfPages();
  }, [pdfData]);

  const getDefaultSignatureSize = (page: RenderedPage) => {
    const defaultWidth = signatureData?.type === "text" ? 220 : 180;
    const defaultHeight = signatureData?.type === "text" ? 64 : 88;
    return {
      width: Math.min(defaultWidth, page.width),
      height: Math.min(defaultHeight, page.height),
    };
  };

  const handlePageDrop = (event: React.DragEvent<HTMLDivElement>, pageNumber: number) => {
    event.preventDefault();
    if (!signatureData || isAlreadySigned) return;

    const page = renderedPages.find((p) => p.pageNumber === pageNumber);
    if (!page) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const { width, height } = getDefaultSignatureSize(page);
    const placement = clampPlacement(
      {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        page: pageNumber,
        width,
        height,
        pageWidth: page.width,
        pageHeight: page.height,
      },
      page,
    );
    setSignaturePlacement(placement);
  };

  const handleDragStart = (event: React.DragEvent) => {
    if (isAlreadySigned) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
  };

  const handleSign = async () => {
    if (isAlreadySigned) {
      alert("Anda sudah menandatangani dokumen ini. Anda hanya dapat melihat dokumen.");
      return;
    }
    if (!signaturePlacement || !signatureData) {
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

      const res = await fetch(`/api/documents/${documentId}/sign-visual-finalize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signer_name: signatureData.name,
          signature_type: signatureData.type,
          signature_image: signatureData.content || null,
          positions: [
            {
              x: signaturePlacement.x,
              y: signaturePlacement.y,
              page: signaturePlacement.page,
              width: signaturePlacement.width,
              height: signaturePlacement.height,
              page_width: signaturePlacement.pageWidth,
              page_height: signaturePlacement.pageHeight,
            },
          ],
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: "Failed to sign document" }));
        throw new Error(errData.detail || "Failed to sign document");
      }

      sessionStorage.removeItem(`sig_data_${documentId}`);
      window.opener?.postMessage({ type: "SIGNATURE_COMPLETE", documentId }, window.location.origin);
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
      <div className={styles.sidebar}>
        <div className={styles.sidebarContent}>
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Dokumen</h4>
            <p className={styles.docName}>{docInfo?.filename}</p>
            <p className={styles.docMeta}>Owner: {docInfo?.owner_email}</p>
            <p className={styles.docStatus}>Status: {docInfo?.status}</p>
            {isAlreadySigned && (
              <p className={styles.alreadySignedInfo}>
                Anda sudah menandatangani dokumen ini. Mode saat ini hanya lihat dokumen.
              </p>
            )}
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Tanda Tangan Anda</h4>
            {signatureData ? (
              <div
                className={styles.signaturePreview}
                draggable={!isAlreadySigned}
                onDragStart={handleDragStart}
                style={{ cursor: isAlreadySigned ? "not-allowed" : "grab" }}
              >
                {signatureData.type === "text" && (
                  <p style={{ fontSize: 20, fontFamily: "Segoe Print, serif", color: "#333" }}>
                    {signatureData.name}
                  </p>
                )}
                {(signatureData.type === "drawn" || signatureData.type === "image") && signatureData.content && (
                  <img
                    src={signatureData.content}
                    alt="Signature"
                    style={{ maxWidth: "100%", height: "60px", objectFit: "contain" }}
                  />
                )}
              </div>
            ) : (
              <p className={styles.docMeta}>Tidak ada data tanda tangan pada tab ini.</p>
            )}

            <p className={styles.instruction}>
              Tarik tanda tangan ke halaman PDF, lalu geser dan ubah ukuran sebelum menandatangani.
            </p>
          </div>

          <div className={styles.actions}>
            <button
              onClick={handleSign}
              disabled={!signaturePlacement || !signatureData || signing || isAlreadySigned}
              className={styles.signBtn}
            >
              {isAlreadySigned ? "Sudah Ditandatangani" : signing ? "Signing..." : "Tanda Tangani"}
            </button>
            <button onClick={() => window.close()} className={styles.cancelBtn}>
              Tutup
            </button>
          </div>
        </div>
      </div>

      <div className={styles.pdfViewer}>
        {renderedPages.length > 0 ? (
          <div className={styles.pagesStack}>
            {renderedPages.map((page) => (
              <div
                key={page.pageNumber}
                className={styles.pageContainer}
                style={{ width: page.width, height: page.height }}
                onDragOver={isAlreadySigned ? undefined : (event) => event.preventDefault()}
                onDrop={isAlreadySigned ? undefined : (event) => handlePageDrop(event, page.pageNumber)}
              >
                <img src={page.dataUrl} alt={`Halaman ${page.pageNumber}`} className={styles.pageImage} />
                <div className={styles.pageLabel}>Halaman {page.pageNumber}</div>

                {signatureData && signaturePlacement && signaturePlacement.page === page.pageNumber && (
                  <div
                    className={styles.draggableSignature}
                    style={{
                      left: signaturePlacement.x,
                      top: signaturePlacement.y,
                      width: signaturePlacement.width,
                      height: signaturePlacement.height,
                      cursor: isAlreadySigned ? "default" : "move",
                    }}
                    onMouseDown={isAlreadySigned ? undefined : startMovePlacedSignature}
                  >
                    <div className={styles.signatureContent}>
                      {signatureData.type === "text" && (
                        <p
                          style={{
                            fontSize: Math.max(14, Math.min(24, signaturePlacement.height * 0.45)),
                            fontFamily: "Segoe Print, serif",
                            color: "#333",
                            margin: 0,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {signatureData.name}
                        </p>
                      )}
                      {(signatureData.type === "drawn" || signatureData.type === "image") && signatureData.content && (
                        <img
                          src={signatureData.content}
                          alt="Signature"
                          style={{
                            maxWidth: "100%",
                            maxHeight: "100%",
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                          }}
                        />
                      )}
                    </div>

                    {!isAlreadySigned && (
                      <div
                        className={styles.resizeHandle}
                        onMouseDown={startResizePlacedSignature}
                        title="Resize signature"
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
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
