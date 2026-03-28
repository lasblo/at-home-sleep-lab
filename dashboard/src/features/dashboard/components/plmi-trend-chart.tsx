import { useNavigate } from "react-router-dom"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
  Dot,
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
  plmi: {
    label: "PLMI",
    color: "var(--color-chart-1)",
  },
} satisfies ChartConfig

interface PlmiTrendChartProps {
  sessions: DashboardSession[]
}

export function PlmiTrendChart({ sessions }: PlmiTrendChartProps) {
  const navigate = useNavigate()

  const data = sessions.map((s) => ({
    date: s.night_date,
    plmi: s.plmi,
    sessionId: s.session_id,
  }))

  const maxPlmi = Math.max(...data.map((d) => d.plmi), 30)
  const yMax = Math.ceil(maxPlmi / 5) * 5 + 5

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">PLMI Trend</CardTitle>
        <CardDescription>
          Periodic Limb Movement Index over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <AreaChart
            data={data}
            onClick={(state) => {
              const sid = state?.activePayload?.[0]?.payload?.sessionId
              if (sid) navigate(`/sessions/${sid}`)
            }}
          >
            {/* Severity bands */}
            <ReferenceArea
              y1={0}
              y2={5}
              fill="var(--color-severity-normal)"
              fillOpacity={0.06}
            />
            <ReferenceArea
              y1={5}
              y2={15}
              fill="var(--color-severity-mild)"
              fillOpacity={0.06}
            />
            <ReferenceArea
              y1={15}
              y2={25}
              fill="var(--color-severity-moderate)"
              fillOpacity={0.06}
            />
            <ReferenceArea
              y1={25}
              y2={yMax}
              fill="var(--color-severity-severe)"
              fillOpacity={0.06}
            />

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
              domain={[0, yMax]}
            />
            <ReferenceLine
              y={5}
              stroke="var(--color-severity-normal)"
              strokeDasharray="3 3"
              strokeOpacity={0.4}
            />
            <ReferenceLine
              y={15}
              stroke="var(--color-severity-mild)"
              strokeDasharray="3 3"
              strokeOpacity={0.4}
            />
            <ReferenceLine
              y={25}
              stroke="var(--color-severity-moderate)"
              strokeDasharray="3 3"
              strokeOpacity={0.4}
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
              dot={{ r: 4, strokeWidth: 2 }}
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
