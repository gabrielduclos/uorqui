import type { SVGProps } from 'react';

/** Exact 43×7 pixel wordmark from the existing Uorqui PWA icon.
 * No remotely hosted font: stays sharp at any display scale and in both themes.
 */
const PIXEL_ROWS = [
  "X   X   XXX   XXXX    XXX   X   X    X",
  "X   X  X   X  X   X  X   X  X   X",
  "X   X  X   X  X      X   X  X   X   XX",
  "X   X  X   X  X      X X X  X   X    X",
  "X   X  X   X  X      X  XX  X   X    X",
  "X  XX  X   X  X       XXXX  X  XX    X",
  " XX X   XXX   X          X   XX X   XXX"
] as const;
const WHITE_PIXELS = PIXEL_ROWS.flatMap((row, y) =>
  [...row].flatMap((pixel, x) => pixel === 'X' ? ['M'+x+' '+y+'h1v1h-1z'] : [])
).join(' ');

export function UorquiWordmark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return <svg {...props} className={className} xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 43 7" role="img" aria-label="uorqui." preserveAspectRatio="xMidYMid meet"
    shapeRendering="crispEdges">
    <path fill="currentColor" d={WHITE_PIXELS} />
    <rect x="42" y="6" width="1" height="1" fill="#69d2aa" />
  </svg>;
}
