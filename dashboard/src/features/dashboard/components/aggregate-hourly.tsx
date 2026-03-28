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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { AggregateHourly } from "@/shared/types/api"

const chartConfig = {
  avg_plm: {
    label: "Avg PLMs",
    color: "var(--color-chart-1)",
  },
  avg_body: {
    label: "Avg Body",
    color: "var(--color-chart-2)",
  },
} satisfies ChartConfig

interface AggregateHourlyChartProps {
  data: AggregateHourly[]
  nightCount: number
}

export function AggregateHourlyChart({
  data,
  nightCount,
}: AggregateHourlyChartProps) {
  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">PLM Activity by Hour</CardTitle>
        <CardDescription>
          Averaged across {nightCount} night{nightCount !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[120px] w-full">
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
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => [
                    `${(value as number).toFixed(1)}`,
                    name === "avg_plm" ? "Avg PLMs" : "Avg Body",
                  ]}
                />
              }
            />
            <Bar
              dataKey="avg_body"
              stackId="a"
              fill="var(--color-chart-2)"
              radius={[0, 0, 0, 0]}
              opacity={0.6}
            />
            <Bar
              dataKey="avg_plm"
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
