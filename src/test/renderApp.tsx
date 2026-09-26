import { render } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { routes } from "../App";
import { ActiveWorkoutProvider } from "../state/ActiveWorkoutContext";
import { ConfigProvider } from "../state/ConfigContext";

export function stubConfigFetch(files: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const name = String(url).split("/").pop()!;
      return name in files ? new Response(JSON.stringify(files[name])) : new Response("", { status: 404 });
    }),
  );
}

export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <ConfigProvider>
      <ActiveWorkoutProvider>
        <RouterProvider router={router} />
      </ActiveWorkoutProvider>
    </ConfigProvider>,
  );
  return { ...utils, router };
}
