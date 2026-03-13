import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const headers: Record<string, string> = {};
    const authHeader = request.headers.get("authorization");
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const res = await fetch(`${API_BASE}/api/documents/quick-sign`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: "Gagal menandatangani dokumen." }));
      return NextResponse.json(errorData, { status: res.status });
    }

    const pdfBytes = await res.arrayBuffer();
    const disposition = res.headers.get("content-disposition") || "attachment; filename=signed.pdf";
    const documentId = res.headers.get("x-document-id") || "";

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition,
        "X-Document-Id": documentId,
      },
    });
  } catch {
    return NextResponse.json({ detail: "Gagal menghubungi server." }, { status: 502 });
  }
}
