import { useEffect, useMemo } from "react";
import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";

const FONT_PX = 44;
const PAD_X = 22;
const HEIGHT_PX = 68;
const DOT = 14;

/** Draw a pill-shaped name label (with the duck's colour as a dot) to a texture. */
function makeTagTexture(text: string, color: string, highlight: boolean): { tex: CanvasTexture; aspect: number } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `700 ${FONT_PX}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.font = font;
  const textW = Math.ceil(ctx.measureText(text).width);
  const w = PAD_X * 2 + DOT * 2 + 12 + textW;
  canvas.width = w;
  canvas.height = HEIGHT_PX;
  ctx.font = font;
  const r = HEIGHT_PX / 2 - 3;
  ctx.beginPath();
  ctx.roundRect(3, 3, w - 6, HEIGHT_PX - 6, r);
  ctx.fillStyle = highlight ? "#fef3c7" : "rgba(255,255,255,0.92)";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = highlight ? "#f59e0b" : color;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(PAD_X + DOT, HEIGHT_PX / 2, DOT, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = "#111827";
  ctx.textBaseline = "middle";
  ctx.fillText(text, PAD_X + DOT * 2 + 12, HEIGHT_PX / 2 + 2);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  return { tex, aspect: w / HEIGHT_PX };
}

/** A name label floating above a duck, always facing the camera and drawn on top. */
export function NameTag({
  text,
  color,
  highlight = false,
  y = 2.05,
  height = 0.3,
}: {
  text: string;
  color: string;
  highlight?: boolean;
  y?: number;
  height?: number;
}) {
  const { tex, aspect } = useMemo(() => makeTagTexture(text, color, highlight), [text, color, highlight]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <sprite position={[0, y, 0]} scale={[height * aspect, height, 1]} renderOrder={10}>
      <spriteMaterial map={tex} transparent depthTest={false} depthWrite={false} />
    </sprite>
  );
}
