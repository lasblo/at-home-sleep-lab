import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatTime } from "@/shared/lib/utils"
import type { Label } from "@/shared/types/api"
import { CATEGORIES } from "../categories"

interface LabelTableProps {
  labels: Label[]
  selectedId: number | null
  onSelect: (label: Label) => void
  onSeek: (time: number) => void
  onDelete: (labelId: number) => void
}

export function LabelTable({
  labels,
  selectedId,
  onSelect,
  onSeek,
  onDelete,
}: LabelTableProps) {
  return (
    <div className="max-h-[300px] overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Time</TableHead>
            <TableHead className="w-20">Duration</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {labels.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-muted-foreground"
              >
                No labels yet. Use number keys (1-7) to label at the current
                timestamp.
              </TableCell>
            </TableRow>
          ) : (
            labels.map((label) => {
              const cat = CATEGORIES.find((c) => c.key === label.category)
              return (
                <TableRow
                  key={label.id}
                  className={`cursor-pointer ${selectedId === label.id ? "bg-accent" : ""}`}
                  onClick={() => {
                    onSelect(label)
                    onSeek(label.timestamp_sec)
                  }}
                >
                  <TableCell className="tabular-nums">
                    {formatTime(label.timestamp_sec)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {label.duration_sec.toFixed(1)}s
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: cat?.color,
                        color: cat?.color,
                      }}
                    >
                      {cat?.label ?? label.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {label.notes || "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(label.id)
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
