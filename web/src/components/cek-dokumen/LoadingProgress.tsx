"use client";

import { useState, useEffect } from "react";
import { FileSearch, Brain, Scale, CheckCircle } from "lucide-react";

const STEPS = [
  { icon: FileSearch, label: "Mengekstrak teks dari dokumen...", duration: 3000 },
  { icon: Brain, label: "Mengidentifikasi klausa-klausa kontrak...", duration: 3000 },
  { icon: Scale, label: "Mencari regulasi terkait di database hukum...", duration: 4000 },
  { icon: CheckCircle, label: "Menganalisis risiko setiap klausa...", duration: 5000 },
];

export function LoadingProgress() {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (currentStep >= STEPS.length) return;

    const timer = setTimeout(() => {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
    }, STEPS[currentStep].duration);

    return () => clearTimeout(timer);
  }, [currentStep]);

  return (
    <div className="max-w-xl mx-auto text-center py-8 sm:py-16 px-4">
      {/* Animated icon */}
      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-primary-orange/10 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8 animate-pulse">
        <Scale size={32} className="text-primary-orange sm:hidden" />
        <Scale size={40} className="text-primary-orange hidden sm:block" />
      </div>

      <h2 className="font-heading text-xl sm:text-2xl font-bold text-dark-navy mb-2">
        Menganalisis Dokumen...
      </h2>
      <p className="text-neutral-gray text-sm sm:text-base mb-8 sm:mb-10">
        Proses ini memerlukan waktu sekitar 15-30 detik
      </p>

      {/* Progress steps */}
      <div className="space-y-3 sm:space-y-4 text-left">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isActive = i === currentStep;
          const isDone = i < currentStep;

          return (
            <div
              key={i}
              className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl transition-all duration-500 ${
                isDone
                  ? "bg-green-50 border border-green-200"
                  : isActive
                  ? "bg-orange-50 border border-orange-200"
                  : "bg-gray-50 border border-gray-100"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isDone
                    ? "bg-green-100"
                    : isActive
                    ? "bg-orange-100 animate-pulse"
                    : "bg-gray-100"
                }`}
              >
                <Icon
                  size={20}
                  className={
                    isDone
                      ? "text-green-600"
                      : isActive
                      ? "text-primary-orange"
                      : "text-gray-400"
                  }
                />
              </div>
              <span
                className={`font-medium text-sm sm:text-base ${
                  isDone
                    ? "text-green-700"
                    : isActive
                    ? "text-dark-navy"
                    : "text-gray-400"
                }`}
              >
                {isDone ? "✓ " : ""}
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
