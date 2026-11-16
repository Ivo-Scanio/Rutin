"use client";
import { signIn } from "next-auth/react";

export default function LoginButton() {
  return <button className="primary" onClick={() => signIn("google", { callbackUrl: "/todos" })}>Iniciar sesión con Google</button>;
}
