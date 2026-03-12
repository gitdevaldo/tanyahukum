export default function UploadPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-xl w-full space-y-6">
        <h1 className="text-3xl font-bold">Upload Kontrak</h1>
        <p className="text-gray-600">
          Upload dokumen kontrak (PDF) untuk dianalisis oleh AI.
        </p>
        {/* DropZone component will go here */}
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-400">
          Drop PDF di sini atau klik untuk upload
        </div>
      </div>
    </main>
  );
}
