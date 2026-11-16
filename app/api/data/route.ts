import { NextRequest, NextResponse } from "next/server";
import { DriveApiError, readData, writeData } from "@/lib/drive";
import { getGoogleAccessToken } from "@/lib/google-token";

async function withDriveAccess<T>(req: NextRequest, operation: (token: string) => Promise<T>) {
  let token = await getGoogleAccessToken(req);
  if (!token) return { authorized: false as const };
  try {
    return { authorized: true as const, data: await operation(token) };
  } catch (error) {
    if (!(error instanceof DriveApiError) || error.status !== 401) throw error;
    token = await getGoogleAccessToken(req, true);
    if (!token) throw new Error("No se pudo renovar la autorización de Google.");
    return { authorized: true as const, data: await operation(token) };
  }
}

export async function GET(req: NextRequest) {
  try {
    const result = await withDriveAccess(req, readData);
    if (!result.authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ data: result.data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json();
    const result = await withDriveAccess(req, (token) => writeData(token, data));
    if (!result.authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
