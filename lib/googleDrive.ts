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

let cached: { token: string; exp: number } | null = null;

/** Opens the Google popup (first time) and returns a read-only Drive token. */
export async function getDriveToken(loginHint?: string | null): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new Error("Google client ID is not configured");
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      hint: loginHint ?? undefined,
      callback: (resp: any) => {
        if (resp?.error || !resp?.access_token) {
          reject(new Error(resp?.error_description || resp?.error || "Google sign-in was cancelled"));
          return;
        }
        cached = { token: resp.access_token, exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000 };
        resolve(resp.access_token);
      },
      error_callback: (err: any) => reject(new Error(err?.message || "Google sign-in was cancelled")),
    });
    client.requestAccessToken({ prompt: "" });
  });
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
  if (meta.size && Number(meta.size) > 50 * 1024 * 1024) {
    throw new Error(`Over 50 MB (${(Number(meta.size) / 1048576).toFixed(0)} MB)`);
  }

  const res = await fetch(`${base}?alt=media&supportsAllDrives=true`, { headers: auth });
  if (!res.ok) throw new Error(`Drive download error ${res.status}`);
  const blob = await res.blob();
  return new File([blob], meta.name || `${driveId}.mp4`, { type: meta.mimeType || blob.type || "video/mp4" });
}
