"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./SignatureCreator.module.css";

interface SignatureCreatorProps {
  onSignatureCreated: (sig: { type: "text" | "drawn" | "image"; content: string; displayName: string }) => void;
  onCanSignChange: (canSign: boolean) => void;
}

export function SignatureCreator({ onSignatureCreated, onCanSignChange }: SignatureCreatorProps) {
  const [displayName, setDisplayName] = useState("");
  const [signatureType, setSignatureType] = useState<"text" | "drawn" | "image">("text");
  const [drawnSignature, setDrawnSignature] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  // Check if form is complete
  const isComplete = useCallback(() => {
    if (!displayName.trim()) return false;
    if (signatureType === "drawn") return drawnSignature !== null;
    if (signatureType === "image") return uploadedImage !== null;
    return true; // text type only needs name
  }, [displayName, signatureType, drawnSignature, uploadedImage]);

  // Canvas drawing handlers
  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);
    isDrawing.current = true;
  }, []);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a2332";
    ctx.lineTo(x, y);
    ctx.stroke();
  }, []);

  const stopDrawing = useCallback(() => {
    isDrawing.current = false;
    if (canvasRef.current) {
      setDrawnSignature(canvasRef.current.toDataURL("image/png"));
    }
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setDrawnSignature(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setUploadedImage(result);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateSignature = () => {
    if (!isComplete()) return;

    let content = "";
    if (signatureType === "text") {
      content = displayName;
    } else if (signatureType === "drawn") {
      content = drawnSignature || "";
    } else if (signatureType === "image") {
      content = uploadedImage || "";
    }

    onSignatureCreated({
      type: signatureType,
      content,
      displayName,
    });

    // Only call onCanSignChange when button is clicked (not on every keystroke)
    onCanSignChange(true);
  };

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Buat Tanda Tangan</h3>

      {/* Display Name Input */}
      <div className={styles.formGroup}>
        <label className={styles.label}>Nama Penandatangan</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g., John Doe"
          className={styles.input}
        />
      </div>

      {/* Signature Type Selector */}
      <div className={styles.formGroup}>
        <label className={styles.label}>Jenis Tanda Tangan</label>
        <div className={styles.radioGroup}>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              value="text"
              checked={signatureType === "text"}
              onChange={(e) => setSignatureType(e.target.value as "text")}
            />
            Nama Saja
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              value="drawn"
              checked={signatureType === "drawn"}
              onChange={(e) => setSignatureType(e.target.value as "drawn")}
            />
            Tanda Tangan
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              value="image"
              checked={signatureType === "image"}
              onChange={(e) => setSignatureType(e.target.value as "image")}
            />
            Upload Gambar
          </label>
        </div>
      </div>

      {/* Canvas for Drawing */}
      {signatureType === "drawn" && (
        <div className={styles.formGroup}>
          <label className={styles.label}>Gambar Tanda Tangan Anda</label>
          <canvas
            ref={canvasRef}
            width={280}
            height={120}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            className={styles.canvas}
          />
          {drawnSignature && (
            <button type="button" onClick={clearCanvas} className={styles.clearBtn}>
              Hapus & Mulai Ulang
            </button>
          )}
        </div>
      )}

      {/* Image Upload */}
      {signatureType === "image" && (
        <div className={styles.formGroup}>
          <label className={styles.label}>Upload Gambar Tanda Tangan</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className={styles.fileInput}
          />
          {uploadedImage && (
            <div className={styles.imagePreview}>
              <img src={uploadedImage} alt="Signature preview" />
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      {drawnSignature && signatureType === "drawn" && (
        <div className={styles.formGroup}>
          <label className={styles.label}>Preview</label>
          <img src={drawnSignature} alt="Drawn signature preview" className={styles.preview} />
        </div>
      )}

      {uploadedImage && signatureType === "image" && (
        <div className={styles.formGroup}>
          <label className={styles.label}>Preview</label>
          <img src={uploadedImage} alt="Uploaded signature preview" className={styles.preview} />
        </div>
      )}

      {signatureType === "text" && displayName && (
        <div className={styles.formGroup}>
          <label className={styles.label}>Preview</label>
          <div className={styles.textPreview}>{displayName}</div>
        </div>
      )}

      {/* Create Button */}
      <button
        type="button"
        onClick={handleCreateSignature}
        disabled={!isComplete()}
        className={styles.createBtn}
      >
        Simpan & Lanjutkan
      </button>
    </div>
  );
}
