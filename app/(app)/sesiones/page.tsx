"use client";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import ColorPicker from "@/components/ColorPicker";
import { SessionLog, SessionPlan, useData } from "@/components/DataProvider";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return `${hours ? `${hours} h ` : ""}${minutes} min ${remaining} s`;
};
const formatClock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const weekStart = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
};

function Summary({ title, logs }: { title: string; logs: SessionLog[] }) {
  const totals = logs.reduce<Record<string, { name: string; color: string; seconds: number; completed: number; withinGoal: number }>>((result, log) => {
    const entry = result[log.sessionId] ?? { name: log.sessionName, color: log.color, seconds: 0, completed: 0, withinGoal: 0 };
    entry.seconds += log.durationSeconds;
    if (log.completed) entry.completed += 1;
    if (log.withinGoal) entry.withinGoal += 1;
    result[log.sessionId] = entry;
    return result;
  }, {});

  return (
    <section className="session-panel">
      <h3>{title}</h3>
      {Object.keys(totals).length ? (
        <ul className="session-summary">
          {Object.entries(totals).map(([id, total]) => (
            <li key={id}>
              <span className="session-color" style={{ backgroundColor: total.color }} />
              <span className="session-summary-name">{total.name}</span>
              <span>{formatDuration(total.seconds)}</span>
              <span className="muted">{total.completed} completada{total.completed === 1 ? "" : "s"} · {total.withinGoal} en objetivo</span>
            </li>
          ))}
        </ul>
      ) : <p className="muted">Todavía no hay sesiones en este período.</p>}
    </section>
  );
}

