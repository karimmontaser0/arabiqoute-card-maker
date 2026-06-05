import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, useCallback } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Arabic Podcast Quote Generator" },
      {
        name: "description",
        content: "Generate premium Arabic podcast quote cards for social media.",
      },
    ],
  }),
  component: Index,
});

const CARD_SIZE = 1080;
const PHOTO_WIDTH = CARD_SIZE * 0.42;
const TEXT_WIDTH = CARD_SIZE * 0.58;
const PANEL_PADDING_X = 68;
const PANEL_PADDING_Y = 70;
const BADGE_WIDTH = 332;
const BADGE_HEIGHT = 78;
const QUOTE_LINE_HEIGHT = 1.82;
const CAIRO_FONT = '"Cairo", sans-serif';

type ExportTypography = {
  podcast: string;
  guest: string;
  quote: string;
  quoteFontSize: number;
};

type ImagePosition = {
  zoom: number;
  x: number;
  y: number;
};

async function waitForCairoFont({ podcast, guest, quote, quoteFontSize }: ExportTypography) {
  if (!("fonts" in document)) return;

  const fonts = document.fonts;
  await Promise.all([
    fonts.load(`600 22px ${CAIRO_FONT}`, podcast || "بودكاست"),
    fonts.load(`700 27px ${CAIRO_FONT}`, guest || "ضيف"),
    fonts.load(`700 ${quoteFontSize}px ${CAIRO_FONT}`, quote || "اقتباس"),
  ]);
  await fonts.ready;
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
      const candidates =
        ctx.measureText(word).width > maxWidth ? splitLongToken(ctx, word, maxWidth) : [word];
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

async function waitForImages(element: HTMLElement) {
  const images = Array.from(element.querySelectorAll("img"));
  await Promise.all(
    images.map(async (img) => {
      if (!img.complete || img.naturalWidth === 0) {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Guest image could not be loaded for export"));
        });
      }

      try {
        await img.decode?.();
      } catch {
        // Some browsers reject decode() for already-loaded data URLs.
      }
    }),
  );
}

async function waitForLayoutStabilization(element: HTMLElement) {
  let lastSnapshot = "";
  let stableFrames = 0;

  for (let frame = 0; frame < 12 && stableFrames < 3; frame += 1) {
    await nextFrame();
    const rect = element.getBoundingClientRect();
    const snapshot = [
      rect.width,
      rect.height,
      element.scrollWidth,
      element.scrollHeight,
      ...Array.from(element.querySelectorAll("img")).map((img) => {
        const image = img as HTMLImageElement;
        return `${image.complete}:${image.naturalWidth}x${image.naturalHeight}`;
      }),
    ].join("|");

    if (snapshot === lastSnapshot) {
      stableFrames += 1;
    } else {
      stableFrames = 0;
      lastSnapshot = snapshot;
    }
  }
}

async function waitForExportReadiness(element: HTMLElement, typography: ExportTypography) {
  await waitForCairoFont(typography);
  await waitForImages(element);
  await nextFrame();
  await waitForLayoutStabilization(element);
}

function serializePreviewNode(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  clone.style.margin = "0";
  clone.style.transform = "none";

  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.style.width = `${CARD_SIZE}px`;
  wrapper.style.height = `${CARD_SIZE}px`;
  wrapper.style.margin = "0";
  wrapper.style.fontFamily = CAIRO_FONT;
  wrapper.appendChild(clone);

  return new XMLSerializer().serializeToString(wrapper);
}

function loadSvgImage(svg: string) {
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
      try {
        await image.decode?.();
      } catch {
        // The SVG image is already loaded.
      }
      resolve(image);
    };
    image.onerror = () => reject(new Error("Export renderer could not rasterize the preview"));
    image.src = svgUrl;
  });
}

async function renderPreviewElementToCanvas(element: HTMLElement, typography: ExportTypography) {
  await waitForExportReadiness(element, typography);

  const html = serializePreviewNode(element);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_SIZE}" height="${CARD_SIZE}" viewBox="0 0 ${CARD_SIZE} ${CARD_SIZE}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
  const image = await loadSvgImage(svg);
  const canvas = document.createElement("canvas");
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas export is not supported in this browser");
  ctx.drawImage(image, 0, 0, CARD_SIZE, CARD_SIZE);
  return canvas;
}

