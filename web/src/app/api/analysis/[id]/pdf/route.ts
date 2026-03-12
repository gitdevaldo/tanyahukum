import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.INTERNAL_API_KEY || "";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // H-08: Validate ID format to prevent path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return NextResponse.json({ detail: "Invalid ID" }, { status: 400 });
  }

  try {
    const res = await fetch(`http://localhost:8000/api/analysis/${id}/pdf`, {
      headers: { "X-API-Key": API_KEY },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: "PDF not found" }));
      return NextResponse.json(data, { status: res.status });
    }
    const pdfBuffer = await res.arrayBuffer();
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=contract-${id}.pdf`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Proxy error";
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}
