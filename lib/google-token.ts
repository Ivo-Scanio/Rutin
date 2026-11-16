import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { refreshGoogleAccessToken } from "@/lib/auth";

export class GoogleAccessTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAccessTokenError";
  }
}

export async function getGoogleAccessToken(req: NextRequest, forceRefresh = false) {
  const token = await getToken({ req });
  if (!token) return null;

  const accessToken = typeof token.accessToken === "string" ? token.accessToken : null;
  const expiresAt = typeof token.expiresAt === "number" ? token.expiresAt : 0;
  if (!forceRefresh && !token.error && accessToken && (!expiresAt || expiresAt > Date.now() + 60_000)) {
    return accessToken;
  }

  if (typeof token.refreshToken !== "string") {
    throw new GoogleAccessTokenError("La autorización de Google expiró. Cierra sesión e inicia sesión de nuevo.");
  }

  try {
    return (await refreshGoogleAccessToken(token.refreshToken)).accessToken;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error desconocido";
    throw new GoogleAccessTokenError(`No se pudo renovar la autorización de Google. Cierra sesión e inicia sesión de nuevo. ${detail}`);
  }
}
