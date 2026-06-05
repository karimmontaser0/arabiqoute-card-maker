import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Arabic Podcast Quote Generator" },
      { name: "description", content: "Generate premium Arabic podcast quote cards for social media." },
    ],
  }),
  component: Index,
});

const CARD_SIZE = 1080;
const PHOTO_WIDTH = CARD_SIZE * 0.42;
const TEXT_WIDTH = CARD_SIZE * 0.58;
const PANEL_PADDING_X = 56;
const PANEL_PADDING_Y = 60;
const BADGE_WIDTH = 320;
const BADGE_HEIGHT = 80;
const CAIRO_FONT = '"Cairo", sans-serif';

type ExportPayload = {
  photo: string | null;
  podcast: string;
  guest: string;
  quote: string;
  quoteFontSize: number;
};

async function waitForCairoFont({ podcast, guest, quote, quoteFontSize }: ExportPayload) {
  if (!("fonts" in document)) return;

  const fonts = document.fonts;
  await Promise.all([
    fonts.load(`500 24px ${CAIRO_FONT}`, podcast || "بودكاست"),
    fonts.load(`700 28px ${CAIRO_FONT}`, guest || "ضيف"),
    fonts.load(`700 ${quoteFontSize}px ${CAIRO_FONT}`, quote || "اقتباس"),
  ]);
  await fonts.ready;
}

