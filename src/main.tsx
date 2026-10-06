import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createHashHistory,
  createRouter,
} from "@tanstack/react-router";
import { Gate } from "@/components/Gate";
import { Shell } from "@/components/Shell";
import { Toaster } from "@/components/ui";
import { DetailPage } from "@/routes/Detail";
import { FloorPage, OutPage } from "@/routes/Lists";
import { MorePage } from "@/routes/More";
import { ReceivePage } from "@/routes/Receive";
import { ReturnDetailPage, ReturnNewPage, ReturnsPage } from "@/routes/Returns";
import { ScanPage } from "@/routes/Scan";
import "@fontsource/geist-sans/latin-500.css";
import "@fontsource/geist-sans/latin-600.css";
import "@fontsource/geist-sans/latin-700.css";
import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/geist-mono/latin-500.css";
import "@fontsource/geist-mono/latin-600.css";
import "@/styles.css";
import { IS_DEMO } from "@/lib/supabase";

// Press feedback that works the same on every phone: whatever .vw-press
// element is under the finger gets data-pressed until the finger lifts, or
// until the touch turns into a scroll (pointercancel). The touchstart listener
// also lets iPhone browsers apply :active styles at all.
document.addEventListener("touchstart", () => undefined, { passive: true });
let pressed: Element | null = null;
const calm = matchMedia("(prefers-reduced-motion: reduce)");
/** A brand-colored ripple that spreads from where the finger landed. */
function ripple(el: Element, x: number, y: number) {
  if (calm.matches) return;
  const host = el as HTMLElement;
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  const r = host.getBoundingClientRect();
  const size = Math.hypot(Math.max(x - r.left, r.right - x), Math.max(y - r.top, r.bottom - y)) * 2.2;
  const dot = document.createElement("span");
  dot.className = "vw-ripple";
  dot.style.cssText = `left:${x - r.left}px;top:${y - r.top}px;width:${size}px;height:${size}px`;
  host.appendChild(dot);
  dot.addEventListener("animationend", () => dot.remove(), { once: true });
}
const release = () => {
  pressed?.removeAttribute("data-pressed");
  pressed = null;
};
document.addEventListener(
  "pointerdown",
  (e) => {
    release();
    const el = (e.target as Element | null)?.closest?.(".vw-press");
    if (!el || (el as HTMLButtonElement).disabled) return;
    pressed = el;
    el.setAttribute("data-pressed", "");
    ripple(el, e.clientX, e.clientY);
  },
  { passive: true },
);
for (const type of ["pointerup", "pointercancel", "dragstart"]) document.addEventListener(type, release, { passive: true });
window.addEventListener("scroll", release, { passive: true, capture: true });
window.addEventListener("blur", release);

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Gate>
        <Shell>
          <Outlet />
        </Shell>
      </Gate>
      <Toaster />
    </>
  ),
  notFoundComponent: () => <p className="py-10 text-center text-[18px] text-dim">Page not found.</p>,
});

const floorRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: FloorPage });
const outRoute = createRoute({ getParentRoute: () => rootRoute, path: "/out", component: OutPage });
const scanRoute = createRoute({ getParentRoute: () => rootRoute, path: "/scan", component: ScanPage });
const moreRoute = createRoute({ getParentRoute: () => rootRoute, path: "/more", component: MorePage });

const receiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/receive",
  validateSearch: (s: Record<string, unknown>): { code?: string } => (typeof s.code === "string" && s.code ? { code: s.code } : {}),
  component: function Receive() {
    const { code } = receiveRoute.useSearch();
    return <ReceivePage key={code ?? ""} code={code} />;
  },
});

const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$code",
  component: function Detail() {
    const { code } = detailRoute.useParams();
    return <DetailPage key={code} code={code} />;
  },
});

const returnsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/returns", component: ReturnsPage });
const returnNewRoute = createRoute({ getParentRoute: () => rootRoute, path: "/returns/new", component: ReturnNewPage });
const returnDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/r/$code",
  component: function ReturnDetail() {
    const { code } = returnDetailRoute.useParams();
    return <ReturnDetailPage key={code} code={code} />;
  },
});

const router = createRouter({
  routeTree: rootRoute.addChildren([floorRoute, outRoute, scanRoute, receiveRoute, detailRoute, moreRoute, returnsRoute, returnNewRoute, returnDetailRoute]),
  scrollRestoration: true,
  // The demo runs inside a claude.ai frame where only the hash is ours.
  ...(IS_DEMO ? { history: createHashHistory() } : {}),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
