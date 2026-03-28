import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CheckCircle2, Heart } from "lucide-react"
import { toast } from "sonner"

export function WhoopCard() {
  const queryClient = useQueryClient()

  const { data: whoopSettings } = useQuery({
    queryKey: ["settings", "whoop"],
    queryFn: async () => {
      const res = await fetch("/api/settings/whoop")
      if (!res.ok) return null
      return res.json()
    },
  })

  const { data: bleSettings } = useQuery({
    queryKey: ["settings", "bluetooth"],
    queryFn: async () => {
      const res = await fetch("/api/settings/bluetooth")
      if (!res.ok) return null
      return res.json()
    },
  })

  const bleConfigured = !!bleSettings?.url

  const [editing, setEditing] = useState(false)
  const [devices, setDevices] = useState<Array<{ address: string; name: string }>>([])
  const [selectedDevice, setSelectedDevice] = useState("")
  const [testHr, setTestHr] = useState<number | null>(null)

  const isConfigured = !!(whoopSettings?.enabled && whoopSettings?.device_address)

  useEffect(() => {
    if (whoopSettings?.device_address) setSelectedDevice(whoopSettings.device_address)
  }, [whoopSettings])

  const discover = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ble/discover")
      return res.json()
    },
    onSuccess: (data) => {
      if (data.ok) {
        setDevices(data.devices)
        if (data.devices.length === 0) toast.info("No HR devices found. Make sure WHOOP is nearby and awake.")
        else if (data.devices.length === 1) setSelectedDevice(data.devices[0].address)
      } else {
        toast.error(data.error || "Discovery failed. Is Bluetooth configured?")
      }
    },
  })

  const testDevice = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ble/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: selectedDevice }),
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.ok) {
        setTestHr(data.hr)
        toast.success(`HR reading: ${data.hr} bpm`)
      } else {
        toast.error(data.error || "Test failed")
      }
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      const deviceName = devices.find((d) => d.address === selectedDevice)?.name || whoopSettings?.device_name || selectedDevice
      const res = await fetch("/api/settings/whoop", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          device_address: selectedDevice,
          device_name: deviceName,
        }),
      })
      return res.json()
    },
    onSuccess: () => {
      toast.success("WHOOP settings saved")
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ["settings"] })
    },
  })

  const disable = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/whoop", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      })
      return res.json()
    },
    onSuccess: () => {
      toast.success("WHOOP disabled")
      queryClient.invalidateQueries({ queryKey: ["settings"] })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>WHOOP Heart Rate</CardTitle>
        <CardDescription>
          {isConfigured && !editing
            ? "WHOOP HR monitoring is enabled for sleep sessions."
            : "Select your WHOOP band for cardiac arousal detection during sleep."}
        </CardDescription>
      </CardHeader>

      {isConfigured && !editing ? (
        <>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Heart className="size-5 text-chart-3" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {whoopSettings.device_name || whoopSettings.device_address}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {whoopSettings.device_address}
                </span>
              </div>
              <Badge variant="secondary" className="bg-severity-normal/15 text-severity-normal text-[10px]">
                Configured
              </Badge>
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Reconfigure
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => disable.mutate()}
              disabled={disable.isPending}
            >
              Disable
            </Button>
          </CardFooter>
        </>
      ) : (
        <>
          <CardContent className="flex flex-col gap-4">
            {!bleConfigured && (
              <Alert>
                <AlertDescription>
                  Configure Bluetooth above first to scan for WHOOP devices.
                </AlertDescription>
              </Alert>
            )}

            {/* Step 1: Discover */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => discover.mutate()}
                disabled={!bleConfigured || discover.isPending}
              >
                {discover.isPending ? <Spinner data-icon="inline-start" /> : null}
                Scan for Devices
              </Button>
              {devices.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {devices.length} device{devices.length !== 1 && "s"} found
                </span>
              )}
            </div>

            {/* Step 2: Select */}
            {devices.length > 0 && (
              <>
                <Separator />
                <div className="flex flex-col gap-2">
                  <Label>Device</Label>
                  <Select value={selectedDevice} onValueChange={(v) => { setSelectedDevice(v); setTestHr(null) }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your WHOOP" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {devices.map((d) => (
                          <SelectItem key={d.address} value={d.address}>
                            {d.name} ({d.address})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {/* Step 3: Test */}
                {selectedDevice && (
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testDevice.mutate()}
                      disabled={testDevice.isPending}
                    >
                      {testDevice.isPending ? <Spinner data-icon="inline-start" /> : null}
                      Test HR Reading
                    </Button>
                    {testHr != null && (
                      <Badge variant="secondary" className="bg-severity-normal/15 text-severity-normal">
                        <CheckCircle2 className="mr-0.5" />
                        {testHr} bpm
                      </Badge>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
          <CardFooter className="gap-2">
            <Button
              onClick={() => save.mutate()}
              disabled={!selectedDevice || save.isPending}
            >
              {save.isPending ? <Spinner data-icon="inline-start" /> : null}
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