function setCairoFont(ctx: CanvasRenderingContext2D, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${CAIRO_FONT}`;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = async () => {
      try {
        await img.decode?.();
      } catch {
        // The image is already loaded; decode() can reject on some browsers for blob URLs.
      }
      resolve(img);
    };
    img.onerror = () => reject(new Error("Guest image could not be loaded for export"));
    img.src = src;
  });
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function splitLongToken(ctx: CanvasRenderingContext2D, token: string, maxWidth: number) {
  const pieces: string[] = [];
  let piece = "";
  for (const char of Array.from(token)) {
    const next = piece + char;
    if (piece && ctx.measureText(next).width > maxWidth) {
      pieces.push(piece);
      piece = char;
    } else {
      piece = next;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

function wrapRtlText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  const paragraphs = text.split(/\n/);

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const candidates = ctx.measureText(word).width > maxWidth ? splitLongToken(ctx, word, maxWidth) : [word];
      for (const candidate of candidates) {
        const next = line ? `${line} ${candidate}` : candidate;
        if (!line || ctx.measureText(next).width <= maxWidth) {
          line = next;
        } else {
          lines.push(line);
          line = candidate;
        }
      }
    }
    if (line) lines.push(line);
  }

  return lines;
}

async function renderQuoteCardCanvas(payload: ExportPayload) {
  await waitForCairoFont(payload);
  const guestImage = payload.photo ? await loadCanvasImage(payload.photo) : null;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas export is not supported in this browser");

  ctx.fillStyle = "#0F172A";
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

  const photoX = CARD_SIZE - PHOTO_WIDTH;
  if (guestImage) {
    drawCoverImage(ctx, guestImage, photoX, 0, PHOTO_WIDTH, CARD_SIZE);
  } else {
    ctx.fillStyle = "#0F172A";
    ctx.fillRect(photoX, 0, PHOTO_WIDTH, CARD_SIZE);
    ctx.fillStyle = "#94A3B8";
    setCairoFont(ctx, 400, 18);
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Guest Photo", photoX + PHOTO_WIDTH / 2, CARD_SIZE / 2);
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(photoX, 0, PHOTO_WIDTH, CARD_SIZE);

  const textRight = TEXT_WIDTH - PANEL_PADDING_X;
  const textMaxWidth = TEXT_WIDTH - PANEL_PADDING_X * 2;

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#CBD5E1";
  setCairoFont(ctx, 500, 24);
  ctx.fillText(payload.podcast, textRight, PANEL_PADDING_Y, textMaxWidth);

  ctx.fillStyle = "#FFFFFF";
  setCairoFont(ctx, 700, payload.quoteFontSize);
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";

  const topBlockHeight = Math.ceil(24 * 1.45);
  const bottomBlockHeight = payload.guest ? BADGE_HEIGHT : 0;
  const middleY = PANEL_PADDING_Y + topBlockHeight;
  const middleHeight = CARD_SIZE - PANEL_PADDING_Y * 2 - topBlockHeight - bottomBlockHeight;
  const quoteAreaY = middleY + 32;
  const quoteAreaHeight = middleHeight - 64;
  const lineHeight = payload.quoteFontSize * 1.7;
  const quoteLines = wrapRtlText(ctx, payload.quote, textMaxWidth);
  const quoteTop = quoteAreaY + Math.max(0, (quoteAreaHeight - quoteLines.length * lineHeight) / 2);

  quoteLines.forEach((line, index) => {
    ctx.fillText(line, textRight, quoteTop + index * lineHeight, textMaxWidth);
  });

  if (payload.guest) {
    const badgeX = TEXT_WIDTH - PANEL_PADDING_X - BADGE_WIDTH;
    const badgeY = CARD_SIZE - PANEL_PADDING_Y - BADGE_HEIGHT;
    ctx.fillStyle = "#FFFFFF";
    drawRoundedRect(ctx, badgeX, badgeY, BADGE_WIDTH, BADGE_HEIGHT, 4);
    ctx.fill();

    ctx.fillStyle = "#000000";
    setCairoFont(ctx, 700, 28);
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(payload.guest, badgeX + BADGE_WIDTH / 2, badgeY + BADGE_HEIGHT / 2, BADGE_WIDTH - 28);
  }

  return canvas;
}

function Index() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [podcast, setPodcast] = useState("بودكاست تكنولوجيا الاعمال");
  const [guest, setGuest] = useState("د.احمد السالمي");
  const [quote, setQuote] = useState(
    "«التركيز من أكثر المهارات المطلوبة في أي منظمة. الناس تهتم بالمؤهلات، وتهتم بأشياء كثيرة أخرى، لكن قليل من يلتفت إلى التركيز، مع أنه مهارة عظيمة جدًا في تحقيق النجاح، سواء للفرد أو للمنظمة.»"
  );
  const [dragOver, setDragOver] = useState(false);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const handleFile = useCallback((file: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setPhoto(url);
  }, []);

  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo);
    };
  }, [photo]);

  const quoteFontSize = (() => {
    const len = quote.length;
    if (len < 80) return 54;
    if (len < 140) return 46;
    if (len < 200) return 40;
    if (len < 280) return 34;
    return 30;
  })();
  const waitForImages = async (root: HTMLElement) => {
    const imgs = Array.from(root.querySelectorAll("img"));
    console.log(`[export] waiting for ${imgs.length} image(s)...`);
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete && img.naturalWidth > 0) return resolve();
            img.onload = () => resolve();
            img.onerror = () => {
              console.warn("[export] image failed to load:", img.src);
              resolve();
            };
          })
      )
    );
    if ((document as any).fonts?.ready) {
      const f: any = (document as any).fonts;
      if (f?.load) {
        try {
          await Promise.all([
            f.load('500 24px "Cairo"', "بودكاست تكنولوجيا الاعمال"),
            f.load('700 28px "Cairo"', "د.احمد السالمي"),
            f.load('700 40px "Cairo"', "التركيز"),
            f.load('400 22px "Cairo"', "اقتباس"),
          ]);
        } catch {}
      }
      await f.ready;
      console.log("[export] fonts ready");
    }
  };

  const renderCanvas = async () => {
    if (!cardRef.current) throw new Error("Card element not found");
    const el = cardRef.current;
    const scaledWrapper = el.parentElement as HTMLElement | null;
    const outerWrapper = scaledWrapper?.parentElement as HTMLElement | null;

    // Temporarily neutralize the preview scale transform so html2canvas
    // captures the card at its real 1080x1080 pixel size.
    const prevScaled = scaledWrapper?.style.transform ?? "";
    const prevOuter = outerWrapper?.style.transform ?? "";
    if (scaledWrapper) scaledWrapper.style.transform = "none";
    if (outerWrapper) outerWrapper.style.transform = "none";

    try {
      await waitForImages(el);
      console.log("[export] calling html2canvas...");
      const canvas = await html2canvas(el, {
        scale: 1,
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        width: 1080,
        height: 1080,
        windowWidth: 1080,
        windowHeight: 1080,
        logging: true,
      });
      console.log(`[export] canvas ready: ${canvas.width}x${canvas.height}`);
      return canvas;
    } finally {
      if (scaledWrapper) scaledWrapper.style.transform = prevScaled;
      if (outerWrapper) outerWrapper.style.transform = prevOuter;
    }
  };

  const triggerDownload = (dataUrl: string, filename: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const exportImage = async (type: "png" | "jpg") => {
    try {
      setExporting(true);
      console.log(`[export] starting ${type} export`);
      const canvas = await renderCanvas();
      const mime = type === "png" ? "image/png" : "image/jpeg";
      const ext = type === "png" ? "png" : "jpg";
      const dataUrl = canvas.toDataURL(mime, 0.95);
      triggerDownload(dataUrl, `podcast-quote-card.${ext}`);
      console.log(`[export] ${type} downloaded`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[export] failed:", err);
      alert(`Export Error: ${msg}`);
    } finally {
      setExporting(false);
    }
  };

  const copyImage = async () => {
    try {
      setExporting(true);
      const canvas = await renderCanvas();
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          alert("Copied to clipboard");
        } catch {
          alert("Clipboard not supported in this browser");
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[export] copy failed:", err);
      alert(`Copy Error: ${msg}`);
    } finally {
      setExporting(false);
    }
  };

  const debugExport = async () => {
    console.log("=== Debug Export ===");
    console.log("cardRef.current:", cardRef.current);
    if (!cardRef.current) return;
    console.log("rect:", cardRef.current.getBoundingClientRect());
    console.log("images:", cardRef.current.querySelectorAll("img").length);
    try {
      const canvas = await renderCanvas();
      console.log("debug canvas:", canvas.width, "x", canvas.height);
      alert(`Debug OK — canvas ${canvas.width}x${canvas.height}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("debug failed:", err);
      alert(`Debug Error: ${msg}`);
    }
  };


  const reset = () => {
    setPhoto(null);
    setPodcast("");
    setGuest("");
    setQuote("");
  };

  return (
    <div className="min-h-screen bg-[#020617] text-[#FFFFFF]" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <header className="border-b border-[#1E293B] px-8 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Arabic Podcast Quote Generator</h1>
            <p className="text-xs text-[#94A3B8]">Premium 1080×1080 cards for LinkedIn, Instagram, X</p>
          </div>
          <div className="text-xs text-[#94A3B8]">v1.0</div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-8 py-8 lg:grid-cols-[380px_1fr]">
        {/* Controls */}
        <section className="space-y-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            className={`rounded-xl border-2 border-dashed p-6 text-center transition ${
              dragOver ? "border-[#94A3B8] bg-[#0F172A]" : "border-[#1E293B] bg-[#020617]"
            }`}
          >
            {photo ? (
              <div className="space-y-3">
                <img src={photo} alt="guest" className="mx-auto h-32 w-32 rounded-lg object-cover" />
                <button onClick={() => setPhoto(null)} className="text-xs text-[#94A3B8] hover:text-[#FFFFFF]">
                  Remove
                </button>
              </div>
            ) : (
              <label className="block cursor-pointer">
                <div className="text-sm text-[#FFFFFF]">Drop guest photo or click to upload</div>
                <div className="mt-1 text-xs text-[#94A3B8]">PNG, JPG up to 10MB</div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
            )}
          </div>

          <Field label="Podcast Name">
            <input
              value={podcast}
              onChange={(e) => setPodcast(e.target.value)}
              dir="rtl"
              className="w-full rounded-lg border border-[#1E293B] bg-[#020617] px-3 py-2 text-right text-sm text-[#FFFFFF] outline-none focus:border-[#94A3B8]"
            />
          </Field>

          <Field label="Guest Name">
            <input
              value={guest}
              onChange={(e) => setGuest(e.target.value)}
              dir="rtl"
              className="w-full rounded-lg border border-[#1E293B] bg-[#020617] px-3 py-2 text-right text-sm text-[#FFFFFF] outline-none focus:border-[#94A3B8]"
            />
          </Field>

          <Field label="Quote">
            <textarea
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              dir="rtl"
              rows={7}
              className="w-full resize-none rounded-lg border border-[#1E293B] bg-[#020617] px-3 py-2 text-right text-sm leading-relaxed text-[#FFFFFF] outline-none focus:border-[#94A3B8]"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={() => exportImage("png")}
              className="rounded-lg bg-[#FFFFFF] px-4 py-2.5 text-sm font-semibold text-[#020617] transition hover:bg-[#FFFFFF]"
            >
              Download PNG
            </button>
            <button
              onClick={() => exportImage("jpg")}
              className="rounded-lg border border-[#1E293B] bg-[#020617] px-4 py-2.5 text-sm font-semibold text-[#FFFFFF] transition hover:bg-[#0F172A]"
            >
              Download JPG
            </button>
            <button
              onClick={copyImage}
              className="rounded-lg border border-[#1E293B] bg-[#020617] px-4 py-2.5 text-sm font-medium text-[#FFFFFF] transition hover:bg-[#0F172A]"
            >
              Copy Image
            </button>
            <button
              onClick={reset}
              className="rounded-lg border border-[#1E293B] bg-[#020617] px-4 py-2.5 text-sm font-medium text-[#94A3B8] transition hover:bg-[#0F172A]"
            >
              Reset
            </button>
            <button
              onClick={debugExport}
              className="col-span-2 rounded-lg border border-[#1E293B] bg-[#0F172A] px-4 py-2 text-xs font-medium text-[#FFFFFF] transition hover:bg-[#020617]"
            >
              Debug Export (logs to console)
            </button>
          </div>
        </section>

        {/* Preview */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-[#94A3B8]">Live Preview · 1080×1080</div>
          </div>
          <div className="overflow-hidden rounded-xl border border-[#1E293B] bg-[#020617] p-4">
            <div className="mx-auto" style={{ width: "100%", maxWidth: 720 }}>
              <div
                style={{
                  width: 720,
                  height: 720,
                  transformOrigin: "top left",
                  transform: "scale(var(--s, 1))",
                }}
                className="relative"
              >
                {/* Scaled wrapper trick: render at 1080 then scale to 720 */}
                <div
                  style={{
                    transform: "scale(0.6667)",
                    transformOrigin: "top left",
                    width: 1080,
                    height: 1080,
                  }}
                >
                  <QuoteCard
                    innerRef={cardRef}
                    photo={photo}
                    podcast={podcast}
                    guest={guest}
                    quote={quote}
                    quoteFontSize={quoteFontSize}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-[#94A3B8]">{label}</div>
      {children}
    </label>
  );
}

function QuoteCard({
  photo,
  podcast,
  guest,
  quote,
  quoteFontSize,
  innerRef,
}: {
  photo: string | null;
  podcast: string;
  guest: string;
  quote: string;
  quoteFontSize: number;
  innerRef: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={innerRef}
      style={{
        width: 1080,
        height: 1080,
        backgroundColor: "#0F172A",
        color: "#FFFFFF",
        fontFamily: "'Cairo', sans-serif",
        display: "flex",
        flexDirection: "row-reverse",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ width: "42%", height: "100%", position: "relative", backgroundColor: "#0F172A" }}>
        {photo ? (
          <img
            src={photo}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
          />
        ) : (
          <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#94A3B8", fontSize: 18 }}>
            Guest Photo
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, backgroundColor: "#000000", opacity: 0.35 }} />
      </div>

      <div
        dir="rtl"
        style={{
          width: "58%",
          height: "100%",
          padding: "60px 56px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          color: "#FFFFFF",
          fontFamily: '"Cairo", sans-serif',
        }}
      >
        <div
          dir="rtl"
          style={{
            textAlign: "right",
            fontSize: 24,
            fontWeight: 500,
            color: "#CBD5E1",
            letterSpacing: "0.5px",
            fontFamily: '"Cairo", sans-serif',
            unicodeBidi: "plaintext",
          }}
        >
          {podcast}
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0" }}>
          <p
            dir="rtl"
            style={{
              fontSize: quoteFontSize,
              lineHeight: 1.7,
              fontWeight: 700,
              color: "#FFFFFF",
              margin: 0,
              textAlign: "right",
              wordBreak: "break-word",
              fontFamily: '"Cairo", sans-serif',
              unicodeBidi: "plaintext",
            }}
          >
            {quote}
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          {guest && (
            <div
              dir="rtl"
              style={{
                width: 320,
                height: 80,
                backgroundColor: "#FFFFFF",
                color: "#000000",
                borderRadius: 4,
                fontSize: 28,
                fontWeight: 700,
                fontFamily: '"Cairo", sans-serif',
                unicodeBidi: "plaintext",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                lineHeight: 1,
              }}
            >
              {guest}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
