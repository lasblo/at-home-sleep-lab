import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
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

interface MetricChartProps {
  title: string
  description?: string
  data: ChartDataPoint[]
  dataKey: keyof ChartDataPoint
  color: string
  type?: "area" | "bar"
  formatValue?: (v: number) => string
  className?: string
}

export function MetricChart({
  title,
  description,
  data,
  dataKey,
  color,
  type = "area",
  formatValue,
  className,
}: MetricChartProps) {
  const navigate = useNavigate()
  const gradientId = `fill-${String(dataKey)}`

  const config = {
    [dataKey]: {
      label: title,
      color,
    },
  } satisfies ChartConfig

  const handleClick = (state: { activePayload?: Array<{ payload: ChartDataPoint }> } | null) => {
    if (state?.activePayload?.[0]?.payload?.date) {
      navigate(`/nights/${state.activePayload[0].payload.date}`)
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[140px] w-full">
          {type === "bar" ? (
            <BarChart data={data} onClick={handleClick}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatDate(v).replace(/,.*/, "")}
                tick={{ fontSize: 10 }}
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={28} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(v) => formatDate(v as string)}
                    formatter={(value) => [
                      formatValue
                        ? formatValue(value as number)
                        : `${(value as number).toFixed(1)}`,
                      title,
                    ]}
                  />
                }
              />
              <Bar
                dataKey={String(dataKey)}
                fill={color}
                radius={[3, 3, 0, 0]}
                opacity={0.8}
              />
            </BarChart>
          ) : (
            <AreaChart data={data} onClick={handleClick}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatDate(v).replace(/,.*/, "")}
                tick={{ fontSize: 10 }}
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={28} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(v) => formatDate(v as string)}
                    formatter={(value) => [
                      formatValue
                        ? formatValue(value as number)
                        : `${(value as number).toFixed(1)}`,
                      title,
                    ]}
                  />
                }
              />
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey={String(dataKey)}
                stroke={color}
                fill={`url(#${gradientId})`}
                strokeWidth={2}
              />
            </AreaChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
