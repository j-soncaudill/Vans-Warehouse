import { cx } from "@/components/ui";
import { FLAMES } from "@/lib/brand";


/**
 * The Vans mark that confirms a sign-in: a thin blue outline draws itself,
 * then the shape fills up from the bottom and glows.
 */
export function VansMarkFill({ className }: { className?: string }) {
  return (
    <svg viewBox="-6 -4 176 290" aria-hidden className={cx("vw-mark overflow-visible", className)}>
      <g className="vw-mark-fill">
        {FLAMES.map((d) => (
          <path key={d.slice(0, 12)} d={d} fill="currentColor" />
        ))}
      </g>
      <g className="vw-mark-line" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinejoin="round">
        {FLAMES.map((d) => (
          <path key={d.slice(0, 12)} d={d} pathLength={1} />
        ))}
      </g>
    </svg>
  );
}
