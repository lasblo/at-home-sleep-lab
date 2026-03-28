import { useTheme } from "@/components/theme-provider"
import { Sun, Moon } from "lucide-react"
import { cn } from "@/lib/utils"

export function ThemeToggle({ className }: { className?: string }) {
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
        "group relative flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-300",
        isDark
          ? "bg-sidebar-accent"
          : "bg-sidebar-border",
        className,
      )}
      aria-label={`Theme: ${theme}. Click to cycle.`}
    >
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full shadow-sm transition-all duration-300",
          isDark
            ? "translate-x-5 bg-sidebar-primary text-sidebar-primary-foreground"
            : "translate-x-0 bg-white text-amber-500",
        )}
      >
        {isDark ? <Moon className="size-3" /> : <Sun className="size-3" />}
      </span>
    </button>
  )
}
