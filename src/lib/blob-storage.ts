import "server-only";

// File storage abstraction. Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set
// (scales to thousands of templates/generated files); otherwise falls back to
// inline data URLs so the app still works locally / in a demo without a store.
export function blobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function putFile(
  pathname: string,
  data: Buffer | Uint8Array | string,
  contentType?: string
): Promise<string> {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as Uint8Array);
  if (blobConfigured()) {
    const { put } = await import("@vercel/blob");
    const res = await put(pathname, buf, {
      access: "public",
      contentType,
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return res.url;
  }
  const ct = contentType || "application/octet-stream";
  return `data:${ct};base64,${buf.toString("base64")}`;
}

export async function deleteFile(url: string): Promise<void> {
  if (!url || url.startsWith("data:")) return;
  if (blobConfigured()) {
    try {
      const { del } = await import("@vercel/blob");
      await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch {
      /* best-effort */
    }
  }
}

// Read a stored file back into a Buffer (works for both blob URLs and data URLs).
export async function fetchFileBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const i = url.indexOf(",");
    return Buffer.from(url.slice(i + 1), "base64");
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch file: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
