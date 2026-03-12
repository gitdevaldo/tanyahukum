import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const res = await fetch(`http://localhost:8000/api/analysis/${id}/pdf`, {
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
