import { useQuery } from "@tanstack/react-query"
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
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Sun, Moon, Monitor, Heart } from "lucide-react"

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { data: hrStatus } = useQuery({
    queryKey: ["hr", "status"],
    queryFn: async () => {
      const res = await fetch("/api/hr/status")
      if (!res.ok) throw new Error("Failed to fetch HR status")
      return res.json()
    },
  })

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

      <Card>
        <CardHeader>
          <CardTitle>Heart Rate Monitor</CardTitle>
          <CardDescription>
            WHOOP BLE connection status for cardiac arousal detection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Heart className="text-chart-3" />
            {hrStatus?.status === "connected" ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-severity-normal/15 text-severity-normal">
                    Connected
                  </Badge>
                  <span className="text-sm">{hrStatus.device}</span>
                </div>
                {hrStatus.hr && (
                  <span className="text-xs text-muted-foreground">
                    Current HR: {hrStatus.hr} bpm
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <Badge variant="outline">Not Connected</Badge>
                <span className="text-xs text-muted-foreground">
                  Run: python backend/whoop_hr.py from Terminal
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
          <CardDescription>
            Sleep Lab - PLMS Detector
          </CardDescription>
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
