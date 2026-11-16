"use client";
import { useState } from "react";
import { useData } from "@/components/DataProvider";

// Placeholder: por ahora solo nombres de rutinas. Se amplía cuando definas qué cargar.
export default function Rutinas() {
  const { data, update, loading } = useData();
  const [name, setName] = useState("");
  if (loading) return <p>Cargando…</p>;

  const add = () => {
    if (!name.trim()) return;
    update((d) => ({ ...d, routines: [...d.routines, { id: crypto.randomUUID(), name: name.trim() }] }));
    setName("");
  };

  return (
    <>
      <h2>Rutinas</h2>
      <div className="row">
        <input value={name} placeholder="Nombre de la rutina…" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="primary" onClick={add}>Agregar</button>
      </div>
      <ul className="list">
        {data.routines.map((r) => (
          <li key={r.id}>
            {r.name}
            <button onClick={() => update((d) => ({ ...d, routines: d.routines.filter((x) => x.id !== r.id) }))}>✕</button>
          </li>
        ))}
      </ul>
    </>
  );
}
