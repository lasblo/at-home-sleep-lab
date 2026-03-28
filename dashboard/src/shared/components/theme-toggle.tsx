import { useTheme } from "@/components/theme-provider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Sun, Moon, Monitor } from "lucide-react"

export function ThemeToggle({ showLabels = false }: { showLabels?: boolean }) {
  const { theme, setTheme } = useTheme()

  return (
    <ToggleGroup
      type="single"
      value={theme}
      onValueChange={(v) => {
        if (v) setTheme(v as "light" | "dark" | "system")
      }}
      size="sm"
    >
      <ToggleGroupItem value="light" aria-label="Light theme">
        <Sun data-icon={showLabels ? "inline-start" : undefined} />
        {showLabels && "Light"}
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark theme">
        <Moon data-icon={showLabels ? "inline-start" : undefined} />
        {showLabels && "Dark"}
      </ToggleGroupItem>
      <ToggleGroupItem value="system" aria-label="System theme">
        <Monitor data-icon={showLabels ? "inline-start" : undefined} />
        {showLabels && "System"}
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
