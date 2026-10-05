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
import { ScanPage } from "@/routes/Scan";
import "@fontsource/archivo/latin-400.css";
import "@fontsource/archivo/latin-600.css";
import "@fontsource/archivo-narrow/latin-600.css";
import "@fontsource/archivo-narrow/latin-700.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@/styles.css";
import { IS_DEMO } from "@/lib/supabase";

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

const router = createRouter({
  routeTree: rootRoute.addChildren([floorRoute, outRoute, scanRoute, receiveRoute, detailRoute, moreRoute]),
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
