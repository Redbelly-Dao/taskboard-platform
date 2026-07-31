import Image from "next/image";

// Two artwork variants, one per background. The old single dark-ink file could not sit on the deep
// background at all, which is why a white plate used to be painted behind it everywhere. That plate is gone:
// picking the right artwork is the correct fix, and the plate was only ever a workaround for not having one.
//
// Both variants render and CSS shows one, rather than reading the theme in JS. The theme is applied as
// data-theme on the root before paint, so a JS switch would flash the wrong mark on first render.
//
// Callers set the height. Width follows from the artwork, so the two can never disagree; both files are
// built to one shared canvas by scripts/build-logo-assets.js, which is what lets them swap without resizing.
const RATIO = 1434 / 1024;

export default function Logo({
  height = 36,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  const width = Math.round(height * RATIO);
  return (
    <span className={`logo ${className}`} style={{ width, height }}>
      <Image
        src="/dao-logo-on-dark.png"
        alt="Redbelly DAO"
        height={height}
        width={width}
        className="logo-on-dark"
        priority
      />
      {/* Decorative duplicate: the same mark, swapped by CSS. Hidden from assistive tech so the
          lockup is announced once, not twice. */}
      <Image
        src="/dao-logo-on-light.png"
        alt=""
        aria-hidden="true"
        height={height}
        width={width}
        className="logo-on-light"
        priority
      />
    </span>
  );
}
