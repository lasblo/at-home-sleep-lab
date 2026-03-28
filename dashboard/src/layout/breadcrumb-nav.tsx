import { useLocation, useNavigate, useParams } from "react-router-dom"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

function formatNightDate(date: string): string {
  try {
    const d = new Date(date + "T12:00:00")
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  } catch {
    return date
  }
}

export function BreadcrumbNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()

  const crumbs: { label: string; href?: string }[] = [
    { label: "Dashboard", href: "/" },
  ]

  if (location.pathname.startsWith("/nights") && params.date) {
    crumbs.push({
      label: formatNightDate(params.date),
      href: params.videoId ? `/nights/${params.date}` : undefined,
    })
    if (params.videoId) {
      crumbs.push({ label: "Video Review" })
    }
  } else if (location.pathname === "/videos") {
    crumbs.push({ label: "Videos" })
  } else if (location.pathname === "/settings") {
    crumbs.push({ label: "Settings" })
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <span key={crumb.label} className="flex items-center gap-1.5">
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast || !crumb.href ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="cursor-pointer"
                    onClick={() => navigate(crumb.href!)}
                  >
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
