import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import html2canvas from "html2canvas";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Arabic Podcast Quote Generator" },
      { name: "description", content: "Generate premium Arabic podcast quote cards for social media." },
    ],
  }),
  component: Index,
});

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
  const renderCanvas = async () => {
    if (!cardRef.current) throw new Error("Card element not found");
    return await html2canvas(cardRef.current, {
      width: 1080,
      height: 1080,
      windowWidth: 1080,
      windowHeight: 1080,
      scale: 1,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#0F172A",
      logging: false,
    });
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
      const canvas = await renderCanvas();
      const mime = type === "png" ? "image/png" : "image/jpeg";
      const ext = type === "png" ? "png" : "jpg";
      const dataUrl = canvas.toDataURL(mime, 0.95);
      triggerDownload(dataUrl, `podcast-quote-card.${ext}`);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please try again.");
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
      console.error("Copy failed:", err);
      alert("Copy failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const reset = () => {
    setPhoto(null);
    setPodcast("");
    setGuest("");
    setQuote("");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <header className="border-b border-white/5 px-8 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Arabic Podcast Quote Generator</h1>
            <p className="text-xs text-slate-400">Premium 1080×1080 cards for LinkedIn, Instagram, X</p>
          </div>
          <div className="text-xs text-slate-500">v1.0</div>
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
              dragOver ? "border-sky-400 bg-sky-400/5" : "border-white/10 bg-white/[0.02]"
            }`}
          >
            {photo ? (
              <div className="space-y-3">
                <img src={photo} alt="guest" className="mx-auto h-32 w-32 rounded-lg object-cover" />
                <button onClick={() => setPhoto(null)} className="text-xs text-slate-400 hover:text-white">
                  Remove
                </button>
              </div>
            ) : (
              <label className="block cursor-pointer">
                <div className="text-sm text-slate-300">Drop guest photo or click to upload</div>
                <div className="mt-1 text-xs text-slate-500">PNG, JPG up to 10MB</div>
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
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-right outline-none focus:border-sky-400"
            />
          </Field>

          <Field label="Guest Name">
            <input
              value={guest}
              onChange={(e) => setGuest(e.target.value)}
              dir="rtl"
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-right outline-none focus:border-sky-400"
            />
          </Field>

          <Field label="Quote">
            <textarea
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              dir="rtl"
              rows={7}
              className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-right leading-relaxed outline-none focus:border-sky-400"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={() => exportImage("png")}
              className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
            >
              Download PNG
            </button>
            <button
              onClick={() => exportImage("jpg")}
              className="rounded-lg border border-white/15 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Download JPG
            </button>
            <button
              onClick={copyImage}
              className="rounded-lg border border-white/15 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Copy Image
            </button>
            <button
              onClick={reset}
              className="rounded-lg border border-white/15 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-white/10"
            >
              Reset
            </button>
          </div>
        </section>

        {/* Preview */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-slate-500">Live Preview · 1080×1080</div>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30 p-4">
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
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-400">{label}</div>
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
        fontFamily: "'Cairo', sans-serif",
        display: "flex",
        flexDirection: "row-reverse",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ width: "42%", height: "100%", position: "relative", backgroundColor: "#1e293b" }}>
        {photo ? (
          <img
            src={photo}
            alt=""
            crossOrigin="anonymous"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
          />
        ) : (
          <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 18 }}>
            Guest Photo
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} />
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
          color: "#fff",
        }}
      >
        <div style={{ textAlign: "left", fontSize: 22, fontWeight: 500, opacity: 0.85, letterSpacing: "0.5px" }}>
          {podcast}
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0" }}>
          <p
            style={{
              fontSize: quoteFontSize,
              lineHeight: 1.7,
              fontWeight: 700,
              color: "#fff",
              margin: 0,
              textAlign: "right",
              wordBreak: "break-word",
            }}
          >
            {quote}
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          {guest && (
            <div
              style={{
                backgroundColor: "#fff",
                color: "#000",
                padding: "14px 28px",
                borderRadius: 4,
                fontSize: 26,
                fontWeight: 700,
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
