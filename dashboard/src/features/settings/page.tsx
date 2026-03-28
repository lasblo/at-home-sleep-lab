import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTheme } from "@/components/theme-provider"
import { PageHeader } from "@/shared/components/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sun, Moon, Monitor, CheckCircle2, XCircle, Video } from "lucide-react"
import { toast } from "sonner"
import type { UniFiCamera } from "@/shared/types/api"

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()

  // UniFi settings
  const { data: unifiSettings } = useQuery({
    queryKey: ["settings", "unifi"],
    queryFn: async () => {
      const res = await fetch("/api/settings/unifi")
      if (!res.ok) return null
      return res.json()
    },
  })

  const [editing, setEditing] = useState(false)
  const [unifiHost, setUnifiHost] = useState("")
  const [unifiUser, setUnifiUser] = useState("")
  const [unifiPass, setUnifiPass] = useState("")
  const [selectedCamera, setSelectedCamera] = useState("")
  const [cameras, setCameras] = useState<UniFiCamera[]>([])
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null)

  const isConfigured = !!(unifiSettings?.host && unifiSettings?.camera_id)

  useEffect(() => {
    if (unifiSettings) {
      setUnifiHost(unifiSettings.host || "")
      setUnifiUser(unifiSettings.username || "")
      setSelectedCamera(unifiSettings.camera_id || "")
    }
  }, [unifiSettings])

  const testConnection = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/unifi/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: unifiHost, username: unifiUser, password: unifiPass }),
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.ok) {
        setTestResult("ok")
        toast.success(`Connected to ${data.name}`)
      } else {
        setTestResult("fail")
        toast.error(data.error || "Connection failed")
      }
    },
  })

  const fetchCameras = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/unifi/cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: unifiHost, username: unifiUser, password: unifiPass }),
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.cameras) {
        setCameras(data.cameras)
        if (data.cameras.length > 0 && !selectedCamera) {
          setSelectedCamera(data.cameras[0].id)
        }
      }
    },
  })

  const saveUnifi = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/unifi", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: unifiHost,
          username: unifiUser,
          password: unifiPass,
          camera_id: selectedCamera,
          camera_name: cameras.find((c) => c.id === selectedCamera)?.name || "",
        }),
      })
      return res.json()
    },
    onSuccess: () => {
      toast.success("UniFi Protect settings saved")
      queryClient.invalidateQueries({ queryKey: ["settings"] })
    },
  })

  // WHOOP settings
  const { data: whoopSettings } = useQuery({
    queryKey: ["settings", "whoop"],
    queryFn: async () => {
      const res = await fetch("/api/settings/whoop")
      if (!res.ok) return null
      return res.json()
    },
  })

  const [whoopEditing, setWhoopEditing] = useState(false)
  const [bleUrl, setBleUrl] = useState("http://host.docker.internal:8001")
  const [whoopDevices, setWhoopDevices] = useState<Array<{ address: string; name: string }>>([])
  const [selectedDevice, setSelectedDevice] = useState("")
  const [testHr, setTestHr] = useState<number | null>(null)

  const whoopConfigured = !!(whoopSettings?.enabled && whoopSettings?.device_address)

  useEffect(() => {
    if (whoopSettings) {
      setBleUrl(whoopSettings.ble_service_url || "http://host.docker.internal:8001")
      setSelectedDevice(whoopSettings.device_address || "")
    }
  }, [whoopSettings])

  const discoverDevices = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ble/discover")
      return res.json()
    },
    onSuccess: (data) => {
      if (data.ok) {
        setWhoopDevices(data.devices)
        if (data.devices.length === 0) toast.info("No HR devices found. Make sure WHOOP is nearby.")
        else if (data.devices.length === 1) setSelectedDevice(data.devices[0].address)
      } else {
        toast.error(data.error || "Discovery failed. Is the BLE service running? (make ble)")
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

  const saveWhoop = useMutation({
    mutationFn: async () => {
      const deviceName = whoopDevices.find((d) => d.address === selectedDevice)?.name || selectedDevice
      const res = await fetch("/api/settings/whoop", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          ble_service_url: bleUrl,
          device_address: selectedDevice,
          device_name: deviceName,
        }),
      })
      return res.json()
    },
    onSuccess: () => {
      toast.success("WHOOP settings saved")
      setWhoopEditing(false)
      queryClient.invalidateQueries({ queryKey: ["settings"] })
    },
  })

  const disableWhoop = useMutation({
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
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Settings" />

      {/* UniFi Protect */}
      <Card>
        <CardHeader>
          <CardTitle>UniFi Protect</CardTitle>
          <CardDescription>
            {isConfigured && !editing
              ? "Connected to your UniFi Protect NVR."
              : "Connect to your UniFi Protect NVR to automatically fetch sleep recordings."}
          </CardDescription>
        </CardHeader>

        {isConfigured && !editing ? (
          /* ── Configured summary ── */
          <>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-5 text-severity-normal" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{unifiSettings.host}</span>
                  <span className="text-xs text-muted-foreground">
                    {unifiSettings.username}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Video className="size-4 text-muted-foreground" />
                <span className="text-sm">
                  {unifiSettings.camera_name || unifiSettings.camera_id}
                </span>
                <Badge variant="secondary" className="bg-severity-normal/15 text-severity-normal text-[10px]">
                  Configured
                </Badge>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Reconfigure
              </Button>
            </CardFooter>
          </>
        ) : (
          /* ── Setup form ── */
          <>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="unifi-host">NVR Address</Label>
                <Input
                  id="unifi-host"
                  placeholder="192.168.1.1"
                  value={unifiHost}
                  onChange={(e) => { setUnifiHost(e.target.value.replace(/^https?:\/\//, "")); setTestResult(null) }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="unifi-user">Username</Label>
                  <Input
                    id="unifi-user"
                    placeholder="admin"
                    value={unifiUser}
                    onChange={(e) => setUnifiUser(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="unifi-pass">Password</Label>
                  <Input
                    id="unifi-pass"
                    type="password"
                    value={unifiPass}
                    onChange={(e) => setUnifiPass(e.target.value)}
                  />
                </div>
              </div>

              {/* Step 1: Test connection */}
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testConnection.mutate()}
                  disabled={!unifiHost || !unifiUser || !unifiPass || testConnection.isPending}
                >
                  {testConnection.isPending ? <Spinner data-icon="inline-start" /> : null}
                  Test Connection
                </Button>
                {testResult === "ok" && (
                  <Badge variant="secondary" className="bg-severity-normal/15 text-severity-normal">
                    <CheckCircle2 className="mr-0.5" />
                    Connected
                  </Badge>
                )}
                {testResult === "fail" && (
                  <Badge variant="destructive">
                    <XCircle className="mr-0.5" />
                    Failed
                  </Badge>
                )}
              </div>

              {/* Step 2: Select camera */}
              {testResult === "ok" && (
                <>
                  <Separator />
                  <div className="flex items-end gap-3">
                    <div className="flex flex-1 flex-col gap-2">
                      <Label>Camera</Label>
                      {cameras.length > 0 ? (
                        <Select value={selectedCamera} onValueChange={setSelectedCamera}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a camera" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {cameras.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  <div className="flex items-center gap-2">
                                    <Video className="size-3.5" />
                                    {c.name}
                                    {!c.is_connected && (
                                      <Badge variant="outline" className="text-[10px]">
                                        Offline
                                      </Badge>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fetchCameras.mutate()}
                          disabled={fetchCameras.isPending}
                        >
                          {fetchCameras.isPending ? <Spinner data-icon="inline-start" /> : null}
                          Load Cameras
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="gap-2">
              <Button
                onClick={() => {
                  saveUnifi.mutate()
                  setEditing(false)
                }}
                disabled={!unifiHost || !selectedCamera || saveUnifi.isPending}
              >
                {saveUnifi.isPending ? <Spinner data-icon="inline-start" /> : null}
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

      {/* WHOOP HR */}
      <Card>
        <CardHeader>
          <CardTitle>WHOOP Heart Rate</CardTitle>
          <CardDescription>
            {whoopConfigured && !whoopEditing
              ? "WHOOP HR monitoring is configured for sleep sessions."
              : "Pair your WHOOP band for cardiac arousal detection during sleep. Requires the BLE service running on the host (make ble)."}
          </CardDescription>
        </CardHeader>

        {whoopConfigured && !whoopEditing ? (
          <>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-5 text-severity-normal" />
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
              <Button variant="outline" size="sm" onClick={() => setWhoopEditing(true)}>
                Reconfigure
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => disableWhoop.mutate()}
                disabled={disableWhoop.isPending}
              >
                Disable
              </Button>
            </CardFooter>
          </>
        ) : (
          <>
            <CardContent className="flex flex-col gap-4">
              {/* BLE Service URL */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="ble-url">BLE Service URL</Label>
                <Input
                  id="ble-url"
                  value={bleUrl}
                  onChange={(e) => setBleUrl(e.target.value)}
                  placeholder="http://host.docker.internal:8001"
                />
              </div>

              {/* Step 1: Discover devices */}
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => discoverDevices.mutate()}
                  disabled={discoverDevices.isPending}
                >
                  {discoverDevices.isPending ? <Spinner data-icon="inline-start" /> : null}
                  Scan for Devices
                </Button>
                {whoopDevices.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {whoopDevices.length} device{whoopDevices.length !== 1 && "s"} found
                  </span>
                )}
              </div>

              {/* Step 2: Select device */}
              {whoopDevices.length > 0 && (
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
                          {whoopDevices.map((d) => (
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
                onClick={() => saveWhoop.mutate()}
                disabled={!selectedDevice || saveWhoop.isPending}
              >
                {saveWhoop.isPending ? <Spinner data-icon="inline-start" /> : null}
                Save
              </Button>
              {whoopConfigured && (
                <Button variant="outline" onClick={() => setWhoopEditing(false)}>
                  Cancel
                </Button>
              )}
            </CardFooter>
          </>
        )}
      </Card>

      <Separator />

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Press 'd' to toggle theme quickly.
          </CardDescription>
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
