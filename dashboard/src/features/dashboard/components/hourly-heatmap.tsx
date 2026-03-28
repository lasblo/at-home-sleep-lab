import { useMemo } from "react"
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
import type { Night } from "@/shared/types/api"

const chartConfig = {
  avgPLM: {
    label: "Avg PLMs",
    color: "var(--color-chart-1)",
  },
} satisfies ChartConfig

interface HourlyHeatmapProps {
  nights: Night[]
}

export function HourlyHeatmap({ nights }: HourlyHeatmapProps) {
  const scored = nights.filter((n) => n.summary)

  const hourlyAgg = useMemo(() => {
    const maxHours = Math.max(
      ...scored.map((n) => (n.hourly_distribution || []).length),
      0
    )
    const agg = []
    for (let h = 0; h < maxHours; h++) {
      let totalPLM = 0
      let count = 0
      for (const n of scored) {
        const hd = n.hourly_distribution || []
        if (h < hd.length) {
          totalPLM += hd[h].plm_count
          count++
        }
      }
      agg.push({
        hour: `${h + 1}h`,
        avgPLM: count > 0 ? totalPLM / count : 0,
      })
    }
    return agg
  }, [scored])

  if (hourlyAgg.length === 0) return null

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle className="text-sm">
          Average PLM Activity by Hour of Night
        </CardTitle>
        <CardDescription>
          Averaged across {scored.length} nights
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[100px] w-full">
          <BarChart data={hourlyAgg}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="hour"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              width={24}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => [
                    `${(value as number).toFixed(1)}`,
                    "Avg PLMs",
                  ]}
                />
              }
            />
            <Bar
              dataKey="avgPLM"
              fill="var(--color-chart-1)"
              radius={[3, 3, 0, 0]}
              opacity={0.7}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
