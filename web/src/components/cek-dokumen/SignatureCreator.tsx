"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import styles from "./SignatureCreator.module.css";
import { getValidAccessToken } from "@/lib/auth-session";

interface UserSignature {
  id: string;
  type: "text" | "drawn" | "image";
  display_name: string;
  content: string;
  created_at: string;
}

interface SignatureCreatorProps {
  onSignatureCreated: (sig: { type: "text" | "drawn" | "image"; content: string; displayName: string }) => void;
  onCanSignChange: (canSign: boolean) => void;
}

export function SignatureCreator({ onSignatureCreated, onCanSignChange }: SignatureCreatorProps) {
  const [mode, setMode] = useState<"loading" | "select" | "create">("loading");
  const [savedSignatures, setSavedSignatures] = useState<UserSignature[]>([]);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(null);
  
  const [displayName, setDisplayName] = useState("");
  const [signatureType, setSignatureType] = useState<"text" | "drawn" | "image">("text");
  const [drawnSignature, setDrawnSignature] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  // Load user's saved signatures on mount
  useEffect(() => {
    const loadSignatures = async () => {
      try {
        const token = await getValidAccessToken();
        if (!token) throw new Error("Not authenticated");

        const res = await fetch("/api/signatures/user/list", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error("Failed to load signatures");
        const data = await res.json();
        setSavedSignatures(data.signatures || []);
        setMode(data.signatures?.length > 0 ? "select" : "create");
      } catch (err) {
        console.error("Error loading signatures:", err);
        setMode("create");
      }
    };

    loadSignatures();
  }, []);

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

  const handleUseSignature = (sig: UserSignature) => {
    onSignatureCreated({
      type: sig.type,
      content: sig.content,
      displayName: sig.display_name,
    });
    onCanSignChange(true);
  };

  const handleCreateSignature = async () => {
    if (!isComplete() || saving) return;

    setSaving(true);
    try {
      let content = "";
      if (signatureType === "text") {
        content = displayName;
      } else if (signatureType === "drawn") {
        content = drawnSignature || "";
      } else if (signatureType === "image") {
        content = uploadedImage || "";
      }

      // Get auth token
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      // Save signature to backend
      const res = await fetch("/api/signatures/user", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: signatureType,
          display_name: displayName,
          content: content,
          is_default: false,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || "Failed to save signature");
      }

      // Notify parent that signature was created
      onSignatureCreated({
        type: signatureType,
        content,
        displayName,
      });

      // Only call onCanSignChange when button is clicked and saved
      onCanSignChange(true);
    } catch (err) {
      console.error("Error saving signature:", err);
      alert(err instanceof Error ? err.message : "Failed to save signature");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Loading State */}
      {mode === "loading" && <p className={styles.loading}>Memuat tanda tangan...</p>}

      {/* Select Mode - Show saved signatures */}
      {mode === "select" && (
        <div>
          <h3 className={styles.modeTitle}>Pilih Tanda Tangan</h3>
          <div className={styles.signatureList}>
            {savedSignatures.map((sig) => (
              <div key={sig.id} className={styles.signatureItem}>
                <div className={styles.signaturePreview}>
                  {sig.type === "text" && (
                    <p style={{ fontSize: 16, fontFamily: "Segoe Print, serif" }}>
                      {sig.display_name}
                    </p>
                  )}
                  {(sig.type === "drawn" || sig.type === "image") && (
                    <img src={sig.content} alt={sig.display_name} />
                  )}
                </div>
                <p className={styles.signatureName}>{sig.display_name}</p>
                <button
                  type="button"
                  onClick={() => handleUseSignature(sig)}
                  className={styles.useBtn}
                >
                  Gunakan
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMode("create")}
            className={styles.createNewBtn}
          >
            Buat Tanda Tangan Baru
          </button>
        </div>
      )}

      {/* Create Mode - Form to create new signature */}
      {mode === "create" && (
        <div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Nama Penandatangan</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Masukkan nama Anda"
              className={styles.input}
            />
          </div>

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
            disabled={!isComplete() || saving}
            className={styles.createBtn}
          >
            {saving ? "Menyimpan..." : "Simpan & Lanjutkan"}
          </button>
          {savedSignatures.length > 0 && (
            <button
              type="button"
              onClick={() => setMode("select")}
              className={styles.backBtn}
            >
              Kembali
            </button>
          )}
        </div>
      )}
    </div>
  );
}
