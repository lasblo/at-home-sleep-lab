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

  const [unifiHost, setUnifiHost] = useState("")
  const [unifiUser, setUnifiUser] = useState("")
  const [unifiPass, setUnifiPass] = useState("")
  const [selectedCamera, setSelectedCamera] = useState("")
  const [cameras, setCameras] = useState<UniFiCamera[]>([])
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null)

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

  const [whoopEnabled, setWhoopEnabled] = useState(false)
  const [bleUrl, setBleUrl] = useState("http://host.docker.internal:8001")

  useEffect(() => {
    if (whoopSettings) {
      setWhoopEnabled(whoopSettings.enabled ?? false)
      setBleUrl(whoopSettings.ble_service_url || "http://host.docker.internal:8001")
    }
  }, [whoopSettings])

  const saveWhoop = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/whoop", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: whoopEnabled, ble_service_url: bleUrl }),
      })
      return res.json()
    },
    onSuccess: () => {
      toast.success("WHOOP settings saved")
      queryClient.invalidateQueries({ queryKey: ["settings"] })
    },
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Settings" />

      {/* UniFi Protect setup */}
      <Card>
        <CardHeader>
          <CardTitle>UniFi Protect</CardTitle>
          <CardDescription>
            Connect to your UniFi Protect NVR to automatically fetch sleep
            recordings from your IR camera.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="unifi-host">NVR Address</Label>
            <Input
              id="unifi-host"
              placeholder="https://192.168.1.1"
              value={unifiHost}
              onChange={(e) => { setUnifiHost(e.target.value); setTestResult(null) }}
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
        <CardFooter>
          <Button
            onClick={() => saveUnifi.mutate()}
            disabled={!unifiHost || !selectedCamera || saveUnifi.isPending}
          >
            {saveUnifi.isPending ? <Spinner data-icon="inline-start" /> : null}
            Save UniFi Settings
          </Button>
        </CardFooter>
      </Card>

      {/* WHOOP HR */}
      <Card>
        <CardHeader>
          <CardTitle>WHOOP Heart Rate</CardTitle>
          <CardDescription>
            Enable WHOOP BLE monitoring during sleep sessions for cardiac
            arousal detection. Requires the BLE service running on the host
            (make ble).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={whoopEnabled}
              onCheckedChange={setWhoopEnabled}
              id="whoop-enabled"
            />
            <Label htmlFor="whoop-enabled">
              Enable WHOOP during sleep sessions
            </Label>
          </div>
          {whoopEnabled && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="ble-url">BLE Service URL</Label>
              <Input
                id="ble-url"
                value={bleUrl}
                onChange={(e) => setBleUrl(e.target.value)}
                placeholder="http://host.docker.internal:8001"
              />
              <p className="text-xs text-muted-foreground">
                Default works for Docker Desktop. Change if running differently.
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button
            onClick={() => saveWhoop.mutate()}
            disabled={saveWhoop.isPending}
          >
            {saveWhoop.isPending ? <Spinner data-icon="inline-start" /> : null}
            Save WHOOP Settings
          </Button>
        </CardFooter>
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
