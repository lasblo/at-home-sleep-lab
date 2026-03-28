import { useLocation, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  Moon as MoonIcon,
  Heart,
  Settings,
  Sun,
  Moon,
  Monitor,
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
import { useTheme } from "@/components/theme-provider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Separator } from "@/components/ui/separator"
import { SessionControl } from "@/features/sessions/components/session-control"

const NAV_ITEMS = [
  {
    group: "Overview",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/" },
    ],
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
    items: [
      { label: "Settings", icon: Settings, href: "/settings" },
    ],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname.startsWith(href)
}

export function AppSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()

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
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <MoonIcon className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Sleep Lab</span>
                  <span className="text-xs text-muted-foreground">
                    But at Home
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Session control */}
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
          <ToggleGroup
            type="single"
            value={theme}
            onValueChange={(v) => {
              if (v) setTheme(v as "light" | "dark" | "system")
            }}
            size="sm"
          >
            <ToggleGroupItem value="light" aria-label="Light theme">
              <Sun />
            </ToggleGroupItem>
            <ToggleGroupItem value="dark" aria-label="Dark theme">
              <Moon />
            </ToggleGroupItem>
            <ToggleGroupItem value="system" aria-label="System theme">
              <Monitor />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
