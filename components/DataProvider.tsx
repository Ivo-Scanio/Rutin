"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type Todo = { id: string; text: string; done: boolean };
export type Routine = { id: string; name: string };
export type SessionPlan = {
  id: string;
  name: string;
  category: string;
  minMinutes: number;
  maxMinutes: number;
  color: string;
  weekdays: number[];
};
export type CalendarEvent = { id: string; name: string; date: string; color: string };
export type SessionLog = {
  id: string;
  sessionId: string;
  sessionName: string;
  category: string;
  color: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  completed: boolean;
  withinGoal?: boolean;
};
export type ActiveSession = { sessionId: string; startedAt: string };
export type AppData = {
  todos: Todo[];
  routines: Routine[];
  sessions: SessionPlan[];
  calendarEvents: CalendarEvent[];
  sessionCategories: string[];
  sessionLogs: SessionLog[];
  activeSession: ActiveSession | null;
  settings: { workMin: number; breakMin: number };
};

const DEFAULT: AppData = {
  todos: [],
  routines: [],
  sessions: [],
  calendarEvents: [],
  sessionCategories: ["Ocio", "Estudio", "Trabajo", "Salud", "Personal"],
  sessionLogs: [],
  activeSession: null,
  settings: { workMin: 25, breakMin: 5 },
};

type Ctx = {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  saveError: string | null;
  retryLoad: () => void;
  retrySave: () => void;
};
const C = createContext<Ctx>(null!);
export const useData = () => useContext(C);

export default function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const loaded = useRef(false);
  const latestData = useRef(DEFAULT);
  const saveVersion = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    loaded.current = false;
    setLoading(true);
    setLoadError(null);
    fetch("/api/data", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error ?? `Error HTTP ${response.status}`);
        const stored = result?.data;
        const next: AppData = stored ? {
          ...DEFAULT,
          ...stored,
          todos: Array.isArray(stored.todos) ? stored.todos : [],
          routines: Array.isArray(stored.routines) ? stored.routines : [],
          sessions: Array.isArray(stored.sessions) ? stored.sessions : [],
          calendarEvents: Array.isArray(stored.calendarEvents) ? stored.calendarEvents : [],
          sessionCategories: Array.isArray(stored.sessionCategories) ? stored.sessionCategories : DEFAULT.sessionCategories,
          sessionLogs: Array.isArray(stored.sessionLogs) ? stored.sessionLogs : [],
          activeSession: stored.activeSession ?? null,
          settings: { ...DEFAULT.settings, ...stored.settings },
        } : DEFAULT;
        if (cancelled) return;
        latestData.current = next;
        setData(next);
        loaded.current = true;
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [loadAttempt]);

  const save = useCallback((next: AppData) => {
    const version = ++saveVersion.current;
    setSaving(true);
    setSaveError(null);
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch("/api/data", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
          keepalive: true,
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error ?? `Error HTTP ${response.status}`);
      })
      .then(() => {
        if (version === saveVersion.current) setSaving(false);
      })
      .catch((error: unknown) => {
        if (version === saveVersion.current) {
          setSaveError(error instanceof Error ? error.message : String(error));
          setSaving(false);
        }
      });
  }, []);

  const update = useCallback(
    (fn: (d: AppData) => AppData) => {
      if (!loaded.current) return;
      const next = fn(latestData.current);
      latestData.current = next;
      setData(next);
      save(next);
    },
    [save]
  );

  const retryLoad = useCallback(() => setLoadAttempt((attempt) => attempt + 1), []);
  const retrySave = useCallback(() => {
    if (loaded.current) save(latestData.current);
    else retryLoad();
  }, [retryLoad, save]);

  return (
    <C.Provider value={{ data, update, loading, saving, loadError, saveError, retryLoad, retrySave }}>
      {loadError ? (
        <div className="data-error" role="alert">
          <h2>No se pudieron cargar tus datos</h2>
          <p>{loadError}</p>
          <p>No se modificó ni reemplazó la información guardada.</p>
          <button onClick={retryLoad}>Reintentar</button>
        </div>
      ) : children}
      {saveError ? (
        <div className="data-status data-error" role="alert">
          <span>No se pudieron guardar los cambios: {saveError}</span>
          <button onClick={retrySave}>Reintentar guardado</button>
        </div>
      ) : saving ? <div className="data-status" role="status" aria-live="polite">Guardando…</div> : null}
    </C.Provider>
  );
}
