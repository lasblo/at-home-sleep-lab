import { useLocation, useNavigate, useParams } from "react-router-dom"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export function BreadcrumbNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()

  const crumbs: { label: string; href?: string }[] = []

  if (location.pathname === "/") {
    crumbs.push({ label: "Dashboard" })
  } else if (location.pathname.startsWith("/sessions")) {
    crumbs.push({ label: "Sessions", href: "/sessions" })
    if (params.sessionId) {
      crumbs.push({ label: "Session Detail" })
    }
  } else if (location.pathname.startsWith("/videos")) {
    crumbs.push({ label: "Video Review" })
  } else if (location.pathname === "/heart-rate") {
    crumbs.push({ label: "Heart Rate" })
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
