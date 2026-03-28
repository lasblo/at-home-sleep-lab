import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { CheckCircle2, XCircle, Bluetooth } from "lucide-react"
import { toast } from "sonner"

export function BluetoothCard() {
  const queryClient = useQueryClient()

  const { data: bleSettings } = useQuery({
    queryKey: ["settings", "bluetooth"],
    queryFn: async () => {
      const res = await fetch("/api/settings/bluetooth")
      if (!res.ok) return null
      return res.json()
    },
  })

  const [editing, setEditing] = useState(false)
  const [bleUrl, setBleUrl] = useState("http://host.docker.internal:8001")

  const isConfigured = !!bleSettings?.url
  const configuredUrl = bleSettings?.url || ""

  useEffect(() => {
    if (bleSettings?.url) setBleUrl(bleSettings.url)
  }, [bleSettings])

  const testBle = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ble/discover")
      return res.json()
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast.success(
          `BLE service reachable (${data.devices.length} HR device${data.devices.length !== 1 ? "s" : ""} found)`
        )
      } else {
        toast.error(data.error || "BLE service unreachable")
      }
    },
  })

  const saveBle = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/bluetooth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: bleUrl }),
      })
      return res.json()
    },
    onSuccess: () => {
      toast.success("Bluetooth settings saved")
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ["settings"] })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bluetooth</CardTitle>
        <CardDescription>
          {isConfigured && !editing
            ? "BLE proxy service is configured. Used for heart rate monitors and other Bluetooth devices."
            : "Connect to the host-side BLE proxy service for Bluetooth device access. Start it with: make ble"}
        </CardDescription>
      </CardHeader>

      {isConfigured && !editing ? (
        <>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Bluetooth className="size-5 text-primary" />
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-sm">{configuredUrl}</span>
              </div>
              <Badge
                variant="secondary"
                className="bg-severity-normal/15 text-[10px] text-severity-normal"
              >
                Configured
              </Badge>
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => testBle.mutate()}
              disabled={testBle.isPending}
            >
              {testBle.isPending ? <Spinner data-icon="inline-start" /> : null}
              Test Connection
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Change URL
            </Button>
          </CardFooter>
        </>
      ) : (
        <>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ble-url">BLE Service URL</Label>
              <Input
                id="ble-url"
                value={bleUrl}
                onChange={(e) => setBleUrl(e.target.value)}
                placeholder="http://host.docker.internal:8001"
              />
              <p className="text-xs text-muted-foreground">
                Default works for Docker Desktop on macOS. Change if running
                differently.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testBle.mutate()}
                disabled={!bleUrl || testBle.isPending}
              >
                {testBle.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                Test Connection
              </Button>
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button
              onClick={() => saveBle.mutate()}
              disabled={!bleUrl || saveBle.isPending}
            >
              {saveBle.isPending ? <Spinner data-icon="inline-start" /> : null}
              Save
            </Button>
            {isConfigured && (
              <Button variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </CardFooter>
        </>
      )}
    </Card>
  )
}
