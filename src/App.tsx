import { RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, Navigate, Outlet, RouterProvider, ScrollRestoration, createHashRouter, useLocation, useRouteError } from "react-router-dom";
import { EmptyState } from "./components/ui";
import { ExercisesPage } from "./pages/manage/ExercisesPage";
import { ManageHistoryPage } from "./pages/manage/HistoryPage";
import { ManageLayout } from "./pages/manage/ManageLayout";
import { PeoplePage } from "./pages/manage/PeoplePage";
import { WhoAreYou } from "./pages/WhoAreYou";
import { SchedulePage } from "./pages/manage/SchedulePage";
import { SettingsPage } from "./pages/manage/SettingsPage";
import { WorkoutsPage } from "./pages/manage/WorkoutsPage";
import { PairPage } from "./pages/PairPage";
import { ExercisePage } from "./pages/phone/ExercisePage";
import { FinishPage } from "./pages/phone/FinishPage";
import { IntervalPage } from "./pages/phone/IntervalPage";
import { PhoneHistoryDetail, PhoneHistoryList } from "./pages/phone/HistoryPages";
import { PhoneHome } from "./pages/phone/PhoneHome";
import { WorkoutPage } from "./pages/phone/WorkoutPage";
import { dbNameForPerson, preferredMode } from "./services/settings";
import { selectDatabase } from "./storage/indexedDb";
import { PeopleProvider, usePeople } from "./state/PeopleContext";
import { ActiveWorkoutProvider } from "./state/ActiveWorkoutContext";
import { ConfigProvider } from "./state/ConfigContext";
import { SyncProvider } from "./state/SyncContext";

function Root() {
  const { connection, activePersonId } = usePeople();
  const { pathname } = useLocation();
  // A connected device must pick who it is before anything else (pairing links still work).
  if (connection && !activePersonId && !pathname.startsWith("/pair")) return <WhoAreYou />;
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

/** "/" is the phone home, unless this device prefers management mode. */
function HomeRoute() {
  return preferredMode() === "manage" ? <Navigate to="/manage/workouts" replace /> : <PhoneHome />;
}

function RouteError() {
  const error = useRouteError();
  return (
    <div className="mx-auto max-w-md p-6 pt-20">
      <EmptyState
        title="Something went wrong"
        body={`${error instanceof Error ? error.message : "Unexpected error"}. Your workout progress is stored on this device and is safe.`}
        action={
          <div className="flex gap-2">
            <button className="btn-primary h-11 px-4" onClick={() => window.location.reload()}>
              <RotateCcw size={16} /> Reload
            </button>
            <a href="#/" className="btn-secondary h-11 px-4">
              Home
            </a>
          </div>
        }
      />
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-md p-6 pt-20">
      <EmptyState title="Page not found" action={<Link to="/" className="btn-primary h-11 px-4">Home</Link>} />
    </div>
  );
}

export const routes = [
  {
    path: "/",
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: "workout/:sessionId", element: <WorkoutPage /> },
      { path: "workout/:sessionId/exercise/:sessionExerciseId", element: <ExercisePage /> },
      { path: "workout/:sessionId/intervals", element: <IntervalPage /> },
      { path: "workout/:sessionId/finish", element: <FinishPage /> },
      { path: "pair/:code", element: <PairPage /> },
      { path: "history", element: <PhoneHistoryList /> },
      { path: "history/:sessionId", element: <PhoneHistoryDetail /> },
      {
        path: "manage",
        element: <ManageLayout />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Navigate to="workouts" replace /> },
          { path: "exercises", element: <ExercisesPage /> },
          { path: "exercises/:exerciseId", element: <ExercisesPage /> },
          { path: "workouts", element: <WorkoutsPage /> },
          { path: "workouts/:workoutId", element: <WorkoutsPage /> },
          { path: "schedule", element: <SchedulePage /> },
          { path: "history", element: <ManageHistoryPage /> },
          { path: "history/:sessionId", element: <ManageHistoryPage /> },
          { path: "people", element: <PeoplePage /> },
          { path: "settings", element: <SettingsPage /> },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
];

const router = createHashRouter(routes);

/**
 * Everything below is one person's data. Keyed on the person, so switching remounts it against that
 * person's own local database, plan and sync state.
 */
export function PersonScope({ children }: { children: ReactNode }) {
  const { activePersonId } = usePeople();
  return (
    <PersonData key={activePersonId ?? "local"} personId={activePersonId}>
      {children}
    </PersonData>
  );
}

function PersonData({ personId, children }: { personId?: string; children: ReactNode }) {
  // Point storage at this person's database before any provider below touches it.
  useState(() => selectDatabase(dbNameForPerson(personId)));
  return (
    <ConfigProvider>
      <ActiveWorkoutProvider>
        <SyncProvider>{children}</SyncProvider>
      </ActiveWorkoutProvider>
    </ConfigProvider>
  );
}

export function App() {
  return (
    <PeopleProvider>
      <PersonScope>
        <RouterProvider router={router} />
      </PersonScope>
    </PeopleProvider>
  );
}