function calculateQuoteFontSize(quote: string) {
  const normalizedQuote = quote.trim() || "اقتباس";
  const length = normalizedQuote.length;
  const maxSize = (() => {
    if (length < 80) return 47;
    if (length < 140) return 40;
    if (length < 200) return 35;
    if (length < 280) return 30;
    return 26;
  })();

  if (typeof document === "undefined") return maxSize;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return maxSize;

  const quoteMaxWidth = TEXT_WIDTH - PANEL_PADDING_X * 2;
  const quoteMaxHeight = CARD_SIZE - PANEL_PADDING_Y * 2 - 42 - BADGE_HEIGHT - 104;

  for (let size = maxSize; size >= 24; size -= 1) {
    ctx.font = `700 ${size}px ${CAIRO_FONT}`;
    ctx.direction = "rtl";
    const lines = wrapRtlText(ctx, normalizedQuote, quoteMaxWidth);
    if (lines.length * size * QUOTE_LINE_HEIGHT <= quoteMaxHeight) {
      return size;
    }
  }

  return 24;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Guest photo could not be read"));
    reader.readAsDataURL(file);
  });
}

function imageObjectPosition(position: ImagePosition) {
  return `${50 + position.x}% ${50 + position.y}%`;
}

function Index() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [podcast, setPodcast] = useState("بودكاست تكنولوجيا الاعمال");
  const [guest, setGuest] = useState("د.احمد السالمي");
  const [quote, setQuote] = useState(
    "«التركيز من أكثر المهارات المطلوبة في أي منظمة. الناس تهتم بالمؤهلات، وتهتم بأشياء كثيرة أخرى، لكن قليل من يلتفت إلى التركيز، مع أنه مهارة عظيمة جدًا في تحقيق النجاح، سواء للفرد أو للمنظمة.»",
  );
  const [imagePosition, setImagePosition] = useState<ImagePosition>({ zoom: 1, x: 0, y: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const handleFile = useCallback(async (file: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const dataUrl = await readFileAsDataUrl(file);
    setPhoto(dataUrl);
    setImagePosition({ zoom: 1, x: 0, y: 0 });
  }, []);

  const quoteFontSize = calculateQuoteFontSize(quote);

  const renderCanvas = async () => {
    if (!cardRef.current) throw new Error("Live preview is not ready yet");
    console.log("[export] rasterizing live preview...");
    const canvas = await renderPreviewElementToCanvas(cardRef.current, {
      podcast,
      guest,
      quote,
      quoteFontSize,
    });
    console.log(`[export] canvas ready: ${canvas.width}x${canvas.height}`);
    return canvas;
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
      canvas.toBlob(async (blob: Blob | null) => {
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
    setImagePosition({ zoom: 1, x: 0, y: 0 });
    setPodcast("");
    setGuest("");
    setQuote("");
  };

  return (
    <div
      className="min-h-screen bg-[#020617] text-[#FFFFFF]"
      style={{ fontFamily: "'Cairo', sans-serif" }}
    >
      <header className="border-b border-[#1E293B] px-8 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Arabic Podcast Quote Generator</h1>
            <p className="text-xs text-[#94A3B8]">
              Premium 1080×1080 cards for LinkedIn, Instagram, X
            </p>
          </div>
          <div className="text-xs text-[#94A3B8]">v1.0</div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-8 py-8 lg:grid-cols-[380px_1fr]">
        {/* Controls */}
        <section className="space-y-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
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
                <img
                  src={photo}
                  alt="guest"
                  className="mx-auto h-32 w-32 rounded-lg object-cover"
                  style={{
                    objectPosition: imageObjectPosition(imagePosition),
                    transform: `scale(${imagePosition.zoom})`,
                  }}
                />
                <button
                  onClick={() => {
                    setPhoto(null);
                    setImagePosition({ zoom: 1, x: 0, y: 0 });
                  }}
                  className="text-xs text-[#94A3B8] hover:text-[#FFFFFF]"
                >
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

          {photo && (
            <div className="space-y-4 rounded-xl border border-[#1E293B] bg-[#020617] p-4">
              <Field label="Image Zoom">
                <input
                  type="range"
                  min="1"
                  max="2"
                  step="0.01"
                  value={imagePosition.zoom}
                  onChange={(e) =>
                    setImagePosition((current) => ({ ...current, zoom: Number(e.target.value) }))
                  }
                  className="w-full accent-[#FFFFFF]"
                />
              </Field>
              <Field label="Image Horizontal Position">
                <input
                  type="range"
                  min="-50"
                  max="50"
                  step="1"
                  value={imagePosition.x}
                  onChange={(e) =>
                    setImagePosition((current) => ({ ...current, x: Number(e.target.value) }))
                  }
                  className="w-full accent-[#FFFFFF]"
                />
              </Field>
              <Field label="Image Vertical Position">
                <input
                  type="range"
                  min="-50"
                  max="50"
                  step="1"
                  value={imagePosition.y}
                  onChange={(e) =>
                    setImagePosition((current) => ({ ...current, y: Number(e.target.value) }))
                  }
                  className="w-full accent-[#FFFFFF]"
                />
              </Field>
            </div>
          )}

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
              disabled={exporting}
              className="rounded-lg bg-[#FFFFFF] px-4 py-2.5 text-sm font-semibold text-[#020617] transition hover:bg-[#FFFFFF]"
            >
              {exporting ? "Exporting..." : "Download PNG"}
            </button>
            <button
              onClick={() => exportImage("jpg")}
              disabled={exporting}
              className="rounded-lg border border-[#1E293B] bg-[#020617] px-4 py-2.5 text-sm font-semibold text-[#FFFFFF] transition hover:bg-[#0F172A]"
            >
              Download JPG
            </button>
            <button
              onClick={copyImage}
              disabled={exporting}
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
              disabled={exporting}
              className="col-span-2 rounded-lg border border-[#1E293B] bg-[#0F172A] px-4 py-2 text-xs font-medium text-[#FFFFFF] transition hover:bg-[#020617]"
            >
              Debug Export (logs to console)
            </button>
          </div>
        </section>

        {/* Preview */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-[#94A3B8]">
              Live Preview · 1080×1080
            </div>
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
                    imagePosition={imagePosition}
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
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
        {label}
      </div>
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
  imagePosition,
  innerRef,
}: {
  photo: string | null;
  podcast: string;
  guest: string;
  quote: string;
  quoteFontSize: number;
  imagePosition: ImagePosition;
  innerRef: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={innerRef}
      data-export-card="true"
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
      <div
        style={{
          width: PHOTO_WIDTH,
          height: "100%",
          position: "relative",
          backgroundColor: "#0F172A",
          overflow: "hidden",
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: imageObjectPosition(imagePosition),
              transform: `scale(${imagePosition.zoom})`,
              transformOrigin: imageObjectPosition(imagePosition),
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              color: "#94A3B8",
              fontSize: 18,
              fontFamily: CAIRO_FONT,
            }}
          >
            Guest Photo
          </div>
        )}
        <div
          style={{ position: "absolute", inset: 0, backgroundColor: "#000000", opacity: 0.35 }}
        />
      </div>

      <div
        dir="rtl"
        style={{
          width: TEXT_WIDTH,
          height: "100%",
          padding: `${PANEL_PADDING_Y}px ${PANEL_PADDING_X}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          color: "#FFFFFF",
          fontFamily: CAIRO_FONT,
        }}
      >
        <div
          dir="rtl"
          style={{
            textAlign: "right",
            fontSize: 22,
            lineHeight: 1.6,
            fontWeight: 600,
            color: "#CBD5E1",
            letterSpacing: 0,
            fontFamily: CAIRO_FONT,
            unicodeBidi: "plaintext",
          }}
        >
          {podcast}
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "52px 0",
            minHeight: 0,
          }}
        >
          <p
            dir="rtl"
            data-export-quote="true"
            style={{
              fontSize: quoteFontSize,
              lineHeight: QUOTE_LINE_HEIGHT,
              fontWeight: 700,
              color: "#FFFFFF",
              margin: 0,
              textAlign: "right",
              maxWidth: "100%",
              wordBreak: "break-word",
              overflowWrap: "anywhere",
              fontFamily: CAIRO_FONT,
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
              data-export-badge="true"
              style={{
                width: BADGE_WIDTH,
                height: BADGE_HEIGHT,
                backgroundColor: "#FFFFFF",
                color: "#000000",
                borderRadius: 4,
                padding: "0 24px",
                fontSize: 27,
                fontWeight: 700,
                fontFamily: CAIRO_FONT,
                unicodeBidi: "plaintext",
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                lineHeight: 1.1,
                boxSizing: "border-box",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
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
