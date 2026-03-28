import { lazy, Suspense } from "react"
import { createBrowserRouter, Navigate } from "react-router-dom"
import { AppLayout } from "@/app/layout"
import { Skeleton } from "@/components/ui/skeleton"

const DashboardPage = lazy(() => import("@/features/dashboard/page"))
const NightsPage = lazy(() => import("@/features/nights/page"))
const NightDetailPage = lazy(() => import("@/features/nights/detail-page"))
const VideosPage = lazy(() => import("@/features/videos/page"))
const VideoReviewPage = lazy(() => import("@/features/video-review/page"))
const HeartRatePage = lazy(() => import("@/features/heart-rate/page"))
const SettingsPage = lazy(() => import("@/features/settings/page"))

function PageLoader() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-[200px]" />
    </div>
  )
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Lazy><DashboardPage /></Lazy> },
      { path: "nights", element: <Lazy><NightsPage /></Lazy> },
      { path: "nights/:date", element: <Lazy><NightDetailPage /></Lazy> },
      { path: "videos", element: <Lazy><VideosPage /></Lazy> },
      { path: "videos/:videoId", element: <Lazy><VideoReviewPage /></Lazy> },
      { path: "heart-rate", element: <Lazy><HeartRatePage /></Lazy> },
      { path: "settings", element: <Lazy><SettingsPage /></Lazy> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
])
