"use client";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

function hsvToHex(hue: number, saturation: number) {
  const chroma = saturation;
  const section = hue / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const rgb = section < 1 ? [chroma, x, 0]
    : section < 2 ? [x, chroma, 0]
    : section < 3 ? [0, chroma, x]
    : section < 4 ? [0, x, chroma]
    : section < 5 ? [x, 0, chroma]
    : [chroma, 0, x];
  return `#${rgb.map((channel) => Math.round((channel + 1 - chroma) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export default function ColorPicker({ label, color, onChange }: { label: string; color: string; onChange: (color: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const pickColor = (event: PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = Math.min(bounds.width, bounds.height) / 2;
    const dx = event.clientX - (bounds.left + bounds.width / 2);
    const dy = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.sqrt(dx * dx + dy * dy);
    const saturation = Math.min(1, distance / radius);
    const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
    const pointScale = distance > radius ? radius / distance : 1;
    onChange(hsvToHex(hue, saturation));
    setPoint({ x: 50 + dx * pointScale / radius * 50, y: 50 + dy * pointScale / radius * 50 });
  };

  return (
    <>
      <button type="button" className="color-picker-trigger" aria-label={`Elegir color para ${label}`} onClick={() => setOpen(true)}>
        <span className="selected-color-swatch" style={{ backgroundColor: color }} />
        <span>{label}</span>
      </button>
      <dialog
        ref={dialogRef}
        className="color-picker-dialog"
        aria-label={`Selector de color para ${label}`}
        onCancel={(event) => {
          event.stopPropagation();
          setOpen(false);
        }}
        onClose={(event) => {
          event.stopPropagation();
          setOpen(false);
        }}
      >
        <div className="color-picker-dialog-heading">
          <strong>Elegí un color</strong>
          <button type="button" aria-label="Cerrar selector de color" onClick={() => setOpen(false)}>✕</button>
        </div>
        <button
          type="button"
          className="color-wheel"
          aria-label="Rueda de colores"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pickColor(event);
          }}
          onPointerMove={(event) => { if (event.buttons === 1) pickColor(event); }}
        >
          {point && <span className="color-wheel-marker" style={{ left: `${point.x}%`, top: `${point.y}%`, backgroundColor: color }} />}
        </button>
        <div className="selected-color-preview">
          <span className="selected-color-swatch" style={{ backgroundColor: color }} />
          <span>Color seleccionado</span>
        </div>
      </dialog>
    </>
  );
}
