"use client";

// Read Google Drive files straight from the admin's browser, using the admin's
// own Google (Hudl) account. Nothing is downloaded to the computer: the bytes
// go Drive -> browser memory -> Supabase.
//
// Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID (an OAuth "Web application" client from a
// Google Cloud project; consent screen type "Internal" so only Hudl accounts
// can use it).

// An OAuth *client ID* is public by design (it ships to every browser), so it
// can live in the code; the env var just overrides it. Never put a client SECRET here.
const CLIENT_ID_IN_CODE = "883187248676-mrup9j7au38qndrl35a5f43d2ji32rg0.apps.googleusercontent.com";
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || CLIENT_ID_IN_CODE;

let gisLoading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisLoading = null;
        reject(new Error("Could not load Google sign-in"));
      };
      document.head.appendChild(s);
    });
  }
  return gisLoading;
}

const READ_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
// Full Drive scope: needed to create folders/files inside an existing folder.
const WRITE_SCOPE = "https://www.googleapis.com/auth/drive";
const cached: Record<string, { token: string; exp: number }> = {};

/** Opens the Google popup (first time) and returns a Drive token. */
export async function getDriveToken(loginHint?: string | null, write = false): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new Error("Google client ID is not configured");
  // A write token can also read.
  const w = cached[WRITE_SCOPE];
  if (w && w.exp > Date.now() + 60_000) return w.token;
  const scope = write ? WRITE_SCOPE : READ_SCOPE;
  const c = cached[scope];
  if (c && c.exp > Date.now() + 60_000) return c.token;
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope,
      hint: loginHint ?? undefined,
      callback: (resp: any) => {
        if (resp?.error || !resp?.access_token) {
          reject(new Error(resp?.error_description || resp?.error || "Google sign-in was cancelled"));
          return;
        }
        cached[scope] = { token: resp.access_token, exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000 };
        resolve(resp.access_token);
      },
      error_callback: (err: any) => reject(new Error(err?.message || "Google sign-in was cancelled")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const qEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function findChild(token: string, parentId: string, name: string, folder: boolean): Promise<string | null> {
  const q =
    `'${qEsc(parentId)}' in parents and name = '${qEsc(name)}' and trashed = false and ` +
    (folder ? "mimeType = 'application/vnd.google-apps.folder'" : "mimeType != 'application/vnd.google-apps.folder'");
  const r = await fetch(
    `${API}?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) throw new Error(`Drive search failed (${r.status})`);
  const j = await r.json();
  return j.files?.[0]?.id ?? null;
}

/** Returns the id of folder `name` inside `parentId`, creating it if needed. */
export async function findOrCreateFolder(token: string, parentId: string, name: string): Promise<string> {
  const found = await findChild(token, parentId, name, true);
  if (found) return found;
  const r = await fetch(`${API}?supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!r.ok) {
    if (r.status === 403 || r.status === 404) throw new Error("No permission to create a folder in the target Drive folder");
    throw new Error(`Could not create the Drive folder (${r.status})`);
  }
  return (await r.json()).id;
}

/**
 * Upload (or replace, if a file with the same name exists) a blob into a Drive
 * folder with a resumable upload. Returns the file's Drive link.
 */
export async function uploadToDriveFolder(
  token: string,
  folderId: string,
  name: string,
  blob: Blob,
  onProgress?: (fraction: number) => void
): Promise<string> {
  const existing = await findChild(token, folderId, name, false);
  const type = blob.type || "video/mp4";
  const init = await fetch(
    existing
      ? `${UPLOAD}/${existing}?uploadType=resumable&supportsAllDrives=true`
      : `${UPLOAD}?uploadType=resumable&supportsAllDrives=true`,
    {
      method: existing ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": type,
        "X-Upload-Content-Length": String(blob.size),
      },
      body: JSON.stringify(existing ? { name } : { name, parents: [folderId], mimeType: type }),
    }
  );
  const session = init.headers.get("Location");
  if (!init.ok || !session) throw new Error(`Could not start the Drive upload (${init.status})`);

  const CHUNK = 64 * 256 * 1024; // 16 MB (must be a multiple of 256 KB)
  let offset = 0;
  let fileId: string | null = existing;
  while (offset < blob.size) {
    const end = Math.min(offset + CHUNK, blob.size);
    const r = await fetch(session, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${offset}-${end - 1}/${blob.size}` },
      body: blob.slice(offset, end),
    });
    if (r.status === 308) {
      const range = r.headers.get("Range");
      offset = range ? Number(range.split("-")[1]) + 1 : end;
    } else if (r.ok) {
      fileId = (await r.json()).id ?? fileId;
      offset = blob.size;
    } else {
      throw new Error(`Drive upload failed (${r.status})`);
    }
    onProgress?.(offset / blob.size);
  }
  return fileId ? `https://drive.google.com/file/d/${fileId}/view` : `https://drive.google.com/drive/folders/${folderId}`;
}

/** Fetch one Drive file as a File object (name + type from Drive metadata). */
export async function fetchDriveFile(driveId: string, token: string): Promise<File> {
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}`;
  const auth = { Authorization: `Bearer ${token}` };

  const metaRes = await fetch(`${base}?fields=name,mimeType,size&supportsAllDrives=true`, { headers: auth });
  if (!metaRes.ok) {
    if (metaRes.status === 404) throw new Error("File not found, or your account has no access to it");
    if (metaRes.status === 403) throw new Error("Drive refused access (403)");
    throw new Error(`Drive error ${metaRes.status}`);
  }
  const meta = await metaRes.json();
  // Big files are compressed in the browser afterwards; refuse only absurd sizes.
  if (meta.size && Number(meta.size) > 1024 * 1024 * 1024) {
    throw new Error(`Over 1 GB (${(Number(meta.size) / 1048576).toFixed(0)} MB) - too big to process in the browser`);
  }

  const res = await fetch(`${base}?alt=media&supportsAllDrives=true`, { headers: auth });
  if (!res.ok) throw new Error(`Drive download error ${res.status}`);
  const blob = await res.blob();
  return new File([blob], meta.name || `${driveId}.mp4`, { type: meta.mimeType || blob.type || "video/mp4" });
}
