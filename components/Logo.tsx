import Image from "next/image";

// The DAO mark is dark-inked artwork, so on the deep background it reads as almost nothing.
// `.logo-plate` gives it a white plate in dark mode and collapses to nothing in light mode (see globals.css).
export default function Logo({
  height = 32,
  width = 47,
  className = "",
}: {
  height?: number;
  width?: number;
  className?: string;
}) {
  return (
    <span className={`logo-plate ${className}`}>
      <Image
        src="/dao-logo.png"
        alt="Redbelly DAO"
        height={height}
        width={width}
        className="object-contain"
        priority
      />
    </span>
  );
}
