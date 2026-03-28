import { useState, useRef, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Upload, CheckCircle2, FileVideo, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface UploadResult {
  filename: string
  status: "uploaded" | "exists"
  size?: number
}

export function UploadZone() {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<UploadResult[] | null>(null)

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const mp4s = Array.from(files).filter((f) =>
        f.name.toLowerCase().endsWith(".mp4")
      )
      if (mp4s.length === 0) {
        toast.error("No MP4 files selected")
        return
      }

      setUploading(true)
      setProgress(0)
      setResults(null)

      const formData = new FormData()
      for (const file of mp4s) {
        formData.append("files", file)
      }

      try {
        const xhr = new XMLHttpRequest()
        const response = await new Promise<{ uploaded: UploadResult[] }>(
          (resolve, reject) => {
            xhr.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) {
                setProgress(Math.round((e.loaded / e.total) * 100))
              }
            })
            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText))
              } else {
                reject(new Error(`Upload failed: ${xhr.status}`))
              }
            })
            xhr.addEventListener("error", () => reject(new Error("Upload failed")))
            xhr.open("POST", "/api/upload")
            xhr.send(formData)
          }
        )

        setResults(response.uploaded)
        const newCount = response.uploaded.filter(
          (r) => r.status === "uploaded"
        ).length
        if (newCount > 0) {
          toast.success(`Uploaded ${newCount} video${newCount !== 1 ? "s" : ""}`)
          queryClient.invalidateQueries({ queryKey: ["videos"] })
          queryClient.invalidateQueries({ queryKey: ["nights"] })
        }
        const existsCount = response.uploaded.filter(
          (r) => r.status === "exists"
        ).length
        if (existsCount > 0) {
          toast.info(`${existsCount} file${existsCount !== 1 ? "s" : ""} already existed`)
        }
      } catch (err) {
        toast.error("Upload failed")
      } finally {
        setUploading(false)
      }
    },
    [queryClient]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (e.dataTransfer.files.length > 0) {
        upload(e.dataTransfer.files)
      }
    },
    [upload]
  )

  return (
    <Card>
      <CardContent className="p-0">
        <input
          ref={inputRef}
          type="file"
          accept=".mp4,video/mp4"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          )}
        >
          {uploading ? (
            <>
              <Spinner className="size-8" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Uploading...</p>
                <Progress value={progress} className="h-2 w-48" />
                <p className="text-xs text-muted-foreground">{progress}%</p>
              </div>
            </>
          ) : (
            <>
              <Upload className="size-8 text-muted-foreground" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  Drop MP4 files here or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  Supports multiple files. Only .mp4 accepted.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Upload results */}
        {results && results.length > 0 && (
          <div className="flex flex-col gap-1 border-t p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Upload Results
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6"
                onClick={(e) => {
                  e.stopPropagation()
                  setResults(null)
                }}
              >
                <X data-icon="inline-start" />
                Clear
              </Button>
            </div>
            {results.map((r) => (
              <div
                key={r.filename}
                className="flex items-center gap-2 text-xs"
              >
                <FileVideo className="size-3.5 text-muted-foreground" />
                <span className="truncate">{r.filename}</span>
                {r.status === "uploaded" ? (
                  <Badge
                    variant="secondary"
                    className="ml-auto bg-severity-normal/15 text-severity-normal text-[10px]"
                  >
                    <CheckCircle2 className="mr-0.5" />
                    Uploaded
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    Already exists
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
