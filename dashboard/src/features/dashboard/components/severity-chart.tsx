import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { PlmiSeverity } from "@/shared/lib/utils"

const SEVERITY_COLORS: Record<PlmiSeverity, string> = {
  normal: "var(--color-severity-normal)",
  mild: "var(--color-severity-mild)",
  moderate: "var(--color-severity-moderate)",
  severe: "var(--color-severity-severe)",
}

const chartConfig = {
  count: { label: "Nights" },
  normal: { label: "Normal (<5)", color: "var(--color-severity-normal)" },
  mild: { label: "Mild (5-15)", color: "var(--color-severity-mild)" },
  moderate: {
    label: "Moderate (15-25)",
    color: "var(--color-severity-moderate)",
  },
  severe: { label: "Severe (>25)", color: "var(--color-severity-severe)" },
} satisfies ChartConfig

interface SeverityChartProps {
  distribution: Record<PlmiSeverity, number>
  total: number
}

export function SeverityChart({ distribution, total }: SeverityChartProps) {
  const data = (["normal", "mild", "moderate", "severe"] as PlmiSeverity[]).map(
    (sev) => ({
      severity: sev,
      label: sev.charAt(0).toUpperCase() + sev.slice(1),
      count: distribution[sev],
      pct: total > 0 ? Math.round((distribution[sev] / total) * 100) : 0,
      fill: SEVERITY_COLORS[sev],
    })
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Severity Distribution</CardTitle>
        <CardDescription>Nights by PLMI severity band</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[120px] w-full">
          <BarChart data={data} layout="vertical" barSize={28}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              width={72}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, item) => [
                    `${value} night${(value as number) !== 1 ? "s" : ""} (${item.payload.pct}%)`,
                    item.payload.label,
                  ]}
                />
              }
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((d) => (
                <Cell key={d.severity} fill={d.fill} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>

        {/* Inline legend with counts */}
        <div className="mt-2 flex gap-4 text-xs tabular-nums">
          {data.map((d) => (
            <div key={d.severity} className="flex items-center gap-1.5">
              <div
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: d.fill, opacity: 0.8 }}
              />
              <span className="text-muted-foreground">{d.label}</span>
              <span className="font-medium">{d.count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
