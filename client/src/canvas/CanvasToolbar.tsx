import type { DrawTool } from "./drawing.types";

interface CanvasToolbarProps {
  canDraw: boolean;
  activeTool: DrawTool;
  color: string;
  lineWidth: number;
  hasHistory: boolean;
  onToolChange: (tool: DrawTool) => void;
  onColorChange: (color: string) => void;
  onLineWidthChange: (size: number) => void;
  onUndo: () => void;
  onClear: () => void;
}

/** Preset brush sizes for quick selection */
const BRUSH_SIZES = [4, 8, 14, 22];

/** Preset palette colors */
const PALETTE = [
  "#111827", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#06b6d4", "#3b82f6", "#a855f7",
  "#ec4899", "#f8fafc", "#64748b", "#713f12",
];

interface ToolButtonProps {
  id: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolButton({ id, title, active, disabled, onClick, children }: ToolButtonProps) {
  return (
    <button
      id={id}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`toolbar-btn ${active ? "toolbar-btn-active" : ""}`}
    >
      {children}
    </button>
  );
}

/**
 * CanvasToolbar — Floating glassmorphism dock toolbar.
 *
 * Position: overlays the bottom of the canvas (absolute positioned inside canvas-shell).
 * When canDraw is false, all controls are disabled and the toolbar dims.
 *
 * Tool layout:
 *   [Brush] [Eraser] [Fill] | [Undo] [Clear] | Color picker | Palette | Size presets | Slider
 */
function CanvasToolbar({
  canDraw,
  activeTool,
  color,
  lineWidth,
  hasHistory,
  onToolChange,
  onColorChange,
  onLineWidthChange,
  onUndo,
  onClear,
}: CanvasToolbarProps) {
  return (
    <div className={`canvas-toolbar-dock ${!canDraw ? "toolbar-disabled" : ""}`}>
      {/* ── Tool Group ─────────────────────── */}
      <div className="toolbar-group">
        <ToolButton
          id="tool-brush"
          title="Brush (B)"
          active={activeTool === "brush"}
          disabled={!canDraw}
          onClick={() => onToolChange("brush")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19l7-7 3 3-7 7-3-3z"/>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
            <path d="M2 2l7.586 7.586"/>
            <circle cx="11" cy="11" r="2"/>
          </svg>
        </ToolButton>

        <ToolButton
          id="tool-eraser"
          title="Eraser (E)"
          active={activeTool === "eraser"}
          disabled={!canDraw}
          onClick={() => onToolChange("eraser")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 20H7L3 16l11.293-11.293a1 1 0 0 1 1.414 0L21 10a1 1 0 0 1 0 1.414L13 19"/>
            <path d="M6.5 17.5l-4-4"/>
          </svg>
        </ToolButton>

        <ToolButton
          id="tool-fill"
          title="Fill (F)"
          active={activeTool === "fill"}
          disabled={!canDraw}
          onClick={() => onToolChange("fill")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 11l-8-8-8.5 8.5a5.5 5.5 0 0 0 7.78 7.78L19 11z"/>
            <path d="M20 16s0 3 2 4"/>
            <path d="M5.1 12L3 14.1"/>
          </svg>
        </ToolButton>
      </div>

      <div className="toolbar-divider" />

      {/* ── Action Group ────────────────────── */}
      <div className="toolbar-group">
        <ToolButton
          id="tool-undo"
          title="Undo (Ctrl+Z)"
          disabled={!canDraw || !hasHistory}
          onClick={onUndo}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/>
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
          </svg>
        </ToolButton>

        <ToolButton
          id="tool-clear"
          title="Clear Canvas"
          disabled={!canDraw}
          onClick={onClear}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </ToolButton>
      </div>

      <div className="toolbar-divider" />

      {/* ── Color Controls ──────────────────── */}
      <div className="toolbar-group toolbar-colors">
        {/* Custom color picker swatch */}
        <label className="toolbar-color-swatch" title="Custom color" style={{ background: color }}>
          <input
            id="brush-color"
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            disabled={!canDraw}
            className="toolbar-color-input"
          />
        </label>

        {/* Preset palette */}
        <div className="toolbar-palette">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              aria-label={`Color ${c}`}
              disabled={!canDraw}
              onClick={() => {
                onColorChange(c);
                if (activeTool === "eraser") onToolChange("brush");
              }}
              className={`palette-swatch ${color === c && activeTool !== "eraser" ? "palette-swatch-active" : ""}`}
              style={{ background: c, border: c === "#f8fafc" ? "1px solid #94a3b8" : undefined }}
            />
          ))}
        </div>
      </div>

      <div className="toolbar-divider" />

      {/* ── Brush Size ──────────────────────── */}
      <div className="toolbar-group toolbar-size">
        <div className="size-presets">
          {BRUSH_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              title={`${s}px`}
              aria-label={`Brush size ${s}px`}
              disabled={!canDraw}
              onClick={() => onLineWidthChange(s)}
              className={`size-dot-btn ${lineWidth === s ? "size-dot-active" : ""}`}
            >
              <span
                className="size-dot"
                style={{ width: Math.min(s, 18), height: Math.min(s, 18) }}
              />
            </button>
          ))}
        </div>

        <input
          id="brush-width"
          type="range"
          min="1"
          max="40"
          value={lineWidth}
          onChange={(e) => onLineWidthChange(Number(e.target.value))}
          disabled={!canDraw}
          className="toolbar-slider"
          title={`Brush size: ${lineWidth}px`}
        />
        <span className="size-label">{lineWidth}px</span>
      </div>
    </div>
  );
}

export default CanvasToolbar;
