import { RotateCcw } from "lucide-react";
import { Link, Navigate, Outlet, RouterProvider, ScrollRestoration, createHashRouter, useRouteError } from "react-router-dom";
import { EmptyState } from "./components/ui";
import { ExercisesPage } from "./pages/manage/ExercisesPage";
import { ManageHistoryPage } from "./pages/manage/HistoryPage";
import { ManageLayout } from "./pages/manage/ManageLayout";
import { SchedulePage } from "./pages/manage/SchedulePage";
import { SettingsPage } from "./pages/manage/SettingsPage";
import { WorkoutsPage } from "./pages/manage/WorkoutsPage";
import { ExercisePage } from "./pages/phone/ExercisePage";
import { FinishPage } from "./pages/phone/FinishPage";
import { IntervalPage } from "./pages/phone/IntervalPage";
import { PhoneHistoryDetail, PhoneHistoryList } from "./pages/phone/HistoryPages";
import { PhoneHome } from "./pages/phone/PhoneHome";
import { WorkoutPage } from "./pages/phone/WorkoutPage";
import { preferredMode } from "./services/settings";
import { ActiveWorkoutProvider } from "./state/ActiveWorkoutContext";
import { ConfigProvider } from "./state/ConfigContext";

function Root() {
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
          { path: "settings", element: <SettingsPage /> },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
];

const router = createHashRouter(routes);

export function App() {
  return (
    <ConfigProvider>
      <ActiveWorkoutProvider>
        <RouterProvider router={router} />
      </ActiveWorkoutProvider>
    </ConfigProvider>
  );
}
