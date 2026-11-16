"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useData } from "./DataProvider";

type IconName = "todo" | "routine" | "session" | "calendar" | "profile";

const items: { href: string; label: string; icon: IconName }[] = [
  { href: "/todos", label: "TODOs", icon: "todo" },
  { href: "/rutinas", label: "Rutinas", icon: "routine" },
  { href: "/sesiones", label: "Sesiones", icon: "session" },
  { href: "/calendario", label: "Calendario", icon: "calendar" },
];

function NavIcon({ name }: { name: IconName }) {
  const icons: Record<IconName, ReactNode> = {
    todo: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="m8 12 2.5 2.5L16.5 8.5" /></>,
    routine: <><path d="M20 7h-5V2" /><path d="M4 17h5v5" /><path d="M4.9 9A8 8 0 0 1 18.8 5L20 7M4 17l1.2 2A8 8 0 0 0 19.1 15" /></>,
    session: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-1a7 7 0 0 1 14 0v1" /></>,
  };
  return <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}

export default function Sidebar({ name }: { name: string }) {
  const path = usePathname();
  const { loading, saving, loadError, saveError } = useData();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const syncStatus = loadError || saveError
    ? "No sincronizado"
    : loading || saving ? "Sincronizando…" : "Sincronizado";
  const syncState = loadError || saveError ? "error" : loading || saving ? "pending" : "ready";
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CU";

  return (
    <aside className="sidebar">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={path.startsWith(i.href) ? "active" : ""}
          aria-label={i.label}
          aria-current={path.startsWith(i.href) ? "page" : undefined}
        >
          <NavIcon name={i.icon} />
          <span>{i.label}</span>
        </Link>
      ))}
      <div className="user-menu-container sidebar-user-menu" ref={menuRef}>
        <button
          className="user-menu-trigger sidebar-profile-trigger"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-controls="user-menu"
          aria-label={`${name || "Cuenta"}, abrir perfil`}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="user-menu-name">{name || "Cuenta"}</span>
          <span className="user-menu-mobile-icon" aria-hidden="true">
            <NavIcon name="profile" />
            <span className="user-menu-initials">{initials}</span>
          </span>
          <svg className="user-menu-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="m5 7.5 5 5 5-5" />
          </svg>
        </button>
        {menuOpen && (
          <div className="user-menu" id="user-menu">
            <div className="user-menu-account">
              <strong>{name || "Cuenta"}</strong>
              <div className="sync-status" role="status" aria-live="polite">
                <span className={`sync-indicator ${syncState}`} />
                {syncStatus}
              </div>
            </div>
            <button className="signout-button" onClick={() => signOut({ callbackUrl: "/" })}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 3H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4M12 14l4-4-4-4M7 10h9" />
              </svg>
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
