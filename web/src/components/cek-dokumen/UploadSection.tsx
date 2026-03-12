"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, AlertCircle } from "lucide-react";

interface UploadSectionProps {
  onAnalyze: (file: File | null, text: string | null) => void;
  error: string | null;
}

export function UploadSection({ onAnalyze, error }: UploadSectionProps) {
  const [mode, setMode] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) {
      setFile(accepted[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
  });

  const handleSubmit = () => {
    if (mode === "file" && file) {
      onAnalyze(file, null);
    } else if (mode === "text" && text.trim().length > 50) {
      onAnalyze(null, text);
    }
  };

  const canSubmit = mode === "file" ? !!file : text.trim().length > 50;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Title */}
      <div className="text-center mb-6 sm:mb-8">
        <h1 className="font-heading text-2xl sm:text-3xl md:text-4xl font-bold text-dark-navy mb-2 sm:mb-3">
          Cek Dokumen Hukum
        </h1>
        <p className="text-neutral-gray text-sm sm:text-lg">
          Upload kontrak atau perjanjian Anda untuk analisis risiko instan berbasis AI
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2 mb-4 sm:mb-6 justify-center">
        <button
          onClick={() => setMode("file")}
          className={`flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-medium text-sm transition-all ${
            mode === "file"
              ? "bg-dark-navy text-white"
              : "bg-white text-neutral-gray border border-gray-200 hover:border-gray-300"
          }`}
        >
          Upload PDF
        </button>
        <button
          onClick={() => setMode("text")}
          className={`flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-medium text-sm transition-all ${
            mode === "text"
              ? "bg-dark-navy text-white"
              : "bg-white text-neutral-gray border border-gray-200 hover:border-gray-300"
          }`}
        >
          Tempel Teks
        </button>
      </div>

      {/* Upload area */}
      {mode === "file" ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-6 sm:p-12 text-center cursor-pointer transition-all ${
            isDragActive
              ? "border-primary-orange bg-orange-50"
              : file
              ? "border-green-400 bg-green-50"
              : "border-gray-300 bg-white hover:border-primary-orange hover:bg-orange-50/30"
          }`}
        >
          <input {...getInputProps()} />
          {file ? (
            <div className="space-y-3">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <FileText size={28} className="text-green-600 sm:hidden" />
                <FileText size={32} className="text-green-600 hidden sm:block" />
              </div>
              <p className="font-medium text-dark-navy text-base sm:text-lg">{file.name}</p>
              <p className="text-sm text-neutral-gray">
                {(file.size / 1024 / 1024).toFixed(2)} MB • Klik untuk ganti file
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                <Upload size={28} className="text-neutral-gray sm:hidden" />
                <Upload size={32} className="text-neutral-gray hidden sm:block" />
              </div>
              <p className="font-medium text-dark-navy text-base sm:text-lg">
                {isDragActive ? "Lepas file di sini..." : "Drag & drop PDF di sini"}
              </p>
              <p className="text-xs sm:text-sm text-neutral-gray">
                atau klik untuk pilih file • Maksimum 20MB
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tempel teks kontrak atau perjanjian di sini...&#10;&#10;Contoh: Pasal 1 - Pihak Pertama setuju untuk..."
            className="w-full h-48 sm:h-64 p-4 sm:p-6 text-dark-navy resize-none focus:outline-none text-sm sm:text-base"
          />
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-sm text-neutral-gray">
            {text.length} karakter {text.length < 50 && text.length > 0 && "• Minimal 50 karakter"}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full mt-6 py-3 sm:py-4 rounded-xl font-heading font-semibold text-base sm:text-lg transition-all cursor-pointer ${
          canSubmit
            ? "bg-primary-orange text-white hover:bg-orange-600 shadow-lg shadow-orange-200"
            : "bg-gray-200 text-gray-400 !cursor-not-allowed"
        }`}
      >
        Analisis Sekarang
      </button>

      {/* Info */}
      <p className="text-center text-sm text-neutral-gray mt-4">
        Dokumen Anda diproses secara aman dan tidak disimpan di server kami.
      </p>
    </div>
  );
}
