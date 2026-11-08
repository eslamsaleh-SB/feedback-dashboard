"use client";

// Join several videos into one MP4 in the browser (WebCodecs via mediabunny).
// Before each clip a black title card with the clip's text is shown for a few
// seconds. Output: 1280x720 H.264, 30 fps, video only (no audio).

export type MergeClip = { title: string; file: Blob };

const W = 1280;
const H = 720;
const FPS = 30;
const CARD_SECONDS = 2;

function drawCard(ctx: CanvasRenderingContext2D, text: string) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const words = (text || " ").split(/\s+/);
  // Shrink the font until the wrapped text fits in the frame.
  for (let size = 72; size >= 24; size -= 4) {
    ctx.font = `bold ${size}px -apple-system, "Segoe UI", Tahoma, Arial, sans-serif`;
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width > W * 0.85 && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    const lh = size * 1.3;
    if (lines.length * lh <= H * 0.8 || size === 24) {
      const y0 = H / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * lh));
      return;
    }
  }
}

export async function mergeVideos(
  clips: MergeClip[],
  onProgress?: (info: { clip: number; total: number; fraction: number }) => void
): Promise<Blob> {
  const mb = await import("mediabunny");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const source = new mb.CanvasSource(canvas, {
    codec: "avc",
    quality: new mb.Quality({ bitrate: 2_000_000, bitrateMode: "variable" }),
    keyFrameInterval: 2,
  });
  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new mb.BufferTarget(),
  });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();

  let t = 0; // running timestamp of the output, seconds
  const frame = 1 / FPS;

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];

    // Title card
    drawCard(ctx, clip.title);
    for (let k = 0; k < CARD_SECONDS * FPS; k++) {
      await source.add(t, frame);
      t += frame;
    }

    // Clip frames, resampled to a steady 30 fps.
    const input = new mb.Input({ source: new mb.BlobSource(clip.file), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error(`"${clip.title}": no video track`);
    const duration = await input.computeDuration();
    const sink = new mb.CanvasSink(track, { width: W, height: H, fit: "contain" });

    let first: number | null = null;
    let next = 0; // next output frame time, relative to clip start
    for await (const wc of sink.canvases()) {
      if (first == null) first = wc.timestamp;
      const rel = wc.timestamp - first;
      const until = rel + (wc.duration || frame);
      while (next < until) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(wc.canvas as CanvasImageSource, 0, 0, W, H);
        await source.add(t, frame);
        t += frame;
        next += frame;
      }
      if (duration) onProgress?.({ clip: i + 1, total: clips.length, fraction: Math.min(1, until / duration) });
    }
    input.dispose?.();
  }

  source.close();
  await output.finalize();
  const buf = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
  if (!buf) throw new Error("Merging produced no output");
  return new Blob([buf], { type: "video/mp4" });
}
