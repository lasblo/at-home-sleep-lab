import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"
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
import { formatDate } from "@/shared/lib/utils"
import type { DashboardSession } from "@/shared/types/api"

const chartConfig = {
  efficiency: {
    label: "Sleep Efficiency",
    color: "var(--color-chart-3)",
  },
} satisfies ChartConfig

interface SleepQualityChartProps {
  sessions: DashboardSession[]
}

export function SleepQualityChart({ sessions }: SleepQualityChartProps) {
  const data = sessions
    .filter((s) => s.sleep_quality?.efficiency_pct != null)
    .map((s) => ({
      date: s.night_date,
      efficiency: s.sleep_quality!.efficiency_pct,
      onset_min: s.sleep_quality!.sleep_onset_min,
      waso_min: s.sleep_quality!.waso_min,
    }))

  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Sleep Efficiency</CardTitle>
        <CardDescription>
          Estimated % of time in bed spent sleeping
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <AreaChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatDate(v).replace(/,.*/, "")}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              width={32}
              domain={[50, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <ReferenceLine
              y={85}
              stroke="var(--color-severity-normal)"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              label={{
                value: "85% good",
                position: "insideTopRight",
                fontSize: 10,
                fill: "var(--color-severity-normal)",
              }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(v) => formatDate(v as string)}
                  formatter={(value, name, item) => {
                    const p = item.payload
                    if (name === "efficiency") {
                      return [
                        `${(value as number).toFixed(1)}% (onset ${p.onset_min}m, WASO ${p.waso_min}m)`,
                        "Efficiency",
                      ]
                    }
                    return [`${value}`, name as string]
                  }}
                />
              }
            />
            <defs>
              <linearGradient id="fillEfficiency" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-chart-3)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-chart-3)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="efficiency"
              stroke="var(--color-chart-3)"
              fill="url(#fillEfficiency)"
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2 }}
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
