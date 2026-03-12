"use client";

import { useRef, useEffect } from "react";

interface PdfViewerProps {
  pdfUrl: string;
  highlightText?: string | null;
  highlightColor?: string;
}

export default function PdfViewer({ pdfUrl, highlightText, highlightColor }: PdfViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const pendingHighlight = useRef<{ text: string; color: string } | null>(null);

  // Listen for "pdfReady" from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "pdfReady") {
        readyRef.current = true;
        // Apply pending highlight if any
        if (pendingHighlight.current) {
          iframeRef.current?.contentWindow?.postMessage(
            { type: "highlight", payload: pendingHighlight.current },
            "*"
          );
          pendingHighlight.current = null;
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Send PDF URL to iframe once it loads
  const handleIframeLoad = () => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "loadPdf", payload: { url: pdfUrl } },
      "*"
    );
  };

  // Send highlight commands when clause changes
  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;

    if (highlightText) {
      const msg = { text: highlightText, color: highlightColor || "rgba(251, 146, 60, 0.45)" };
      if (readyRef.current) {
        iframeRef.current.contentWindow.postMessage({ type: "highlight", payload: msg }, "*");
      } else {
        pendingHighlight.current = msg;
      }
    } else {
      if (readyRef.current) {
        iframeRef.current.contentWindow.postMessage({ type: "clearHighlight" }, "*");
      }
      pendingHighlight.current = null;
    }
  }, [highlightText, highlightColor]);

  return (
    <div className="h-full overflow-hidden">
      <iframe
        ref={iframeRef}
        src="/pdf-viewer.html"
        onLoad={handleIframeLoad}
        className="w-full h-full border-0"
        title="PDF Viewer"
      />
    </div>
  );
}
