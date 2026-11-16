import { NextRequest, NextResponse } from "next/server";
import { getGoogleAccessToken, GoogleAccessTokenError } from "@/lib/google-token";

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const NO_STORE = { "Cache-Control": "no-store" };
const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const PERMISSION_MESSAGE = "Google Calendar necesita permiso. Cierra sesión y vuelve a entrar para concederlo, y verifica que Google Calendar API esté habilitada en Google Cloud Console.";

type GoogleCalendarAttendee = {
  email: string;
  displayName?: string;
  resource?: boolean;
  optional?: boolean;
  responseStatus?: string;
  comment?: string;
  additionalGuests?: number;
};

type GoogleCalendarEvent = {
  id: string;
  recurringEventId?: string;
  summary?: string;
  description?: string;
  status?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: GoogleCalendarAttendee[];
};

class GoogleCalendarApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "GoogleCalendarApiError";
  }
}

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requestGoogle<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    const message = error && typeof error.message === "string" ? error.message : `Google Calendar respondió ${response.status}`;
    throw new GoogleCalendarApiError(response.status, message);
  }

  return body as T;
}

async function withCalendarAccess<T>(req: NextRequest, operation: (token: string) => Promise<T>) {
  let token = await getGoogleAccessToken(req);
  if (!token) return { authorized: false as const };

  try {
    return { authorized: true as const, value: await operation(token) };
  } catch (error) {
    if (!(error instanceof GoogleCalendarApiError) || error.status !== 401) throw error;
    token = await getGoogleAccessToken(req, true);
    if (!token) return { authorized: false as const };
    return { authorized: true as const, value: await operation(token) };
  }
}

function errorResponse(error: unknown) {
  if (error instanceof RequestValidationError) {
    return NextResponse.json({ error: "invalid_request", message: error.message }, { status: 400, headers: NO_STORE });
  }
  if (error instanceof GoogleAccessTokenError) {
    return NextResponse.json({ error: "google_auth_error", message: error.message }, { status: 401, headers: NO_STORE });
  }
  if (error instanceof GoogleCalendarApiError) {
    if (error.status === 403) {
      return NextResponse.json({ error: "calendar_permission_required", message: PERMISSION_MESSAGE }, { status: 403, headers: NO_STORE });
    }
    if (error.status === 401) {
      return NextResponse.json({ error: "google_auth_error", message: "Google rechazó la autorización. Cierra sesión y vuelve a iniciar sesión." }, { status: 401, headers: NO_STORE });
    }
    const status = error.status >= 400 && error.status < 500 ? error.status : 502;
    return NextResponse.json({ error: "google_calendar_error", message: error.message }, { status, headers: NO_STORE });
  }
  const message = error instanceof Error ? error.message : "Error desconocido al comunicarse con Google Calendar.";
  return NextResponse.json({ error: "server_error", message }, { status: 500, headers: NO_STORE });
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new RequestValidationError("El cuerpo de la solicitud debe ser un objeto JSON.");
  return value;
}

async function readBody(req: NextRequest) {
  const body: unknown = await req.json().catch(() => null);
  return requireRecord(body);
}

function requireText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new RequestValidationError(`El campo ${field} es obligatorio.`);
  return value.trim();
}

function requireDateTime(value: unknown, field: string) {
  const dateTime = requireText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?$/.test(dateTime) || Number.isNaN(Date.parse(dateTime))) {
    throw new RequestValidationError(`El campo ${field} debe contener una fecha y hora válidas.`);
  }
  return dateTime;
}

function requireDate(value: unknown, field: string) {
  const date = requireText(value, field);
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new RequestValidationError(`El campo ${field} debe contener una fecha válida.`);
  }
  return date;
}

function requireAttendees(value: unknown) {
  if (!Array.isArray(value) || !value.every((email) => typeof email === "string")) {
    throw new RequestValidationError("La lista de invitados debe ser una lista de correos.");
  }
  const emails = [...new Set(value.map((email) => email.trim().toLowerCase()))];
  if (emails.some((email) => !EMAIL_PATTERN.test(email))) {
    throw new RequestValidationError("Uno o más correos de invitados no tienen un formato válido.");
  }
  return emails.map((email) => ({ email }));
}

