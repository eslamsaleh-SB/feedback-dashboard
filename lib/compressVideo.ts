"use client";

// Shrink a video in the browser (WebCodecs, hardware-accelerated in Chrome/Edge)
// so it fits under the storage per-file limit. Output: H.264/AAC MP4, max 720p,
// bitrate picked from the video's length so the result lands under `maxBytes`.

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // Supabase free-plan file limit

export async function compressVideo(
  file: File,
  maxBytes: number,
  onProgress?: (fraction: number) => void
): Promise<File> {
  const mb = await import("mediabunny");

  const run = async (budgetBytes: number) => {
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const duration = await input.computeDuration();
    if (!duration || !isFinite(duration)) throw new Error("Could not read the video length");

    const audioBps = 96_000;
    const videoBps = Math.max(250_000, Math.min(4_000_000, Math.floor((budgetBytes * 8) / duration - audioBps)));
    const track = await input.getPrimaryVideoTrack();
    const width = track && track.displayWidth > 1280 ? 1280 : undefined;

    const output = new mb.Output({
      format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new mb.BufferTarget(),
    });
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: { codec: "avc", width, quality: new mb.Quality(videoBps), forceTranscode: true },
      audio: { codec: "aac", quality: new mb.Quality(audioBps), forceTranscode: true },
      showWarnings: false,
    });
    if (!conversion.isValid) {
      throw new Error("This browser can't re-encode this video (try Chrome or Edge)");
    }
    conversion.onProgress = (p: number) => onProgress?.(p);
    await conversion.execute();
    const buf = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
    if (!buf) throw new Error("Compression produced no output");
    return buf;
  };

  // Aim for 85% of the limit; if the encoder overshoots, try once more, smaller.
  let buf = await run(maxBytes * 0.85);
  if (buf.byteLength > maxBytes) buf = await run(maxBytes * 0.6);
  if (buf.byteLength > maxBytes) {
    throw new Error(`Still ${(buf.byteLength / 1048576).toFixed(0)} MB after compression - video is too long`);
  }
  const name = file.name.replace(/\.[^.]+$/, "") + ".mp4";
  return new File([buf], name, { type: "video/mp4" });
}
