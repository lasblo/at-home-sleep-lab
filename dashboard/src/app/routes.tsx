import { lazy, Suspense } from "react"
import { createBrowserRouter, Navigate } from "react-router-dom"
import { AppLayout } from "@/app/layout"
import { Skeleton } from "@/components/ui/skeleton"

const DashboardPage = lazy(() => import("@/features/dashboard/page"))
const NightDetailPage = lazy(() => import("@/features/nights/page"))
const VideosPage = lazy(() => import("@/features/videos/page"))
const SettingsPage = lazy(() => import("@/features/settings/page"))

function PageLoader() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-[200px]" />
    </div>
  )
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: (
          <LazyPage>
            <DashboardPage />
          </LazyPage>
        ),
      },
      {
        path: "nights/:date",
        element: (
          <LazyPage>
            <NightDetailPage />
          </LazyPage>
        ),
      },
      {
        path: "nights/:date/:videoId",
        element: (
          <LazyPage>
            <NightDetailPage />
          </LazyPage>
        ),
      },
      {
        path: "videos",
        element: (
          <LazyPage>
            <VideosPage />
          </LazyPage>
        ),
      },
      {
        path: "settings",
        element: (
          <LazyPage>
            <SettingsPage />
          </LazyPage>
        ),
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
])
