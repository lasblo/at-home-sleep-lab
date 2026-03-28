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
import { CheckCircle2, XCircle, Video } from "lucide-react"
import { toast } from "sonner"
import type { UniFiCamera } from "@/shared/types/api"

export function UniFiCard() {
  const queryClient = useQueryClient()

  const { data: unifiSettings } = useQuery({
    queryKey: ["settings", "unifi"],
    queryFn: async () => {
      const res = await fetch("/api/settings/unifi")
      if (!res.ok) return null
      return res.json()
    },
  })

  const [editing, setEditing] = useState(false)
  const [host, setHost] = useState("")
  const [user, setUser] = useState("")
  const [pass, setPass] = useState("")
  const [selectedCamera, setSelectedCamera] = useState("")
  const [cameras, setCameras] = useState<UniFiCamera[]>([])
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null)

  const isConfigured = !!(unifiSettings?.host && unifiSettings?.camera_id)

  useEffect(() => {
    if (unifiSettings) {
      setHost(unifiSettings.host || "")
      setUser(unifiSettings.username || "")
      setSelectedCamera(unifiSettings.camera_id || "")
    }
  }, [unifiSettings])

  const testConnection = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/unifi/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, username: user, password: pass }),
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.ok) { setTestResult("ok"); toast.success(`Connected to ${data.name}`) }
      else { setTestResult("fail"); toast.error(data.error || "Connection failed") }
    },
  })

  const fetchCameras = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/unifi/cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, username: user, password: pass }),
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.cameras) {
        setCameras(data.cameras)
        if (data.cameras.length > 0 && !selectedCamera) setSelectedCamera(data.cameras[0].id)
      }
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/unifi", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host, username: user, password: pass,
          camera_id: selectedCamera,
          camera_name: cameras.find((c) => c.id === selectedCamera)?.name || "",
        }),
      })
      return res.json()
    },
    onSuccess: () => {
      toast.success("UniFi Protect settings saved")
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ["settings"] })
    },
  })

  return (
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
        <>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-5 text-severity-normal" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{unifiSettings.host}</span>
                <span className="text-xs text-muted-foreground">{unifiSettings.username}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Video className="size-4 text-muted-foreground" />
              <span className="text-sm">{unifiSettings.camera_name || unifiSettings.camera_id}</span>
              <Badge variant="secondary" className="bg-severity-normal/15 text-severity-normal text-[10px]">Configured</Badge>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Reconfigure</Button>
          </CardFooter>
        </>
      ) : (
        <>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="unifi-host">NVR Address</Label>
              <Input id="unifi-host" placeholder="192.168.1.1" value={host}
                onChange={(e) => { setHost(e.target.value.replace(/^https?:\/\//, "")); setTestResult(null) }} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="unifi-user">Username</Label>
                <Input id="unifi-user" placeholder="admin" value={user} onChange={(e) => setUser(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="unifi-pass">Password</Label>
                <Input id="unifi-pass" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => testConnection.mutate()}
                disabled={!host || !user || !pass || testConnection.isPending}>
                {testConnection.isPending ? <Spinner data-icon="inline-start" /> : null}
                Test Connection
              </Button>
              {testResult === "ok" && (
                <Badge variant="secondary" className="bg-severity-normal/15 text-severity-normal">
                  <CheckCircle2 className="mr-0.5" />Connected
                </Badge>
              )}
              {testResult === "fail" && (
                <Badge variant="destructive"><XCircle className="mr-0.5" />Failed</Badge>
              )}
            </div>
            {testResult === "ok" && (
              <>
                <Separator />
                <div className="flex flex-col gap-2">
                  <Label>Camera</Label>
                  {cameras.length > 0 ? (
                    <Select value={selectedCamera} onValueChange={setSelectedCamera}>
                      <SelectTrigger><SelectValue placeholder="Select a camera" /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {cameras.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              <div className="flex items-center gap-2">
                                <Video className="size-3.5" />{c.name}
                                {!c.is_connected && <Badge variant="outline" className="text-[10px]">Offline</Badge>}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => fetchCameras.mutate()} disabled={fetchCameras.isPending}>
                      {fetchCameras.isPending ? <Spinner data-icon="inline-start" /> : null}
                      Load Cameras
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="gap-2">
            <Button onClick={() => save.mutate()} disabled={!host || !selectedCamera || save.isPending}>
              {save.isPending ? <Spinner data-icon="inline-start" /> : null}Save
            </Button>
            {isConfigured && <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>}
          </CardFooter>
        </>
      )}
    </Card>
  )
}
