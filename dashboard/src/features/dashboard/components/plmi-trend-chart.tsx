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
import type { ChartDataPoint } from "../hooks/use-dashboard-stats"
import { useNavigate } from "react-router-dom"

const chartConfig = {
  plmi: {
    label: "PLMI",
    color: "var(--color-chart-1)",
  },
} satisfies ChartConfig

interface PlmiTrendChartProps {
  data: ChartDataPoint[]
}

export function PlmiTrendChart({ data }: PlmiTrendChartProps) {
  const navigate = useNavigate()

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>PLMI Trend</CardTitle>
        <CardDescription>Periodic Limb Movement Index over time</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[220px] w-full">
          <AreaChart
            data={data}
            onClick={(state) => {
              if (state?.activePayload?.[0]?.payload?.date) {
                navigate(`/nights/${state.activePayload[0].payload.date}`)
              }
            }}
          >
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
            />
            <ReferenceLine
              y={5}
              stroke="var(--color-severity-normal)"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              label={{ value: "Normal", position: "insideTopLeft", fontSize: 10, fill: "var(--color-muted-foreground)" }}
            />
            <ReferenceLine
              y={15}
              stroke="var(--color-severity-mild)"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              label={{ value: "Mild", position: "insideTopLeft", fontSize: 10, fill: "var(--color-muted-foreground)" }}
            />
            <ReferenceLine
              y={25}
              stroke="var(--color-severity-moderate)"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              label={{ value: "Moderate", position: "insideTopLeft", fontSize: 10, fill: "var(--color-muted-foreground)" }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(v) => formatDate(v as string)}
                  formatter={(value) => [
                    `${(value as number).toFixed(1)}`,
                    "PLMI",
                  ]}
                />
              }
            />
            <defs>
              <linearGradient id="fillPlmi" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-chart-1)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-chart-1)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="plmi"
              stroke="var(--color-chart-1)"
              fill="url(#fillPlmi)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
