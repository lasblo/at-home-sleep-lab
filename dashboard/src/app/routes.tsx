import { lazy, Suspense } from "react"
import { createBrowserRouter, Navigate } from "react-router-dom"
import { AppLayout } from "@/app/layout"
import { Skeleton } from "@/components/ui/skeleton"

const DashboardPage = lazy(() => import("@/features/dashboard/page"))
const SessionsPage = lazy(() => import("@/features/sessions/page"))
const SessionDetailPage = lazy(() => import("@/features/sessions/detail-page"))
const VideoReviewPage = lazy(() => import("@/features/video-review/page"))
const HeartRatePage = lazy(() => import("@/features/heart-rate/page"))
const SettingsPage = lazy(() => import("@/features/settings/page"))

function Lazy({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[200px]" />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Lazy><DashboardPage /></Lazy> },
      { path: "sessions", element: <Lazy><SessionsPage /></Lazy> },
      { path: "sessions/:sessionId", element: <Lazy><SessionDetailPage /></Lazy> },
      { path: "videos/:videoId", element: <Lazy><VideoReviewPage /></Lazy> },
      { path: "heart-rate", element: <Lazy><HeartRatePage /></Lazy> },
      { path: "settings", element: <Lazy><SettingsPage /></Lazy> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
])
