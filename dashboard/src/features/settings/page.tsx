import { PageHeader } from "@/shared/components/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { UniFiCard } from "./components/unifi-card"
import { BluetoothCard } from "./components/bluetooth-card"
import { HRMonitorCard } from "./components/hr-monitor-card"
import { ThemeSelector } from "@/shared/components/theme-selector"

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Settings" />

      <UniFiCard />

      <Separator />

      <BluetoothCard />
      <HRMonitorCard />

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Press 'd' to toggle theme quickly.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>
    </div>
  )
}
