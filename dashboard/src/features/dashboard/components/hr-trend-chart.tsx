import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts"
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
  sleeping_hr: {
    label: "Sleeping HR",
    color: "var(--color-chart-2)",
  },
  avg_hr: {
    label: "Avg HR",
    color: "var(--color-chart-4)",
  },
} satisfies ChartConfig

interface HRTrendChartProps {
  sessions: DashboardSession[]
}

export function HRTrendChart({ sessions }: HRTrendChartProps) {
  const data = sessions
    .filter((s) => s.hr_stats?.sleeping_hr != null)
    .map((s) => ({
      date: s.night_date,
      sleeping_hr: s.hr_stats!.sleeping_hr,
      avg_hr: s.hr_stats!.avg_hr,
      dip_pct: s.hr_stats!.dip_pct,
    }))

  if (data.length === 0) return null

  const allHR = data.flatMap((d) => [d.sleeping_hr!, d.avg_hr])
  const yMin = Math.floor(Math.min(...allHR) / 5) * 5 - 5
  const yMax = Math.ceil(Math.max(...allHR) / 5) * 5 + 5

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Nightly Heart Rate</CardTitle>
        <CardDescription>
          Sleeping HR (lowest 5-min median) and average HR
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
              domain={[yMin, yMax]}
              tickFormatter={(v) => `${v}`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(v) => formatDate(v as string)}
                  formatter={(value, name) => {
                    const labels: Record<string, string> = {
                      sleeping_hr: "Sleeping HR",
                      avg_hr: "Avg HR",
                    }
                    return [
                      `${Math.round(value as number)} bpm`,
                      labels[name as string] ?? name,
                    ]
                  }}
                />
              }
            />
            <defs>
              <linearGradient id="fillSleepHR" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-chart-2)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-chart-2)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="sleeping_hr"
              stroke="var(--color-chart-2)"
              fill="url(#fillSleepHR)"
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="avg_hr"
              stroke="var(--color-chart-4)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
