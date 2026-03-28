import { useTheme } from "@/components/theme-provider"
import { PageHeader } from "@/shared/components/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Separator } from "@/components/ui/separator"
import { Sun, Moon, Monitor } from "lucide-react"

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Settings" />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Choose your preferred color theme. Press 'd' to toggle quickly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            type="single"
            value={theme}
            onValueChange={(v) =>
              v && setTheme(v as "light" | "dark" | "system")
            }
          >
            <ToggleGroupItem value="light" aria-label="Light theme">
              <Sun data-icon="inline-start" />
              Light
            </ToggleGroupItem>
            <ToggleGroupItem value="dark" aria-label="Dark theme">
              <Moon data-icon="inline-start" />
              Dark
            </ToggleGroupItem>
            <ToggleGroupItem value="system" aria-label="System theme">
              <Monitor data-icon="inline-start" />
              System
            </ToggleGroupItem>
          </ToggleGroup>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
          <CardDescription>Sleep Lab - PLMS Detector</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            At-home sleep analysis using infrared video recordings with
            AASM-standard periodic limb movement scoring and optional cardiac
            arousal detection via WHOOP heart rate monitoring.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
