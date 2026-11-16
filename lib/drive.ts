const FILE = "rutin-data.json";
const API = "https://www.googleapis.com";

export class DriveApiError extends Error {
  constructor(readonly status: number, detail: string) {
    super(`Google Drive respondió ${status}: ${detail}`);
    this.name = "DriveApiError";
  }
}

async function findId(t: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${FILE}'`);
  const r = await fetch(`${API}/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${t}` },
    cache: "no-store",
  });
  if (!r.ok) throw new DriveApiError(r.status, await r.text());
  return (await r.json()).files?.[0]?.id ?? null;
}

export async function readData(t: string) {
  const id = await findId(t);
  if (!id) return null;
  const r = await fetch(`${API}/drive/v3/files/${id}?alt=media`, {
    headers: { Authorization: `Bearer ${t}` },
    cache: "no-store",
  });
  if (!r.ok) throw new DriveApiError(r.status, await r.text());
  return r.json();
}

export async function writeData(t: string, data: unknown) {
  const id = await findId(t);
  const b = "rutin_boundary";
  const meta = id ? {} : { name: FILE, parents: ["appDataFolder"] };
  const body =
    `--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${b}--`;
  const url = id
    ? `${API}/upload/drive/v3/files/${id}?uploadType=multipart`
    : `${API}/upload/drive/v3/files?uploadType=multipart`;
  const r = await fetch(url, {
    method: id ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": `multipart/related; boundary=${b}` },
    body,
  });
  if (!r.ok) throw new DriveApiError(r.status, await r.text());
}
