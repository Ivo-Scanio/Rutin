"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import ColorPicker from "@/components/ColorPicker";
import { useData, type CalendarEvent } from "@/components/DataProvider";

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const GOOGLE_EVENT_COLOR = "#22d3ee";

type GoogleCalendarAttendee = {
  email: string;
  displayName?: string;
  responseStatus?: string;
  organizer?: boolean;
  self?: boolean;
};

type GoogleCalendarEvent = {
  id: string;
  recurringEventId?: string;
  summary?: string;
  description?: string;
  status?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: GoogleCalendarAttendee[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGoogleCalendarEvent(value: unknown): value is GoogleCalendarEvent {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.start) || !isRecord(value.end)) return false;
  if (value.attendees === undefined) return true;
  return Array.isArray(value.attendees) && value.attendees.every((attendee) => isRecord(attendee) && typeof attendee.email === "string");
}

async function readApiResponse(response: Response) {
  if (response.status === 204) return {};
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(result) && typeof result.message === "string"
      ? result.message
      : `No se pudo completar la solicitud (HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (!isRecord(result)) throw new Error("Google Calendar devolvió una respuesta inválida.");
  return result;
}

function eventDateKey(event: GoogleCalendarEvent) {
  if (event.start.date) return event.start.date;
  if (!event.start.dateTime) return null;
  const date = new Date(event.start.dateTime);
  return Number.isNaN(date.getTime()) ? null : dateKey(date);
}

function dateTimeKey(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateKey(date);
}

function eventEndDateKey(event: GoogleCalendarEvent) {
  if (event.end.date) {
    const inclusiveEnd = new Date(`${event.end.date}T00:00:00`);
    inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
    return dateKey(inclusiveEnd);
  }
  return dateTimeKey(event.end.dateTime);
}

function eventTimeInput(value?: string) {
  if (!value) return "09:00";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "09:00"
    : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function shiftDateKey(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function eventTimeLabel(event: GoogleCalendarEvent) {
  if (!event.start.dateTime || !event.end.dateTime) return "Todo el día";
  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Horario no disponible";
  const options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  return `${start.toLocaleTimeString("es-AR", options)}–${end.toLocaleTimeString("es-AR", options)}`;
}

function eventGuestCount(event: GoogleCalendarEvent) {
  return event.attendees?.filter((attendee) => !attendee.organizer && !attendee.self).length ?? 0;
}

function attendeeLabel(count: number) {
  return count === 0 ? "Solo" : `${count} ${count === 1 ? "invitado" : "invitados"}`;
}

function AttendanceBadge({ guestCount }: { guestCount: number }) {
  const hasGuests = guestCount > 0;
  return (
    <span className={`calendar-attendance-badge ${hasGuests ? "invited" : "solo"}`} title={hasGuests ? `Con ${attendeeLabel(guestCount)}` : "Evento solo para ti"}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {hasGuests ? (
          <>
            <circle cx="9" cy="8" r="3" />
            <path d="M3.5 20c.6-3.1 2.4-4.7 5.5-4.7s4.9 1.6 5.5 4.7M16.5 5.5a3 3 0 0 1 0 5.8M16 15.5c2.6.3 4.1 1.7 4.5 4.5" />
          </>
        ) : (
          <>
            <circle cx="12" cy="8" r="3.2" />
            <path d="M5.5 20c.7-3.5 2.8-5.3 6.5-5.3s5.8 1.8 6.5 5.3" />
          </>
        )}
      </svg>
      {attendeeLabel(guestCount)}
    </span>
  );
}

function parseAttendeeEmails(value: string) {
  const emails = [...new Set(value.split(/[,\n;]/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
  return emails.every((email) => EMAIL_PATTERN.test(email)) ? emails : null;
}

function responseStatusLabel(status?: string) {
  switch (status) {
    case "accepted": return { label: "Aceptó", className: "accepted" };
    case "declined": return { label: "Rechazó", className: "declined" };
    case "tentative": return { label: "Quizás", className: "tentative" };
    default: return { label: "Pendiente", className: "needs-action" };
  }
}

export default function Calendario() {
  const { data, update, loading } = useData();
  const [ref, setRef] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [todayKey, setTodayKey] = useState(() => dateKey(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState(() => dateKey(new Date()));
  const [eventColor, setEventColor] = useState("#22d3ee");
  const [editingCalendarEvent, setEditingCalendarEvent] = useState<CalendarEvent | null>(null);
  const eventDialogRef = useRef<HTMLDialogElement>(null);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [googleEventsLoading, setGoogleEventsLoading] = useState(false);
  const [googleEventsError, setGoogleEventsError] = useState<string | null>(null);
  const [googleCreateOpen, setGoogleCreateOpen] = useState(false);
  const [googleEventTitle, setGoogleEventTitle] = useState("");
  const [googleEventDescription, setGoogleEventDescription] = useState("");
  const [googleEventDate, setGoogleEventDate] = useState(() => dateKey(new Date()));
  const [googleStartTime, setGoogleStartTime] = useState("09:00");
  const [googleEndTime, setGoogleEndTime] = useState("10:00");
  const [googleAttendees, setGoogleAttendees] = useState("");
  const [selectedGoogleEvent, setSelectedGoogleEvent] = useState<GoogleCalendarEvent | null>(null);
  const [editingGoogleEvent, setEditingGoogleEvent] = useState(false);
  const [attendeeDraft, setAttendeeDraft] = useState("");
  const [googleEditTitle, setGoogleEditTitle] = useState("");
  const [googleEditDescription, setGoogleEditDescription] = useState("");
  const [googleEditStartDate, setGoogleEditStartDate] = useState(() => dateKey(new Date()));
  const [googleEditEndDate, setGoogleEditEndDate] = useState(() => dateKey(new Date()));
  const [googleEditStartTime, setGoogleEditStartTime] = useState("09:00");
  const [googleEditEndTime, setGoogleEditEndTime] = useState("10:00");
  const [googleEditAllDay, setGoogleEditAllDay] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [googleActionError, setGoogleActionError] = useState<string | null>(null);
  const [googleActionLoading, setGoogleActionLoading] = useState(false);
  const googleCreateDialogRef = useRef<HTMLDialogElement>(null);
  const googleEventDetailsDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = eventDialogRef.current;
    if (!dialog) return;
    if (eventOpen && !dialog.open) dialog.showModal();
    else if (!eventOpen && dialog.open) dialog.close();
  }, [eventOpen]);

  useEffect(() => {
    const dialog = googleCreateDialogRef.current;
    if (!dialog) return;
    if (googleCreateOpen && !dialog.open) dialog.showModal();
    else if (!googleCreateOpen && dialog.open) dialog.close();
  }, [googleCreateOpen]);

  useEffect(() => {
    const dialog = googleEventDetailsDialogRef.current;
    if (!dialog) return;
    if (selectedGoogleEvent && !dialog.open) dialog.showModal();
    else if (!selectedGoogleEvent && dialog.open) dialog.close();
  }, [selectedGoogleEvent]);

  useEffect(() => {
    if (loading) return;
    const controller = new AbortController();
    const timeMin = new Date(ref.getFullYear(), ref.getMonth(), 1).toISOString();
    const timeMax = new Date(ref.getFullYear(), ref.getMonth() + 1, 1).toISOString();
    const query = new URLSearchParams({ timeMin, timeMax });
    setGoogleEventsLoading(true);
    setGoogleEventsError(null);
    fetch(`/api/events?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await readApiResponse(response);
        if (!Array.isArray(result.events) || !result.events.every(isGoogleCalendarEvent)) {
          throw new Error("Google Calendar devolvió una lista de eventos inválida.");
        }
        return result.events;
      })
      .then((events) => {
        if (!controller.signal.aborted) setGoogleEvents(events);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setGoogleEvents([]);
          setGoogleEventsError(error instanceof Error ? error.message : "No se pudieron cargar los eventos de Google Calendar.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setGoogleEventsLoading(false);
      });
    return () => controller.abort();
  }, [loading, ref]);

  useEffect(() => {
    const nextMidnight = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1).getTime();
    const timeout = setTimeout(() => setTodayKey(dateKey(new Date())), nextMidnight - Date.now() + 1000);
    return () => clearTimeout(timeout);
  }, [todayKey]);

  useEffect(() => {
    if (eventDate < todayKey) setEventDate(todayKey);
  }, [eventDate, todayKey]);

  useEffect(() => {
    if (loading) return;
    const upcomingEvents = data.calendarEvents.filter((event) => event.date >= todayKey);
    if (upcomingEvents.length !== data.calendarEvents.length) {
      update((current) => ({ ...current, calendarEvents: upcomingEvents }));
    }
  }, [data.calendarEvents, loading, todayKey, update]);

  const first = (ref.getDay() + 6) % 7;
  const days = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const today = new Date();
  const monthPrefix = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
  const scheduledSessions = data.sessions.filter((session) => session.weekdays.length > 0);
  const monthEvents = data.calendarEvents.filter((event) => event.date.startsWith(monthPrefix));
  const monthGoogleEvents = googleEvents.filter((event) => eventDateKey(event)?.startsWith(monthPrefix));
  const selectedDateValue = selectedDate ? new Date(`${selectedDate}T00:00:00`) : null;
  const selectedWeekday = selectedDateValue ? (selectedDateValue.getDay() + 6) % 7 : null;
  const legendSessions = selectedWeekday === null
    ? scheduledSessions
    : scheduledSessions.filter((session) => session.weekdays.includes(selectedWeekday));
  const legendEvents = selectedDate
    ? data.calendarEvents.filter((event) => event.date === selectedDate)
    : monthEvents;
  const legendGoogleEvents = selectedDate
    ? googleEvents.filter((event) => eventDateKey(event) === selectedDate)
    : monthGoogleEvents;
  const legendGoogleEventItems = [...new Map(
    legendGoogleEvents.map((event) => [event.recurringEventId ?? event.id, event])
  ).values()];
  const hasLegendItems = legendSessions.length > 0 || legendEvents.length > 0 || legendGoogleEventItems.length > 0;
  const selectedDateLabel = selectedDateValue?.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  useEffect(() => {
    if (selectedDate && !selectedDate.startsWith(monthPrefix)) setSelectedDate(null);
  }, [monthPrefix, selectedDate]);
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const move = (offset: number) => setRef(new Date(ref.getFullYear(), ref.getMonth() + offset, 1));
  const toggleCalendarDate = (key: string) => {
    setSelectedDate((current) => current === key ? null : key);
  };

  const openGoogleEvent = (event: GoogleCalendarEvent) => {
    setGoogleActionError(null);
    setEditingGoogleEvent(false);
    setConfirmDelete(false);
    setAttendeeDraft(event.attendees?.map((attendee) => attendee.email).join(", ") ?? "");
    setGoogleEditTitle(event.summary ?? "");
    setGoogleEditDescription(event.description ?? "");
    const startDate = eventDateKey(event) ?? todayKey;
    setGoogleEditStartDate(startDate);
    setGoogleEditEndDate(eventEndDateKey(event) ?? startDate);
    setGoogleEditStartTime(eventTimeInput(event.start.dateTime));
    setGoogleEditEndTime(eventTimeInput(event.end.dateTime));
    setGoogleEditAllDay(Boolean(event.start.date));
    setSelectedGoogleEvent(event);
  };

  const openCalendarEvent = (event: CalendarEvent) => {
    setEditingCalendarEvent(event);
    setEventName(event.name);
    setEventDate(event.date);
    setEventColor(event.color);
    setEventOpen(true);
  };

  const createGoogleEvent = async (event: FormEvent) => {
    event.preventDefault();
    const title = googleEventTitle.trim();
    const attendees = parseAttendeeEmails(googleAttendees);
    if (!title) {
      setGoogleActionError("Escribe un título para el evento.");
      return;
    }
    if (!attendees) {
      setGoogleActionError("Revisa el formato de los correos de invitados.");
      return;
    }
    const startDateTime = `${googleEventDate}T${googleStartTime}:00`;
    const endDateTime = `${googleEventDate}T${googleEndTime}:00`;
    if (Date.parse(endDateTime) <= Date.parse(startDateTime)) {
      setGoogleActionError("La hora de fin debe ser posterior a la hora de inicio.");
      return;
    }

    setGoogleActionLoading(true);
    setGoogleActionError(null);
    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: googleEventDescription.trim(),
          startDateTime,
          endDateTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          attendees,
        }),
      });
      const result = await readApiResponse(response);
      const createdEvent = result.event;
      if (!isGoogleCalendarEvent(createdEvent)) throw new Error("Google Calendar no devolvió el evento creado.");
      setGoogleEvents((current) => [...current.filter((item) => item.id !== createdEvent.id), createdEvent]);
      const createdDate = new Date(`${googleEventDate}T00:00:00`);
      setRef(new Date(createdDate.getFullYear(), createdDate.getMonth(), 1));
      setGoogleCreateOpen(false);
      setGoogleEventTitle("");
      setGoogleEventDescription("");
      setGoogleAttendees("");
    } catch (error) {
      setGoogleActionError(error instanceof Error ? error.message : "No se pudo crear el evento.");
    } finally {
      setGoogleActionLoading(false);
    }
  };

  const updateGoogleEvent = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedGoogleEvent) return;
    const attendees = parseAttendeeEmails(attendeeDraft);
    const title = googleEditTitle.trim();
    if (!title) {
      setGoogleActionError("Escribe un título para el evento.");
      return;
    }
    if (!attendees) {
      setGoogleActionError("Revisa el formato de los correos de invitados.");
      return;
    }

    let start: Record<string, string>;
    let end: Record<string, string>;
    if (googleEditAllDay) {
      if (googleEditEndDate < googleEditStartDate) {
        setGoogleActionError("La fecha de fin debe ser igual o posterior a la fecha de inicio.");
        return;
      }
      start = { date: googleEditStartDate };
      end = { date: shiftDateKey(googleEditEndDate, 1) };
    } else {
      const startDateTime = new Date(`${googleEditStartDate}T${googleEditStartTime}:00`);
      const endDateTime = new Date(`${googleEditEndDate}T${googleEditEndTime}:00`);
      if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime()) || endDateTime <= startDateTime) {
        setGoogleActionError("La fecha y hora de fin deben ser posteriores al inicio.");
        return;
      }
      start = { dateTime: startDateTime.toISOString() };
      end = { dateTime: endDateTime.toISOString() };
    }

    setGoogleActionLoading(true);
    setGoogleActionError(null);
    try {
      const response = await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedGoogleEvent.id,
          title,
          description: googleEditDescription.trim(),
          start,
          end,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          attendees,
        }),
      });
      const result = await readApiResponse(response);
      const updatedEvent = result.event;
      if (!isGoogleCalendarEvent(updatedEvent)) throw new Error("Google Calendar no devolvió el evento actualizado.");
      setGoogleEvents((current) => current.map((item) => item.id === updatedEvent.id ? updatedEvent : item));
      setSelectedGoogleEvent(updatedEvent);
      setEditingGoogleEvent(false);
    } catch (error) {
      setGoogleActionError(error instanceof Error ? error.message : "No se pudo actualizar el evento.");
    } finally {
      setGoogleActionLoading(false);
    }
  };

  const deleteGoogleEvent = async () => {
    if (!selectedGoogleEvent) return;
    setGoogleActionLoading(true);
    setGoogleActionError(null);
    try {
      const query = new URLSearchParams({ eventId: selectedGoogleEvent.id });
      await readApiResponse(await fetch(`/api/events?${query}`, { method: "DELETE" }));
      setGoogleEvents((current) => current.filter((item) => item.id !== selectedGoogleEvent.id));
      setSelectedGoogleEvent(null);
      setConfirmDelete(false);
    } catch (error) {
      setGoogleActionError(error instanceof Error ? error.message : "No se pudo eliminar el evento.");
    } finally {
      setGoogleActionLoading(false);
    }
  };

  const addEvent = (event: FormEvent) => {
    event.preventDefault();
    const cleanName = eventName.trim();
    if (!cleanName || eventDate < todayKey) return;
    update((current) => ({
      ...current,
      calendarEvents: editingCalendarEvent
        ? current.calendarEvents.map((item) => item.id === editingCalendarEvent.id
          ? { ...item, name: cleanName, date: eventDate, color: eventColor }
          : item)
        : [...current.calendarEvents, { id: crypto.randomUUID(), name: cleanName, date: eventDate, color: eventColor }],
    }));
    setEventName("");
    setEventDate(todayKey);
    setEventColor("#22d3ee");
    setEditingCalendarEvent(null);
    setEventOpen(false);
  };

  return (
    <>
      <h2>Calendario</h2>
      <div className="calendar-toolbar">
        <div className="row calendar-month-nav">
          <button aria-label="Mes anterior" onClick={() => move(-1)}>←</button>
          <strong>{ref.toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</strong>
          <button aria-label="Mes siguiente" onClick={() => move(1)}>→</button>
        </div>
        <div className="calendar-actions">
          <button onClick={() => {
            setEditingCalendarEvent(null);
            setEventName("");
            setEventDate(selectedDate && selectedDate >= todayKey ? selectedDate : todayKey);
            setEventColor("#22d3ee");
            setEventOpen(true);
          }}>+ Evento</button>
          <button className="primary" onClick={() => {
            setGoogleActionError(null);
            setGoogleCreateOpen(true);
          }}>+ Invitar</button>
        </div>
      </div>
      {googleEventsLoading && <p className="muted calendar-api-status">Cargando eventos de Google Calendar…</p>}
      {googleEventsError && <p className="calendar-api-error" role="alert">{googleEventsError}</p>}

      <dialog ref={eventDialogRef} className="session-dialog calendar-event-dialog" aria-labelledby="calendar-event-title"
        onCancel={() => setEventOpen(false)} onClose={() => setEventOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) setEventOpen(false); }}>
        <div className="session-dialog-heading">
          <h3 id="calendar-event-title">{editingCalendarEvent ? "Editar evento" : "Agregar evento único"}</h3>
          <button type="button" aria-label="Cerrar" onClick={() => setEventOpen(false)}>✕</button>
        </div>
        <form className="session-form" onSubmit={addEvent}>
          <label>Nombre del evento<input required value={eventName} onChange={(event) => setEventName(event.target.value)} placeholder="Ej. Entregar trabajo" /></label>
          <label>Fecha<input type="date" required min={todayKey} value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></label>
          <ColorPicker label="Color del evento" color={eventColor} onChange={setEventColor} />
          <p className="muted calendar-event-hint">Este evento aparece una sola vez y se elimina cuando pasa su fecha.</p>
          <div className="calendar-event-actions">
            {editingCalendarEvent && <button type="button" className="danger-button" onClick={() => {
              const eventId = editingCalendarEvent.id;
              update((current) => ({ ...current, calendarEvents: current.calendarEvents.filter((item) => item.id !== eventId) }));
              setEditingCalendarEvent(null);
              setEventOpen(false);
            }}>Eliminar evento</button>}
            <button className="primary" type="submit">Guardar evento</button>
          </div>
        </form>
      </dialog>

      <dialog ref={googleCreateDialogRef} className="session-dialog calendar-event-dialog google-event-dialog" aria-labelledby="google-event-create-title"
        onCancel={() => setGoogleCreateOpen(false)} onClose={() => setGoogleCreateOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) setGoogleCreateOpen(false); }}>
        <div className="session-dialog-heading">
          <h3 id="google-event-create-title">Invitar con Google Calendar</h3>
          <button type="button" aria-label="Cerrar" onClick={() => setGoogleCreateOpen(false)}>✕</button>
        </div>
        <form className="session-form" onSubmit={createGoogleEvent}>
          <label>Título<input required value={googleEventTitle} onChange={(event) => setGoogleEventTitle(event.target.value)} placeholder="Ej. Reunión de equipo" /></label>
          <label>Descripción<textarea value={googleEventDescription} onChange={(event) => setGoogleEventDescription(event.target.value)} rows={3} placeholder="Detalles del evento (opcional)" /></label>
          <label>Fecha<input type="date" required min={todayKey} value={googleEventDate} onChange={(event) => setGoogleEventDate(event.target.value)} /></label>
          <div className="calendar-time-fields">
            <label>Hora de inicio<input type="time" required value={googleStartTime} onChange={(event) => setGoogleStartTime(event.target.value)} /></label>
            <label>Hora de fin<input type="time" required value={googleEndTime} onChange={(event) => setGoogleEndTime(event.target.value)} /></label>
          </div>
          <label>Invitados (correos separados por coma)
            <input type="email" multiple value={googleAttendees} onChange={(event) => setGoogleAttendees(event.target.value)} placeholder="federico@gmail.com, otra@gmail.com" />
          </label>
          <p className="muted calendar-event-hint">Se usará tu zona horaria local. Google enviará las invitaciones por correo.</p>
          {googleActionError && <p className="calendar-api-error" role="alert">{googleActionError}</p>}
          <div className="calendar-event-actions">
            <button type="button" onClick={() => setGoogleCreateOpen(false)} disabled={googleActionLoading}>Cancelar</button>
            <button className="primary" type="submit" disabled={googleActionLoading}>{googleActionLoading ? "Creando…" : "Crear e invitar"}</button>
          </div>
        </form>
      </dialog>

      <dialog ref={googleEventDetailsDialogRef} className="session-dialog calendar-event-dialog google-event-dialog" aria-labelledby="google-event-details-title"
        onCancel={() => setSelectedGoogleEvent(null)} onClose={() => setSelectedGoogleEvent(null)}
        onClick={(event) => { if (event.target === event.currentTarget) setSelectedGoogleEvent(null); }}>
        {selectedGoogleEvent && (
          <>
            <div className="session-dialog-heading">
              <h3 id="google-event-details-title">{selectedGoogleEvent.summary || "Evento de Google Calendar"}</h3>
              <button type="button" aria-label="Cerrar" onClick={() => setSelectedGoogleEvent(null)}>✕</button>
            </div>
            <p className="muted calendar-event-datetime">
              {eventDateKey(selectedGoogleEvent)
                ? new Date(`${eventDateKey(selectedGoogleEvent)}T00:00:00`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                : "Fecha no disponible"} · {eventTimeLabel(selectedGoogleEvent)}
            </p>
            {selectedGoogleEvent.description && <p className="calendar-event-description">{selectedGoogleEvent.description}</p>}
            <h4>Invitados</h4>
            {selectedGoogleEvent.attendees?.length ? (
              <ul className="calendar-attendees">
                {selectedGoogleEvent.attendees.map((attendee) => {
                  const status = responseStatusLabel(attendee.responseStatus);
                  return (
                    <li key={attendee.email}>
                      <span>
                        <strong>{attendee.displayName || attendee.email}</strong>
                        {attendee.displayName && <small>{attendee.email}</small>}
                      </span>
                      <span className={`attendee-status ${status.className}`}>{status.label}</span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="muted">Este evento no tiene invitados.</p>}

            {editingGoogleEvent ? (
              <form className="session-form attendee-edit-form" onSubmit={updateGoogleEvent}>
                <label>Título<input required value={googleEditTitle} onChange={(event) => setGoogleEditTitle(event.target.value)} /></label>
                <label>Descripción<textarea value={googleEditDescription} onChange={(event) => setGoogleEditDescription(event.target.value)} rows={3} /></label>
                <label className="calendar-all-day-toggle"><input type="checkbox" checked={googleEditAllDay} onChange={(event) => setGoogleEditAllDay(event.target.checked)} /> Todo el día</label>
                <div className="calendar-time-fields">
                  <label>Fecha de inicio<input type="date" required value={googleEditStartDate} onChange={(event) => setGoogleEditStartDate(event.target.value)} /></label>
                  <label>Fecha de fin<input type="date" required min={googleEditStartDate} value={googleEditEndDate} onChange={(event) => setGoogleEditEndDate(event.target.value)} /></label>
                </div>
                {!googleEditAllDay && (
                  <div className="calendar-time-fields">
                    <label>Hora de inicio<input type="time" required value={googleEditStartTime} onChange={(event) => setGoogleEditStartTime(event.target.value)} /></label>
                    <label>Hora de fin<input type="time" required value={googleEditEndTime} onChange={(event) => setGoogleEditEndTime(event.target.value)} /></label>
                  </div>
                )}
                <label>Invitados (correos separados por coma)
                  <input value={attendeeDraft} onChange={(event) => setAttendeeDraft(event.target.value)} placeholder="federico@gmail.com, otra@gmail.com" />
                </label>
                <div className="calendar-event-actions">
                  <button type="button" onClick={() => setEditingGoogleEvent(false)} disabled={googleActionLoading}>Cancelar</button>
                  <button className="primary" type="submit" disabled={googleActionLoading}>{googleActionLoading ? "Guardando…" : "Guardar cambios"}</button>
                </div>
              </form>
            ) : null}

            {confirmDelete ? (
              <div className="calendar-delete-confirm" role="alert">
                <p>¿Eliminar este evento de Google Calendar? Se avisará a los invitados.</p>
                <div className="calendar-event-actions">
                  <button type="button" onClick={() => setConfirmDelete(false)} disabled={googleActionLoading}>Cancelar</button>
                  <button type="button" className="danger-button" onClick={deleteGoogleEvent} disabled={googleActionLoading}>{googleActionLoading ? "Eliminando…" : "Confirmar eliminación"}</button>
                </div>
              </div>
            ) : null}

            {googleActionError && <p className="calendar-api-error" role="alert">{googleActionError}</p>}
            {!editingGoogleEvent && !confirmDelete && (
              <div className="calendar-event-actions">
                <button type="button" onClick={() => {
                  setGoogleActionError(null);
                  setEditingGoogleEvent(true);
                }}>Editar evento</button>
                <button type="button" className="danger-button" onClick={() => {
                  setGoogleActionError(null);
                  setConfirmDelete(true);
                }}>Eliminar evento</button>
              </div>
            )}
          </>
        )}
      </dialog>

      <div className="cal">
        {["L", "M", "M", "J", "V", "S", "D"].map((day, index) => <b key={index}>{day}</b>)}
        {cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} className="calendar-day empty-day" />;
          const date = new Date(ref.getFullYear(), ref.getMonth(), day);
          const weekday = (date.getDay() + 6) % 7;
          const key = dateKey(date);
          const isToday = day === today.getDate() && ref.getMonth() === today.getMonth() && ref.getFullYear() === today.getFullYear();
          const googleEventsForDay = googleEvents.filter((event) => eventDateKey(event) === key);
          const lines = [
            ...(loading ? [] : scheduledSessions.filter((session) => session.weekdays.includes(weekday)).map((session) => ({ id: `session-${session.id}`, name: session.name, color: session.color, title: session.name }))),
          ];
          const localEventsForDay = data.calendarEvents.filter((event) => event.date === key);
          return (
            <div
              key={key}
              className={`calendar-day${isToday ? " today" : ""}${selectedDate === key ? " selected" : ""}`}
              onClick={() => toggleCalendarDate(key)}
            >
              <button
                type="button"
                className={`calendar-day-number${isToday ? " current-day" : ""}`}
                aria-label={`Mostrar actividades del ${date.toLocaleDateString("es-AR", { day: "numeric", month: "long" })}`}
                aria-pressed={selectedDate === key}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleCalendarDate(key);
                }}
              >
                {day}
              </button>
              {lines.map((line) => <span key={line.id} className="calendar-session" title={line.title ?? line.name} aria-label={line.title ?? line.name} style={{ backgroundColor: line.color }} />)}
              {localEventsForDay.map((event) => (
                <button
                  type="button"
                  key={`event-${event.id}`}
                  className="calendar-session calendar-local-event"
                  title={`Editar ${event.name}`}
                  aria-label={`Editar evento ${event.name}`}
                  style={{ backgroundColor: event.color }}
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    openCalendarEvent(event);
                  }}
                />
              ))}
              {googleEventsForDay.map((event) => (
                <button
                  type="button"
                  key={`google-${event.id}`}
                  className="calendar-session calendar-google-event"
                  title={`${event.summary || "Evento de Google Calendar"} · ${attendeeLabel(eventGuestCount(event))}`}
                  aria-label={`Abrir evento ${event.summary || "de Google Calendar"}, ${attendeeLabel(eventGuestCount(event))}`}
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    openGoogleEvent(event);
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>

      {selectedDate && <p className="muted calendar-legend-heading">Actividades del {selectedDateLabel}</p>}
      {hasLegendItems ? (
        <div className="calendar-legend" aria-label={selectedDate ? `Actividades del ${selectedDateLabel}` : "Colores de sesiones y eventos"}>
          {legendSessions.map((session) => (
            <span key={`session-${session.id}`} className="calendar-legend-item">
              <i style={{ backgroundColor: session.color }} />
              {session.name}
            </span>
          ))}
          {legendEvents.map((event) => (
            <button type="button" key={`event-${event.id}`} className="calendar-legend-item calendar-local-event-legend" onClick={() => openCalendarEvent(event)}>
              <i style={{ backgroundColor: event.color }} />
              <span className="calendar-legend-name">{event.name}{!selectedDate && ` · ${new Date(`${event.date}T00:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`}</span>
              <AttendanceBadge guestCount={0} />
            </button>
          ))}
          {legendGoogleEventItems.map((event) => (
            <button type="button" key={`google-${event.id}`} className="calendar-legend-item calendar-google-event-legend" onClick={() => openGoogleEvent(event)}>
              <i style={{ backgroundColor: GOOGLE_EVENT_COLOR }} />
              <span className="calendar-legend-name">{event.summary || "Evento de Google Calendar"}</span>
              <AttendanceBadge guestCount={eventGuestCount(event)} />
            </button>
          ))}
        </div>
      ) : selectedDate ? <p className="muted calendar-empty-day">No hay actividades para este día.</p> : null}
      <p className="muted calendar-note">“Solo” indica un evento personal; los compartidos muestran cuántos invitados tienen. Cada línea de color corresponde a una sesión o evento.</p>
    </>
  );
}
