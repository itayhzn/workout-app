import { render } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { PersonScope, routes } from "../App";
import { PeopleProvider } from "../state/PeopleContext";

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
    <PeopleProvider>
      <PersonScope>
        <RouterProvider router={router} />
      </PersonScope>
    </PeopleProvider>,
  );
  return { ...utils, router };
}
