import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { HourlyBucket } from "@/shared/types/api"

const chartConfig = {
  plm_count: {
    label: "PLMs",
    color: "var(--color-chart-1)",
  },
  other: {
    label: "Other",
    color: "var(--color-chart-2)",
  },
} satisfies ChartConfig

interface HourlyChartProps {
  hourly: HourlyBucket[]
}

export function HourlyChart({ hourly }: HourlyChartProps) {
  const data = hourly.map((b) => ({
    ...b,
    other: b.other_count + b.body_count,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Hourly Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              width={28}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="other"
              stackId="a"
              fill="var(--color-chart-2)"
              radius={[0, 0, 0, 0]}
              opacity={0.6}
            />
            <Bar
              dataKey="plm_count"
              stackId="a"
              fill="var(--color-chart-1)"
              radius={[3, 3, 0, 0]}
              opacity={0.8}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
