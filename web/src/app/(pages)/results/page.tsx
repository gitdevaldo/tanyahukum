export default function ResultsPage() {
  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <div className="max-w-4xl w-full space-y-6">
        <h1 className="text-3xl font-bold">Hasil Analisis</h1>
        {/* Clause cards with risk indicators will go here */}
        <div className="text-gray-400">Menunggu hasil analisis...</div>
      </div>
    </main>
  );
}