function validateTimeZone(value: unknown) {
  const timeZone = requireText(value, "zona horaria");
  try {
    new Intl.DateTimeFormat("es", { timeZone });
  } catch {
    throw new RequestValidationError("La zona horaria no es válida.");
  }
  return timeZone;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const timeMin = searchParams.get("timeMin");
    const timeMax = searchParams.get("timeMax");
    if (!timeMin || !timeMax || Number.isNaN(Date.parse(timeMin)) || Number.isNaN(Date.parse(timeMax)) || Date.parse(timeMax) <= Date.parse(timeMin)) {
      throw new RequestValidationError("Indica un rango de fechas válido con timeMin y timeMax.");
    }

    const result = await withCalendarAccess(req, async (token) => {
      const events: GoogleCalendarEvent[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "250",
          fields: "items(id,recurringEventId,summary,description,status,start,end,attendees(email,displayName,responseStatus,organizer,self)),nextPageToken",
        });
        if (pageToken) params.set("pageToken", pageToken);
        const page = await requestGoogle<{ items?: GoogleCalendarEvent[]; nextPageToken?: string }>(
          token,
          `${EVENTS_URL}?${params.toString()}`
        );
        if (Array.isArray(page.items)) events.push(...page.items);
        pageToken = page.nextPageToken;
      } while (pageToken);
      return events;
    });

    if (!result.authorized) {
      return NextResponse.json({ error: "unauthorized", message: "Inicia sesión para consultar Google Calendar." }, { status: 401, headers: NO_STORE });
    }
    return NextResponse.json({ events: result.value }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readBody(req);
    const title = requireText(body.title, "título");
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const startDateTime = requireDateTime(body.startDateTime, "inicio");
    const endDateTime = requireDateTime(body.endDateTime, "fin");
    if (Date.parse(endDateTime) <= Date.parse(startDateTime)) {
      throw new RequestValidationError("La hora de fin debe ser posterior a la hora de inicio.");
    }
    const timeZone = validateTimeZone(body.timeZone);
    const attendees = requireAttendees(body.attendees);

    const result = await withCalendarAccess(req, (token) => requestGoogle<GoogleCalendarEvent>(
      token,
      `${EVENTS_URL}?sendUpdates=all`,
      {
        method: "POST",
        body: JSON.stringify({
          summary: title,
          description,
          start: { dateTime: startDateTime, timeZone },
          end: { dateTime: endDateTime, timeZone },
          attendees,
        }),
      }
    ));

    if (!result.authorized) {
      return NextResponse.json({ error: "unauthorized", message: "Inicia sesión para crear eventos en Google Calendar." }, { status: 401, headers: NO_STORE });
    }
    return NextResponse.json({ event: result.value }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await readBody(req);
    const eventId = requireText(body.eventId, "identificador del evento");
    const update: Record<string, unknown> = {};

    if ("title" in body) update.summary = requireText(body.title, "título");
    if ("description" in body) {
      if (typeof body.description !== "string") throw new RequestValidationError("La descripción debe ser texto.");
      update.description = body.description.trim();
    }

    if ("start" in body || "end" in body) {
      const start = requireRecord(body.start);
      const end = requireRecord(body.end);
      if ("dateTime" in start || "dateTime" in end) {
        const startDateTime = requireDateTime(start.dateTime, "inicio");
        const endDateTime = requireDateTime(end.dateTime, "fin");
        if (Date.parse(endDateTime) <= Date.parse(startDateTime)) {
          throw new RequestValidationError("La fecha y hora de fin deben ser posteriores al inicio.");
        }
        const timeZone = validateTimeZone(body.timeZone);
        update.start = { dateTime: startDateTime, timeZone };
        update.end = { dateTime: endDateTime, timeZone };
      } else {
        const startDate = requireDate(start.date, "fecha de inicio");
        const endDate = requireDate(end.date, "fecha de fin");
        if (endDate <= startDate) {
          throw new RequestValidationError("La fecha de fin debe ser posterior al inicio.");
        }
        update.start = { date: startDate };
        update.end = { date: endDate };
      }
    }

    const attendees = "attendees" in body ? requireAttendees(body.attendees) : null;
    if (attendees) update.attendees = attendees;
    if (!Object.keys(update).length) throw new RequestValidationError("Indica al menos un campo para actualizar.");

    const result = await withCalendarAccess(req, async (token) => {
      const eventUrl = `${EVENTS_URL}/${encodeURIComponent(eventId)}`;
      if (attendees) {
        const attendeeFields = "email,displayName,resource,optional,responseStatus,comment,additionalGuests";
        const existingEvent = await requestGoogle<GoogleCalendarEvent>(
          token,
          `${eventUrl}?${new URLSearchParams({ fields: `attendees(${attendeeFields})` })}`
        );
        const existingByEmail = new Map(
          (existingEvent.attendees ?? []).map((attendee) => [attendee.email.toLowerCase(), attendee])
        );
        update.attendees = attendees.map(({ email }) => {
          const existing = existingByEmail.get(email);
          return existing ? { ...existing } : { email };
        });
      }
      return requestGoogle<GoogleCalendarEvent>(
        token,
        `${eventUrl}?sendUpdates=all`,
        { method: "PATCH", body: JSON.stringify(update) }
      );
    });

    if (!result.authorized) {
      return NextResponse.json({ error: "unauthorized", message: "Inicia sesión para editar eventos de Google Calendar." }, { status: 401, headers: NO_STORE });
    }
    return NextResponse.json({ event: result.value }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const eventId = new URL(req.url).searchParams.get("eventId");
    if (!eventId?.trim()) throw new RequestValidationError("Indica el identificador del evento.");

    const result = await withCalendarAccess(req, (token) => requestGoogle<null>(
      token,
      `${EVENTS_URL}/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: "DELETE" }
    ));

    if (!result.authorized) {
      return NextResponse.json({ error: "unauthorized", message: "Inicia sesión para borrar eventos de Google Calendar." }, { status: 401, headers: NO_STORE });
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
