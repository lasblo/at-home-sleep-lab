import { useLocation, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  Heart,
  Settings,
  CalendarDays,
  Sun,
  Moon,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { SessionControl } from "@/features/sessions/components/session-control"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Sessions", icon: CalendarDays, href: "/sessions" },
  { label: "Heart Rate", icon: Heart, href: "/heart-rate" },
  { label: "Settings", icon: Settings, href: "/settings" },
]

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname.startsWith(href)
}

function ThemeSwitch() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  function cycle() {
    const order: Array<"light" | "dark" | "system"> = [
      "light",
      "dark",
      "system",
    ]
    const next = order[(order.indexOf(theme) + 1) % order.length]
    setTheme(next)
  }

  return (
    <button
      onClick={cycle}
      className={cn(
        "group/switch relative flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-300 ease-out",
        isDark ? "bg-sidebar-accent" : "bg-sidebar-border",
      )}
      title={`Theme: ${theme}`}
      aria-label={`Current theme: ${theme}. Click to cycle.`}
    >
      <span
        className={cn(
          "pointer-events-none flex size-5 items-center justify-center rounded-full shadow-sm transition-all duration-300 ease-out",
          isDark
            ? "translate-x-[22px] bg-indigo-500 text-white"
            : "translate-x-[2px] bg-white text-amber-500",
        )}
      >
        {isDark ? (
          <Moon className="size-3" />
        ) : (
          <Sun className="size-3" />
        )}
      </span>
    </button>
  )
}

export function AppSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { theme } = useTheme()

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
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 dark:bg-indigo-500">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-[18px] text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 12c0 3.5 2 7.5 6.5 9 1 .3 2 .1 2.5-.5.4-.5.4-1.2 0-2-.5-1-1-2.5-.5-4s2-3 4-3.5c1.5-.4 3 0 4 .8.7.6 1.8.5 2.3-.2C22 10.5 22 8.5 21 6.5 19.5 3.5 16 1 12 1 6.5 1 2 5.5 2 12z" />
                  </svg>
                </div>
                <div className="flex flex-col leading-none">
                  <span className="text-sm font-semibold tracking-tight">
                    Sleep Lab
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    At-home analysis
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <div className="px-2 pb-1">
            <SessionControl />
          </div>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarMenu>
            {NAV_ITEMS.map((item) => (
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
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] text-muted-foreground">
            {theme === "system" ? "Auto" : theme === "dark" ? "Dark" : "Light"}
          </span>
          <ThemeSwitch />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
