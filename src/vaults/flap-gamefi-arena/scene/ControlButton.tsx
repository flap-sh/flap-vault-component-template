export function ControlButton({
  label,
  glyph,
  active = false,
  large = false,
  onChange,
}: {
  label: string;
  glyph: string;
  active?: boolean;
  large?: boolean;
  onChange: (active: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onChange(true);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        onChange(false);
      }}
      onPointerCancel={() => onChange(false)}
      onPointerLeave={(event) => {
        if (event.buttons === 0) onChange(false);
      }}
      onClick={() => {
        onChange(true);
        let framesRemaining = 8;
        const releaseAfterTap = () => {
          framesRemaining -= 1;
          if (framesRemaining > 0) {
            window.requestAnimationFrame(releaseAfterTap);
          } else {
            onChange(false);
          }
        };
        window.requestAnimationFrame(releaseAfterTap);
      }}
      className={`${large ? "h-[74px] w-[74px] text-xs sm:h-[86px] sm:w-[86px]" : "aspect-square text-xl"} grid select-none place-items-center rounded-2xl border font-black shadow-2xl backdrop-blur-xl transition ${
        active
          ? "scale-95 border-[#93fbff]/70 bg-[#7c5cff]/85 text-white shadow-[0_0_32px_rgba(127,92,255,0.55)]"
          : "border-white/16 bg-[#080a19]/72 text-white/85 hover:bg-white/15"
      }`}
    >
      {glyph}
    </button>
  );
}
