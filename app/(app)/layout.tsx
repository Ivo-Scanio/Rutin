import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import DataProvider from "@/components/DataProvider";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/");
  return (
    <DataProvider>
      <Navbar />
      <div className="shell">
        <Sidebar name={session.user?.name ?? ""} />
        <main className="content">{children}</main>
      </div>
    </DataProvider>
  );
}
