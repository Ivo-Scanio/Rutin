import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";

export async function refreshGoogleAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.access_token !== "string") {
    const detail = result?.error_description ?? result?.error ?? `HTTP ${response.status}`;
    throw new Error(`No se pudo renovar la autorización de Google: ${detail}`);
  }
  return {
    accessToken: result.access_token as string,
    expiresAt: Date.now() + Number(result.expires_in ?? 3600) * 1000,
    refreshToken: typeof result.refresh_token === "string" ? result.refresh_token : refreshToken,
  };
}

async function refresh(token: JWT): Promise<JWT> {
  try {
    if (typeof token.refreshToken !== "string") throw new Error("No refresh token");
    const refreshed = await refreshGoogleAccessToken(token.refreshToken);
    return {
      ...token,
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
      refreshToken: refreshed.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshError" };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // drive.appdata = carpeta oculta de la app dentro del Drive del usuario
          scope: "openid email profile https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/calendar.events",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token ?? token.refreshToken,
          expiresAt: (account.expires_at ?? 0) * 1000,
          error: undefined,
        };
      }
      if (Date.now() < ((token.expiresAt as number) ?? 0) - 60_000) return token;
      return refresh(token);
    },
  },
};
