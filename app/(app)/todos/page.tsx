"use client";
import { useState } from "react";
import { useData } from "@/components/DataProvider";

export default function Todos() {
  const { data, update, loading } = useData();
  const [text, setText] = useState("");
  if (loading) return <p>Cargando…</p>;

  const add = () => {
    if (!text.trim()) return;
    update((d) => ({ ...d, todos: [...d.todos, { id: crypto.randomUUID(), text: text.trim(), done: false }] }));
    setText("");
  };

  return (
    <>
      <h2>TODOs</h2>
      <div className="row">
        <input value={text} placeholder="Nueva tarea…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="primary" onClick={add}>Agregar</button>
      </div>
      <ul className="list">
        {data.todos.map((t) => (
          <li key={t.id}>
            <label className={t.done ? "done" : ""}>
              <input type="checkbox" checked={t.done}
                onChange={() => update((d) => ({ ...d, todos: d.todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) }))} />
              {t.text}
            </label>
            <button onClick={() => update((d) => ({ ...d, todos: d.todos.filter((x) => x.id !== t.id) }))}>✕</button>
          </li>
        ))}
      </ul>
    </>
  );
}
