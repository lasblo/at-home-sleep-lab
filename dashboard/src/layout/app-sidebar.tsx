import { useLocation, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  Moon as MoonIcon,
  Heart,
  Settings,
  CalendarDays,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { SessionControl } from "@/features/sessions/components/session-control"
import { ThemeToggle } from "@/shared/components/theme-toggle"

const NAV_ITEMS = [
  {
    group: "Overview",
    items: [{ label: "Dashboard", icon: LayoutDashboard, href: "/" }],
  },
  {
    group: "Analysis",
    items: [
      { label: "Sessions", icon: CalendarDays, href: "/sessions" },
      { label: "Heart Rate", icon: Heart, href: "/heart-rate" },
    ],
  },
  {
    group: "System",
    items: [{ label: "Settings", icon: Settings, href: "/settings" }],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname.startsWith(href)
}

export function AppSidebar() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => navigate("/")}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
                  <MoonIcon className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-heading text-sm font-bold tracking-tight">
                    Sleep Lab
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    But at Home
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Sleep Session</SidebarGroupLabel>
          <div className="px-2">
            <SessionControl />
          </div>
        </SidebarGroup>

        <Separator />

        {NAV_ITEMS.map((group) => (
          <SidebarGroup key={group.group}>
            <SidebarGroupLabel>{group.group}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    isActive={isActive(location.pathname, item.href)}
                    onClick={() => navigate(item.href)}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-center p-2">
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
