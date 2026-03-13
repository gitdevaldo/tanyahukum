"use client";

import { useRef, useEffect, useState } from "react";
import styles from "./PdfSigningViewer.module.css";

interface SignaturePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDragging?: boolean;
}

interface PdfSigningViewerProps {
  pdfUrl: string;
  signatureImage: string;
  onPositionsChange: (positions: SignaturePosition[]) => void;
  onClose?: () => void;
}

export default function PdfSigningViewer({
  pdfUrl,
  signatureImage,
  onPositionsChange,
  onClose,
}: PdfSigningViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<SignaturePosition[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  const addSignature = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggedId !== null) return; // Don't add if dragging
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    const newSig: SignaturePosition = {
      id: `sig-${Date.now()}`,
      x,
      y,
      width: 120,
      height: 40,
    };

    const newPositions = [...positions, newSig];
    setPositions(newPositions);
    onPositionsChange(newPositions);
  };

  const startDrag = (id: string, e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setDraggedId(id);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggedId === null || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const newX = (e.clientX - rect.left) / scale;
    const newY = (e.clientY - rect.top) / scale;

    const updatedPositions = positions.map((pos) =>
      pos.id === draggedId ? { ...pos, x: newX, y: newY } : pos
    );

    setPositions(updatedPositions);
  };

  const stopDrag = () => {
    if (draggedId !== null) {
      onPositionsChange(positions);
      setDraggedId(null);
    }
  };

  const removeSignature = (id: string) => {
    const newPositions = positions.filter((pos) => pos.id !== id);
    setPositions(newPositions);
    onPositionsChange(newPositions);
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.info}>
          <p className={styles.title}>Posisikan Tanda Tangan</p>
          <p className={styles.hint}>Klik pada PDF untuk menambah tanda tangan, drag untuk memindahkan</p>
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            onClick={() => setScale(Math.max(0.5, scale - 0.1))}
            className={styles.zoomBtn}
          >
            −
          </button>
          <span className={styles.zoomLevel}>{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={() => setScale(Math.min(2, scale + 0.1))}
            className={styles.zoomBtn}
          >
            +
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className={styles.closeBtn}>
              ✕
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className={styles.viewer}
        onClick={addSignature}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        <iframe
          src={pdfUrl}
          className={styles.pdfFrame}
          title="PDF untuk ditandatangani"
        />

        {/* Signature overlays */}
        {positions.map((pos) => (
          <div
            key={pos.id}
            className={styles.signatureBox}
            style={{
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              width: `${pos.width}px`,
              height: `${pos.height}px`,
              cursor: draggedId === pos.id ? "grabbing" : "grab",
              opacity: draggedId === pos.id ? 0.8 : 1,
            }}
            onMouseDown={(e) => startDrag(pos.id, e)}
          >
            <img src={signatureImage} alt="Tanda tangan" className={styles.sig} />
            <button
              type="button"
              className={styles.removeBtn}
              onClick={(e) => {
                e.stopPropagation();
                removeSignature(pos.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <p className={styles.footerText}>
          {positions.length === 0
            ? "Klik di atas untuk menambahkan tanda tangan"
            : `${positions.length} tanda tangan ditambahkan`}
        </p>
      </div>
    </div>
  );
}
