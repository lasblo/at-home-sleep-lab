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
import { UniFiCard } from "./components/unifi-card"
import { BluetoothCard } from "./components/bluetooth-card"
import { WhoopCard } from "./components/whoop-card"

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Settings" />

      <UniFiCard />

      <Separator />

      <BluetoothCard />
      <WhoopCard />

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Press 'd' to toggle theme quickly.</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            type="single"
            value={theme}
            onValueChange={(v) => v && setTheme(v as "light" | "dark" | "system")}
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
    </div>
  )
}
