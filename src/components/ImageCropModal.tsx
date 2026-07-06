import { useCallback, useEffect, useRef, useState } from "react";
import { Crop, Loader2 } from "lucide-react";

type Rect = { x: number; y: number; w: number; h: number };

type DragMode =
  | "new" | "move"
  | "nw" | "n" | "ne"
  | "w"           | "e"
  | "sw" | "s" | "se";

const HANDLE_HIT   = 12;  // px radius for handle click detection
const HANDLE_HALF  = 5;   // half-size of drawn handle square

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampRect(r: Rect, maxW: number, maxH: number): Rect {
  const x = Math.max(0, Math.min(r.x, maxW));
  const y = Math.max(0, Math.min(r.y, maxH));
  const w = Math.max(0, Math.min(r.w, maxW - x));
  const h = Math.max(0, Math.min(r.h, maxH - y));
  return { x, y, w, h };
}

function hitHandle(pos: { x: number; y: number }, r: Rect): DragMode | null {
  const pts: { id: DragMode; x: number; y: number }[] = [
    { id: "nw", x: r.x,         y: r.y          },
    { id: "n",  x: r.x + r.w/2, y: r.y          },
    { id: "ne", x: r.x + r.w,   y: r.y          },
    { id: "w",  x: r.x,         y: r.y + r.h/2  },
    { id: "e",  x: r.x + r.w,   y: r.y + r.h/2  },
    { id: "sw", x: r.x,         y: r.y + r.h    },
    { id: "s",  x: r.x + r.w/2, y: r.y + r.h    },
    { id: "se", x: r.x + r.w,   y: r.y + r.h    },
  ];
  return pts.find(
    (p) => Math.abs(pos.x - p.x) <= HANDLE_HIT && Math.abs(pos.y - p.y) <= HANDLE_HIT
  )?.id ?? null;
}

const HANDLE_CURSORS: Record<string, string> = {
  nw: "nw-resize", n: "n-resize",  ne: "ne-resize",
  w:  "w-resize",                   e:  "e-resize",
  sw: "sw-resize", s: "s-resize",  se: "se-resize",
};

// ── Draw ──────────────────────────────────────────────────────────────────────

function drawCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  r: Rect | null,
) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  if (!r || r.w < 2 || r.h < 2) return;
  const { x, y, w, h } = r;

  // Darken region outside crop
  ctx.fillStyle = "rgba(0,0,0,0.52)";
  ctx.fillRect(0, 0, canvas.width, y);
  ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h);
  ctx.fillRect(0, y, x, h);
  ctx.fillRect(x + w, y, canvas.width - x - w, h);

  // Crop border
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Rule-of-thirds grid
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  [1/3, 2/3].forEach((f) => {
    ctx.moveTo(x + w * f, y); ctx.lineTo(x + w * f, y + h);
    ctx.moveTo(x, y + h * f); ctx.lineTo(x + w, y + h * f);
  });
  ctx.stroke();

  // 8 handles
  const handles = [
    { x,         y          }, { x: x + w/2, y          }, { x: x + w,   y          },
    { x,         y: y + h/2 },                               { x: x + w,   y: y + h/2 },
    { x,         y: y + h   }, { x: x + w/2, y: y + h   }, { x: x + w,   y: y + h   },
  ];
  ctx.fillStyle   = "white";
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth   = 1;
  handles.forEach(({ x: hx, y: hy }) => {
    ctx.fillRect  (hx - HANDLE_HALF,       hy - HANDLE_HALF,       HANDLE_HALF * 2,     HANDLE_HALF * 2    );
    ctx.strokeRect(hx - HANDLE_HALF + 0.5, hy - HANDLE_HALF + 0.5, HANDLE_HALF * 2 - 1, HANDLE_HALF * 2 - 1);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ImageCropModal({
  file,
  onCrop,
  onCancel,
}: {
  file: File;
  onCrop: (croppedFile: File) => void;
  onCancel: () => void;
}) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement | null>(null);
  const cropRef      = useRef<Rect | null>(null);   // live rect — no React re-render on drag
  const dragRef      = useRef<{
    mode: DragMode;
    sx: number; sy: number;
    orig: Rect;
  } | null>(null);

  const [ready,   setReady]   = useState(false);
  const [hasCrop, setHasCrop] = useState(false);

  // ── Canvas coordinate helper ─────────────────────────────────────────────
  const clientToCanvas = useCallback((clientX: number, clientY: number) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width)  * c.width,
      y: ((clientY - r.top)  / r.height) * c.height,
    };
  }, []);

  // ── Redraw ───────────────────────────────────────────────────────────────
  const redraw = useCallback(() => {
    const c   = canvasRef.current;
    const img = imgRef.current;
    if (c && img) drawCanvas(c, img, cropRef.current);
  }, []);

  // ── Load image ────────────────────────────────────────────────────────────
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const container = containerRef.current;
      const canvas    = canvasRef.current;
      if (!container || !canvas) { URL.revokeObjectURL(url); return; }

      const maxW  = container.clientWidth  - 16;
      const maxH  = container.clientHeight - 16;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);

      // Default: full image selected
      cropRef.current = { x: 0, y: 0, w: canvas.width, h: canvas.height };
      drawCanvas(canvas, img, cropRef.current);
      setHasCrop(true);
      setReady(true);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ── Global mouse/touch move + up (so drag works outside the canvas) ───────
  useEffect(() => {
    const applyMove = (clientX: number, clientY: number) => {
      const d = dragRef.current;
      const c = canvasRef.current;
      if (!d || !c) return;

      const pos = clientToCanvas(clientX, clientY);
      const dx  = pos.x - d.sx;
      const dy  = pos.y - d.sy;
      const o   = d.orig;
      let next: Rect;

      if (d.mode === "new") {
        next = clampRect({
          x: Math.min(d.sx, pos.x),
          y: Math.min(d.sy, pos.y),
          w: Math.abs(pos.x - d.sx),
          h: Math.abs(pos.y - d.sy),
        }, c.width, c.height);
      } else if (d.mode === "move") {
        next = clampRect({ x: o.x + dx, y: o.y + dy, w: o.w, h: o.h }, c.width, c.height);
      } else {
        let { x, y, w, h } = o;
        if (d.mode.includes("n")) { y += dy; h -= dy; }
        if (d.mode.includes("s")) { h += dy; }
        if (d.mode.includes("w")) { x += dx; w -= dx; }
        if (d.mode.includes("e")) { w += dx; }
        if (w < 0) { x += w; w = -w; }
        if (h < 0) { y += h; h = -h; }
        next = clampRect({ x, y, w, h }, c.width, c.height);
      }

      cropRef.current = next;
      redraw();
    };

    const applyEnd = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      const r = cropRef.current;
      setHasCrop(Boolean(r && r.w > 10 && r.h > 10));
    };

    const onMouseMove  = (e: MouseEvent)     => applyMove(e.clientX, e.clientY);
    const onTouchMove  = (e: TouchEvent)     => {
      e.preventDefault();
      if (e.touches[0]) applyMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup",   applyEnd);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend",  applyEnd);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup",   applyEnd);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend",  applyEnd);
    };
  }, [clientToCanvas, redraw]);

  // ── Crop & export ─────────────────────────────────────────────────────────
  const handleCrop = useCallback(() => {
    const r   = cropRef.current;
    const img = imgRef.current;
    const c   = canvasRef.current;
    if (!r || !img || !c || r.w < 2 || r.h < 2) return;

    const sx = img.naturalWidth  / c.width;
    const sy = img.naturalHeight / c.height;
    const ox = Math.max(0, Math.round(r.x * sx));
    const oy = Math.max(0, Math.round(r.y * sy));
    const ow = Math.min(Math.round(r.w * sx), img.naturalWidth  - ox);
    const oh = Math.min(Math.round(r.h * sy), img.naturalHeight - oy);

    const out = document.createElement("canvas");
    out.width  = ow;
    out.height = oh;
    out.getContext("2d")!.drawImage(img, ox, oy, ow, oh, 0, 0, ow, oh);

    out.toBlob((blob) => {
      if (!blob) return;
      const name = file.name.replace(/\.[^.]+$/, "") + "_crop.jpg";
      onCrop(new File([blob], name, { type: "image/jpeg" }));
    }, "image/jpeg", 0.93);
  }, [file, onCrop]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onCancel(); }
      if (e.key === "Enter" && hasCrop) { handleCrop(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [hasCrop, onCancel, handleCrop]);

  // ── Canvas pointer-down ───────────────────────────────────────────────────
  const onPointerDown = useCallback((clientX: number, clientY: number) => {
    const pos = clientToCanvas(clientX, clientY);
    const r   = cropRef.current;
    const c   = canvasRef.current;
    if (!c) return;

    if (r) {
      const handle = hitHandle(pos, r);
      if (handle) {
        dragRef.current = { mode: handle, sx: pos.x, sy: pos.y, orig: { ...r } };
        return;
      }
      if (pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h) {
        dragRef.current = { mode: "move", sx: pos.x, sy: pos.y, orig: { ...r } };
        return;
      }
    }

    // Start a new selection
    cropRef.current = null;
    dragRef.current = { mode: "new", sx: pos.x, sy: pos.y, orig: { x: pos.x, y: pos.y, w: 0, h: 0 } };
    redraw();
  }, [clientToCanvas, redraw]);

  // ── Canvas cursor update on hover ─────────────────────────────────────────
  const onPointerMove = useCallback((clientX: number, clientY: number) => {
    const c = canvasRef.current;
    if (!c || dragRef.current) return; // cursor handled globally while dragging
    const r   = cropRef.current;
    const pos = clientToCanvas(clientX, clientY);
    if (!r) { c.style.cursor = "crosshair"; return; }
    const handle = hitHandle(pos, r);
    if (handle) { c.style.cursor = HANDLE_CURSORS[handle]; return; }
    c.style.cursor =
      pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h
        ? "move"
        : "crosshair";
  }, [clientToCanvas]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.88)" }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-foreground flex items-center justify-center flex-shrink-0">
            <Crop className="h-3.5 w-3.5 text-background" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Crop Image</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Drag to select · handles to resize · <kbd className="font-mono text-[10px] px-1 py-px rounded border border-border bg-muted">Enter</kbd> to confirm
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-border text-[13px] text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onCrop(file)}
            className="px-3 py-1.5 rounded-lg border border-border text-[13px] font-medium hover:bg-muted/50 transition-colors"
          >
            Use Full Image
          </button>
          <button
            onClick={handleCrop}
            disabled={!hasCrop}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-foreground text-background text-[13px] font-semibold hover:bg-foreground/85 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Crop className="h-3.5 w-3.5" />
            Crop &amp; Upload
          </button>
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-4 overflow-hidden select-none"
      >
        {!ready && (
          <div className="flex items-center gap-2 text-white/50">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading image…</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{ display: ready ? "block" : "none", touchAction: "none", maxWidth: "100%", maxHeight: "100%" }}
          onMouseDown={(e) => { e.preventDefault(); onPointerDown(e.clientX, e.clientY); }}
          onMouseMove={(e) => onPointerMove(e.clientX, e.clientY)}
          onTouchStart={(e) => { e.preventDefault(); if (e.touches[0]) onPointerDown(e.touches[0].clientX, e.touches[0].clientY); }}
        />
      </div>
    </div>
  );
}