export default function Sesiones() {
  const { data, update, loading } = useData();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Estudio");
  const [minMinutes, setMinMinutes] = useState("30");
  const [maxMinutes, setMaxMinutes] = useState("60");
  const [color, setColor] = useState("#22d3ee");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [createOpen, setCreateOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeDialogRef = useRef<HTMLDialogElement>(null);
  const [activeDialogDismissed, setActiveDialogDismissed] = useState(true);
  const [pomodoroEnabled, setPomodoroEnabled] = useState(false);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroMode, setPomodoroMode] = useState<"work" | "break">("work");
  const [pomodoroLeft, setPomodoroLeft] = useState(data.settings.workMin * 60);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (createOpen && !dialog.open) dialog.showModal();
    else if (!createOpen && dialog.open) dialog.close();
  }, [createOpen]);

  useEffect(() => {
    const dialog = activeDialogRef.current;
    if (!dialog) return;
    if (data.activeSession && !activeDialogDismissed && !dialog.open) {
      if (window.matchMedia("(max-width: 640px)").matches) dialog.show();
      else dialog.showModal();
    }
    else if ((!data.activeSession || activeDialogDismissed) && dialog.open) dialog.close();
  }, [data.activeSession, activeDialogDismissed]);

  useEffect(() => {
    if (loading) return;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 1);
    const recentLogs = data.sessionLogs.filter((log) => new Date(log.endedAt).getTime() >= cutoff.getTime());
    if (recentLogs.length !== data.sessionLogs.length) {
      update((current) => ({ ...current, sessionLogs: recentLogs }));
    }
  }, [data.sessionLogs, loading, update]);

  useEffect(() => {
    if (!data.activeSession) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [data.activeSession?.startedAt]);

  useEffect(() => {
    if (!pomodoroEnabled || !pomodoroRunning || !data.activeSession) return;
    const interval = setInterval(() => setPomodoroLeft((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(interval);
  }, [data.activeSession?.startedAt, pomodoroEnabled, pomodoroRunning]);

  useEffect(() => {
    if (!pomodoroRunning) {
      setPomodoroLeft((pomodoroMode === "work" ? data.settings.workMin : data.settings.breakMin) * 60);
    }
  }, [data.settings.workMin, data.settings.breakMin, pomodoroMode, pomodoroRunning]);

  useEffect(() => {
    if (!pomodoroEnabled || !pomodoroRunning || pomodoroLeft > 0) return;
    const nextMode = pomodoroMode === "work" ? "break" : "work";
    setPomodoroMode(nextMode);
    setPomodoroLeft((nextMode === "work" ? data.settings.workMin : data.settings.breakMin) * 60);
  }, [data.settings.breakMin, data.settings.workMin, pomodoroEnabled, pomodoroLeft, pomodoroMode, pomodoroRunning]);

  if (loading) return <p>Cargando…</p>;

  const activePlan = data.sessions.find((session) => session.id === data.activeSession?.sessionId);
  const elapsedSeconds = data.activeSession ? Math.max(0, Math.floor((now - new Date(data.activeSession.startedAt).getTime()) / 1000)) : 0;
  const today = new Date();
  const startOfWeek = weekStart(today).getTime();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const weeklyLogs = data.sessionLogs.filter((log) => new Date(log.endedAt).getTime() >= startOfWeek);
  const monthlyLogs = data.sessionLogs.filter((log) => new Date(log.endedAt).getTime() >= startOfMonth);

  const startSession = (sessionId: string) => {
    setActiveDialogDismissed(false);
    setPomodoroEnabled(false);
    setPomodoroRunning(false);
    setPomodoroMode("work");
    setPomodoroLeft(data.settings.workMin * 60);
    update((current) => ({ ...current, activeSession: { sessionId, startedAt: new Date().toISOString() } }));
  };

  const setPomodoroSetting = (key: "workMin" | "breakMin", value: number) => {
    update((current) => ({
      ...current,
      settings: { ...current.settings, [key]: Math.max(1, Math.floor(value || 1)) },
    }));
  };

  const addSession = (event: FormEvent) => {
    event.preventDefault();
    const min = Number(minMinutes);
    const max = Number(maxMinutes);
    const cleanName = name.trim();
    const cleanCategory = category.trim();
    if (!cleanName || !cleanCategory || !Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || (repeatWeekly && weekdays.length === 0)) return;

    const session: SessionPlan = {
      id: crypto.randomUUID(),
      name: cleanName,
      category: cleanCategory,
      minMinutes: min,
      maxMinutes: max,
      color,
      weekdays: repeatWeekly ? weekdays : [],
    };
    update((current) => ({
      ...current,
      sessions: [...current.sessions, session],
      sessionCategories: current.sessionCategories.includes(cleanCategory)
        ? current.sessionCategories
        : [...current.sessionCategories, cleanCategory],
    }));
    setName("");
    setColor("#22d3ee");
    setWeekdays([]);
    setRepeatWeekly(false);
    setCreateOpen(false);
  };

  const finishSession = (completed: boolean) => {
    setPomodoroRunning(false);
    setPomodoroEnabled(false);
    setActiveDialogDismissed(true);
    if (!data.activeSession || !activePlan) {
      if (data.activeSession) update((current) => ({ ...current, activeSession: null }));
      return;
    }
    const endedAt = new Date().toISOString();
    const durationSeconds = Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(data.activeSession.startedAt).getTime()) / 1000));
    const log: SessionLog = {
      id: crypto.randomUUID(),
      sessionId: activePlan.id,
      sessionName: activePlan.name,
      category: activePlan.category,
      color: activePlan.color,
      startedAt: data.activeSession.startedAt,
      endedAt,
      durationSeconds,
      completed,
      withinGoal: durationSeconds >= activePlan.minMinutes * 60 && durationSeconds <= activePlan.maxMinutes * 60,
    };
    update((current) => ({ ...current, activeSession: null, sessionLogs: [...current.sessionLogs, log] }));
  };

  return (
    <>
      <div className="session-page-heading">
        <div>
          <h2>Sesiones</h2>
          <p className="muted">Organizá tu tiempo, registrá lo que hacés y revisá tu progreso.</p>
        </div>
        <button className="session-add-button" aria-label="Agregar sesión" title="Agregar sesión" onClick={() => setCreateOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <dialog ref={dialogRef} className="session-dialog" aria-labelledby="create-session-title"
        onCancel={() => setCreateOpen(false)} onClose={() => setCreateOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
        <div className="session-dialog-heading">
          <h3 id="create-session-title">Crear una sesión</h3>
          <button type="button" aria-label="Cerrar" onClick={() => setCreateOpen(false)}>✕</button>
        </div>
        <form className="session-form" onSubmit={addSession}>
          <label>Nombre<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Estudiar matemáticas" /></label>
          <label>Categoría<input required list="session-categories" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ej. Estudio, ocio, trabajo…" />
            <datalist id="session-categories">{data.sessionCategories.map((item) => <option key={item} value={item} />)}</datalist>
          </label>
          <div className="session-range">
            <label>Mínimo (min)<input type="number" min="1" step="1" required value={minMinutes} onChange={(event) => setMinMinutes(event.target.value)} /></label>
            <label>Máximo (min)<input type="number" min="1" step="1" required value={maxMinutes} onChange={(event) => setMaxMinutes(event.target.value)} /></label>
            <ColorPicker label="Color" color={color} onChange={setColor} />
          </div>
          <fieldset className="weekday-picker">
            <legend>Programación en el calendario</legend>
            <label className="repeat-weekly-toggle">
              <input type="checkbox" checked={repeatWeekly} onChange={(event) => {
                setRepeatWeekly(event.target.checked);
                if (!event.target.checked) setWeekdays([]);
              }} />
              Repetir cada semana
            </label>
            {repeatWeekly && (
              <>
                <label className="weekday-option">
                  <input type="checkbox" checked={weekdays.length === WEEKDAYS.length} onChange={() => setWeekdays((current) => current.length === WEEKDAYS.length ? [] : WEEKDAYS.map((_, index) => index))} />
                  Toda la semana
                </label>
                {WEEKDAYS.map((day, index) => (
                  <label key={day} className="weekday-option">
                    <input type="checkbox" checked={weekdays.includes(index)} onChange={() => setWeekdays((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index])} />
                    {day}
                  </label>
                ))}
                {!weekdays.length && <span className="form-error">Elegí los días o toda la semana.</span>}
              </>
            )}
          </fieldset>
          {Number(maxMinutes) < Number(minMinutes) && <p className="form-error">El máximo debe ser igual o mayor que el mínimo.</p>}
          <button className="primary" type="submit">Agregar sesión</button>
        </form>
      </dialog>

      <dialog
        ref={activeDialogRef}
        className="session-dialog active-session-dialog"
        aria-labelledby="active-session-title"
        onCancel={() => setActiveDialogDismissed(true)}
        onClose={() => setActiveDialogDismissed(true)}
        onClick={(event) => { if (event.target === event.currentTarget) setActiveDialogDismissed(true); }}
      >
        {data.activeSession && (
          <>
            <div className="session-dialog-heading">
              <div className="session-heading">
                {activePlan && <span className="session-color" style={{ backgroundColor: activePlan.color }} />}
                <div>
                  <h3 id="active-session-title">{activePlan?.name ?? "Sesión activa"}</h3>
                  {activePlan && <span className="muted">{activePlan.category}</span>}
                </div>
              </div>
              <button type="button" aria-label="Minimizar" title="Minimizar" onClick={() => setActiveDialogDismissed(true)}>—</button>
            </div>
            {activePlan ? (
              <>
                <div className="session-timer" aria-live="polite">{formatDuration(elapsedSeconds)}</div>
                <p className="muted">
                  Objetivo: {activePlan.minMinutes}–{activePlan.maxMinutes} min
                  {elapsedSeconds < activePlan.minMinutes * 60
                    ? " · Aún no llegaste al mínimo"
                    : elapsedSeconds > activePlan.maxMinutes * 60 ? " · Superaste el máximo" : " · Dentro del objetivo"}
                </p>
                <section className="pomodoro-section">
                  <label className="pomodoro-toggle">
                    <input type="checkbox" checked={pomodoroEnabled} onChange={(event) => {
                      const enabled = event.target.checked;
                      setPomodoroEnabled(enabled);
                      setPomodoroRunning(false);
                      setPomodoroMode("work");
                      setPomodoroLeft(data.settings.workMin * 60);
                    }} />
                    Usar reloj Pomodoro
                  </label>
                  {pomodoroEnabled && (
                    <>
                      <div className="pomodoro-clock" aria-live="polite">
                        <span className={`badge ${pomodoroMode}`}>{pomodoroMode === "work" ? "Foco" : "Descanso"}</span>
                        <strong>{formatClock(pomodoroLeft)}</strong>
                      </div>
                      <div className="pomodoro-controls">
                        <button className="primary" onClick={() => setPomodoroRunning((running) => !running)}>
                          {pomodoroRunning ? "Pausar Pomodoro" : "Iniciar Pomodoro"}
                        </button>
                        <button onClick={() => {
                          setPomodoroRunning(false);
                          setPomodoroMode("work");
                          setPomodoroLeft(data.settings.workMin * 60);
                        }}>Reiniciar</button>
                      </div>
                      <div className="pomodoro-settings">
                        <label>Foco (min)<input type="number" min="1" value={data.settings.workMin} onChange={(event) => setPomodoroSetting("workMin", Number(event.target.value))} /></label>
                        <label>Descanso (min)<input type="number" min="1" value={data.settings.breakMin} onChange={(event) => setPomodoroSetting("breakMin", Number(event.target.value))} /></label>
                      </div>
                      <p className="muted pomodoro-hint">El tiempo de la sesión sigue corriendo durante el foco y el descanso.</p>
                    </>
                  )}
                </section>
                <div className="row session-finish-actions">
                  <button className="primary" onClick={() => finishSession(true)}>Marcar como completada</button>
                  <button onClick={() => finishSession(false)}>Finalizar sin completar</button>
                </div>
              </>
            ) : (
              <><p>La sesión activa ya no está disponible.</p><button onClick={() => update((current) => ({ ...current, activeSession: null }))}>Cerrar sesión activa</button></>
            )}
          </>
        )}
      </dialog>

      {data.activeSession && (
        <div className="active-session-peek">
          <p><strong>{activePlan?.name ?? "Sesión en curso"}</strong><br /><span className="muted">{formatDuration(elapsedSeconds)}</span></p>
          <button onClick={() => setActiveDialogDismissed(false)}>Abrir cronómetro</button>
        </div>
      )}

      <section className="session-panel">
        <h3>Mis sesiones</h3>
        {data.sessions.length ? (
          <ul className="session-plans">
            {data.sessions.map((session) => (
              <li key={session.id}>
                <span className="session-color" style={{ backgroundColor: session.color }} />
                <div className="session-plan-info">
                  <strong>{session.name}</strong><span className="muted">{session.category} · {session.minMinutes}–{session.maxMinutes} min</span>
                  <span className="muted">{session.weekdays.length ? session.weekdays.map((day) => WEEKDAYS[day]).join(", ") : "Sin días programados"}</span>
                </div>
                <button className="primary" disabled={!!data.activeSession} onClick={() => startSession(session.id)}>Empezar</button>
                <button aria-label={`Eliminar ${session.name}`} disabled={data.activeSession?.sessionId === session.id} onClick={() => update((current) => ({ ...current, sessions: current.sessions.filter((item) => item.id !== session.id) }))}>✕</button>
              </li>
            ))}
          </ul>
        ) : <p className="muted">Todavía no creaste sesiones.</p>}
      </section>

      <Summary title="Resumen de esta semana" logs={weeklyLogs} />
      <Summary title="Resumen de este mes" logs={monthlyLogs} />

      <section className="session-panel">
        <h3>Historial semanal</h3>
        {weeklyLogs.length ? (
          <ul className="session-history">
            {[...weeklyLogs].reverse().map((log) => (
              <li key={log.id}>
                <span className="session-color" style={{ backgroundColor: log.color }} />
                <strong>{log.sessionName}</strong><span className="muted">{log.category} · {new Date(log.endedAt).toLocaleString("es-AR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span>{formatDuration(log.durationSeconds)}</span>
                <span className={log.completed ? "status-complete" : "muted"}>{log.completed ? "Completada" : "Incompleta"}{typeof log.withinGoal === "boolean" ? ` · ${log.withinGoal ? "En objetivo" : "Fuera del objetivo"}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">Las sesiones que termines esta semana aparecerán acá. El historial se conserva por un mes.</p>}
      </section>
    </>
  );
}
