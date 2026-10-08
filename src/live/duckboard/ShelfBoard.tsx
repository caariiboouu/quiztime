import { useLayoutEffect, useMemo, useRef, useState } from "react";
import SideStage from "../sideview/SideStage";
import { RateChip, type BoardEntry } from "./DuckBoardScene";
import { shelfColumns, shelfLayout } from "./shelfLayout";

/**
 * The Ceramic Duck Hours board side-on: a podium at the top, shelves of ducks
 * below in standings order, each seen face-on with its tag on the shelf edge.
 * Default export, for lazy loading.
 */
export default function ShelfBoard({
  entries,
  meId,
  onSelect,
  controls,
}: {
  entries: BoardEntry[];
  meId: string | null;
  onSelect: (id: string) => void;
  controls: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const columns = shelfColumns(width);
  const order = entries.map((e) => e.id).join("|");
  const { platforms, homes, view } = useMemo(() => shelfLayout(order.split("|").filter(Boolean), columns), [order, columns]);
  // Only rebuild the ducks when someone's duck changes, not every tick of the clock.
  const duckKey = JSON.stringify(entries.map((e) => [e.id, e.look, e.bare, e.crowned]));
  const ducks = useMemo(
    () =>
      (JSON.parse(duckKey) as [string, BoardEntry["look"], boolean, boolean][]).map(([id, look, bare, crowned]) => ({
        id,
        look,
        bare,
        crowned,
      })),
    [duckKey],
  );
  const byId = new Map(entries.map((e) => [e.id, e]));

  return (
    <div ref={box} className="overflow-hidden rounded-3xl shadow-inner">
      <SideStage
        platforms={platforms}
        ducks={ducks}
        homes={homes}
        view={view}
        meId={meId}
        controls={controls}
        onSelect={onSelect}
        tagLabel={(id) => {
          const e = byId.get(id);
          return e ? `${e.name}: place ${e.place}, ${e.total}, ${e.rate}` : "";
        }}
        renderTag={(id) => {
          const e = byId.get(id);
          if (!e) return null;
          return (
            <span
              className={`block max-w-[6.5rem] rounded-md border px-1 py-px text-center shadow-sm sm:max-w-[9rem] sm:px-1.5 sm:py-0.5 ${
                e.holding ? "border-amber-400 bg-amber-50" : "border-white/70 bg-white/90"
              } ${id === meId ? "ring-2 ring-amber-400" : ""} ${e.benched ? "opacity-80" : ""}`}
            >
              <span className="block truncate text-[10px] font-bold leading-tight text-neutral-900 sm:text-[13px]">
                <span className="text-neutral-400">{e.place}</span> {e.name}
                {e.crowned && " 👑"}
                {e.holding && " 🦆"}
              </span>
              <span className="block truncate font-mono text-[9px] leading-tight text-neutral-600 sm:text-[11px]">
                {e.total}
              </span>
              <RateChip entry={e} />
            </span>
          );
        }}
      />
    </div>
  );
}
