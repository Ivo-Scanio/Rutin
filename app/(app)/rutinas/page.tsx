"use client";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useData, type Routine, type RoutineStep } from "@/components/DataProvider";

type StepKind = RoutineStep["kind"];
type StepDraft = { id: string; kind: StepKind; name: string; value: string };

const createStepDraft = (kind: StepKind): StepDraft => ({
  id: crypto.randomUUID(),
  kind,
  name: kind === "rest" ? "Descanso" : "",
  value: kind === "repetitions" ? "15" : kind === "rest" ? "5" : "20",
});

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes ? `${minutes} min ${remaining} s` : `${seconds} s`;
};

function isStepKind(value: string): value is StepKind {
  return value === "repetitions" || value === "timed" || value === "rest";
}

export default function Rutinas() {
  const { data, update, loading } = useData();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [routineName, setRoutineName] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (editorOpen && !dialog.open) dialog.showModal();
    else if (!editorOpen && dialog.open) dialog.close();
  }, [editorOpen]);

  const resetEditor = () => {
    setRoutineName("");
    setEditingId(null);
    setSteps([]);
    setFormError(null);
    setEditorOpen(false);
  };

  const openNewRoutine = () => {
    setRoutineName("");
    setEditingId(null);
    setSteps([createStepDraft("repetitions")]);
    setFormError(null);
    setEditorOpen(true);
  };

  const openEditRoutine = (routine: Routine) => {
    setRoutineName(routine.name);
    setEditingId(routine.id);
    setSteps(routine.steps.map((step) => ({
      id: step.id,
      kind: step.kind,
      name: step.kind === "rest" ? "Descanso" : step.name,
      value: String(step.kind === "repetitions" ? step.repetitions : step.durationSeconds),
    })));
    setFormError(null);
    setEditorOpen(true);
  };

  const changeStepKind = (stepId: string, value: string) => {
    if (!isStepKind(value)) return;
    setSteps((current) => current.map((step) => {
      if (step.id !== stepId) return step;
      return {
        ...step,
        kind: value,
        name: value === "rest" ? "Descanso" : step.kind === "rest" ? "" : step.name,
        value: value === "repetitions"
          ? step.kind === "repetitions" ? step.value : "15"
          : value === "rest"
            ? step.kind === "rest" ? step.value : "5"
            : step.kind === "timed" ? step.value : "20",
      };
    }));
  };

  const moveStep = (index: number, offset: number) => {
    setSteps((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const saveRoutine = (event: FormEvent) => {
    event.preventDefault();
    const name = routineName.trim();
    if (!name) {
      setFormError("Escribí un título para la rutina.");
      return;
    }
    if (!steps.length) {
      setFormError("Agregá al menos un ejercicio o descanso.");
      return;
    }

    const savedSteps: RoutineStep[] = [];
    for (const [index, step] of steps.entries()) {
      const value = Number(step.value);
      if (!Number.isSafeInteger(value) || value < 1) {
        setFormError(`El paso ${index + 1} debe tener una cantidad o duración válida, mayor a cero.`);
        return;
      }
      if (step.kind !== "rest" && !step.name.trim()) {
        setFormError(`Escribí el nombre del ejercicio del paso ${index + 1}.`);
        return;
      }
      if (step.kind === "repetitions") {
        savedSteps.push({ id: step.id, kind: step.kind, name: step.name.trim(), repetitions: value });
      } else if (step.kind === "timed") {
        savedSteps.push({ id: step.id, kind: step.kind, name: step.name.trim(), durationSeconds: value });
      } else {
        savedSteps.push({ id: step.id, kind: step.kind, durationSeconds: value });
      }
    }

    const routine: Routine = { id: editingId ?? crypto.randomUUID(), name, steps: savedSteps };
    update((current) => ({
      ...current,
      routines: editingId
        ? current.routines.map((item) => item.id === editingId ? routine : item)
        : [...current.routines, routine],
    }));
    resetEditor();
  };

  if (loading) return <p>Cargando…</p>;

  return (
    <>
      <div className="session-page-heading routine-page-heading">
        <div>
          <h2>Rutinas</h2>
          <p className="muted">Armá una secuencia con repeticiones, ejercicios cronometrados y descansos.</p>
        </div>
        <button className="session-add-button" aria-label="Agregar rutina" title="Agregar rutina" onClick={openNewRoutine}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <dialog ref={dialogRef} className="session-dialog routine-dialog" aria-labelledby="routine-editor-title"
        onCancel={resetEditor} onClose={resetEditor}
        onClick={(event) => { if (event.target === event.currentTarget) resetEditor(); }}>
        <div className="session-dialog-heading">
          <h3 id="routine-editor-title">{editingId ? "Editar rutina" : "Nueva rutina"}</h3>
          <button type="button" aria-label="Cerrar" onClick={resetEditor}>✕</button>
        </div>
        <form className="session-form" onSubmit={saveRoutine}>
          <label>Título de la rutina
            <input required autoFocus value={routineName} onChange={(event) => setRoutineName(event.target.value)} placeholder="Ej. Cardio, Estiramiento" />
          </label>

          <fieldset className="routine-step-editor">
            <legend>Secuencia</legend>
            <div className="routine-step-editor-list">
              {steps.map((step, index) => (
                <div className="routine-step-editor-item" key={step.id}>
                  <div className="routine-step-editor-heading">
                    <strong>Paso {index + 1}</strong>
                    <div className="routine-step-controls">
                      <button type="button" aria-label={`Subir paso ${index + 1}`} title="Subir" disabled={index === 0} onClick={() => moveStep(index, -1)}>↑</button>
                      <button type="button" aria-label={`Bajar paso ${index + 1}`} title="Bajar" disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)}>↓</button>
                      <button type="button" aria-label={`Quitar paso ${index + 1}`} title="Quitar" onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))}>✕</button>
                    </div>
                  </div>
                  <div className="routine-step-fields">
                    <label>Tipo
                      <select value={step.kind} onChange={(event) => changeStepKind(step.id, event.target.value)}>
                        <option value="repetitions">Por repeticiones</option>
                        <option value="timed">Ejercicio cronometrado</option>
                        <option value="rest">Descanso</option>
                      </select>
                    </label>
                    {step.kind !== "rest" && (
                      <label>Ejercicio
                        <input required value={step.name} onChange={(event) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, name: event.target.value } : item))} placeholder={step.kind === "timed" ? "Ej. Saltos tijera" : "Ej. Abdominales"} />
                      </label>
                    )}
                    <label>{step.kind === "repetitions" ? "Repeticiones" : "Duración (segundos)"}
                      <input type="number" required min="1" step="1" inputMode="numeric" value={step.value} onChange={(event) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, value: event.target.value } : item))} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div className="routine-add-step-actions">
              <button type="button" onClick={() => setSteps((current) => [...current, createStepDraft("repetitions")])}>+ Repeticiones</button>
              <button type="button" onClick={() => setSteps((current) => [...current, createStepDraft("timed")])}>+ Ejercicio cronometrado</button>
              <button type="button" onClick={() => setSteps((current) => [...current, createStepDraft("rest")])}>+ Descanso</button>
            </div>
          </fieldset>

          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="calendar-event-actions">
            <button type="button" onClick={resetEditor}>Cancelar</button>
            <button className="primary" type="submit">Guardar rutina</button>
          </div>
        </form>
      </dialog>

      {data.routines.length ? (
        <div className="routine-list">
          {data.routines.map((routine) => (
            <article key={routine.id} className="session-panel routine-card">
              <div className="routine-card-heading">
                <h3>{routine.name}</h3>
                <div>
                  <button type="button" onClick={() => openEditRoutine(routine)}>Editar</button>
                  <button type="button" className="danger-button" aria-label={`Eliminar rutina ${routine.name}`} onClick={() => update((current) => ({
                    ...current,
                    routines: current.routines.filter((item) => item.id !== routine.id),
                  }))}>Eliminar</button>
                </div>
              </div>
              {routine.steps.length ? (
                <ol className="routine-step-list">
                  {routine.steps.map((step, index) => (
                    <li key={step.id}>
                      <span className="routine-step-number">{index + 1}</span>
                      <span className="routine-step-info">
                        <strong>{step.kind === "rest" ? "Descanso" : step.name}</strong>
                        <small className="muted">{step.kind === "repetitions" ? `${step.repetitions} repeticiones` : formatDuration(step.durationSeconds)}</small>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : <p className="muted">Esta rutina todavía no tiene pasos. Editala para agregar ejercicios.</p>}
            </article>
          ))}
        </div>
      ) : <p className="muted routine-empty-state">Todavía no hay rutinas. Usá el botón + para crear una secuencia.</p>}
    </>
  );
}
