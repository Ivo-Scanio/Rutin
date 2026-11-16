import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import LoginButton from "@/components/LoginButton";

export default async function Home() {
  if (await getServerSession(authOptions)) redirect("/todos");
  return (
    <main className="login">
      <h1>Rutin</h1>
      <p>Tus datos se guardan en tu propia cuenta de Google.</p>
      <LoginButton />
    </main>
  );
}
