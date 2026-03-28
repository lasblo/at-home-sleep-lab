import { useMemo } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Lightbulb,
  TrendingDown,
  TrendingUp,
  Moon,
  Heart,
  Activity,
} from "lucide-react"
import type { DashboardStats } from "../hooks/use-dashboard"

interface Insight {
  icon: React.ReactNode
  title: string
  body: string
  tone: "positive" | "neutral" | "attention"
}

function generateInsights(stats: DashboardStats): Insight[] {
  const insights: Insight[] = []
  const severity =
    stats.meanPLMI < 5
      ? "normal"
      : stats.meanPLMI < 15
        ? "mild"
        : stats.meanPLMI < 25
          ? "moderate"
          : "severe"

  // Primary PLMI insight
  if (severity === "normal") {
    insights.push({
      icon: <Moon className="size-4" />,
      title: "Leg movements look good",
      body: `Your average PLMI of ${stats.meanPLMI.toFixed(1)} is in the normal range (under 5). This means your legs are relatively still during sleep — a healthy sign.`,
      tone: "positive",
    })
  } else if (severity === "mild") {
    insights.push({
      icon: <Activity className="size-4" />,
      title: "Mild leg movement activity",
      body: `Your average PLMI is ${stats.meanPLMI.toFixed(1)}, which falls in the mild range (5–15). Some periodic leg movements during sleep are common, especially with age. Worth monitoring over time.`,
      tone: "neutral",
    })
  } else if (severity === "moderate") {
    insights.push({
      icon: <Activity className="size-4" />,
      title: "Moderate leg movement activity",
      body: `Your average PLMI of ${stats.meanPLMI.toFixed(1)} is in the moderate range (15–25). This level of periodic limb movements may be disrupting your sleep quality. Consider discussing with a sleep specialist.`,
      tone: "attention",
    })
  } else {
    insights.push({
      icon: <Activity className="size-4" />,
      title: "Significant leg movement activity",
      body: `Your average PLMI of ${stats.meanPLMI.toFixed(1)} is in the severe range (25+). Frequent limb movements like this often fragment sleep significantly. It's worth bringing this data to a doctor.`,
      tone: "attention",
    })
  }

  // Trend insight
  if (stats.plmiTrend != null) {
    if (stats.plmiTrend < -2) {
      insights.push({
        icon: <TrendingDown className="size-4" />,
        title: "Improving trend",
        body: `Your PLMI has decreased by ${Math.abs(stats.plmiTrend).toFixed(1)} points recently compared to earlier nights. Whatever you're doing, it seems to be helping.`,
        tone: "positive",
      })
    } else if (stats.plmiTrend > 2) {
      insights.push({
        icon: <TrendingUp className="size-4" />,
        title: "Upward trend noticed",
        body: `Your PLMI has increased by ${stats.plmiTrend.toFixed(1)} points in recent nights. This could be temporary — keep tracking to see if the pattern continues.`,
        tone: "attention",
      })
    }
  }

  // Arousal insight
  if (stats.hasArousalData && stats.meanArousalPct != null) {
    if (stats.meanArousalPct > 30) {
      insights.push({
        icon: <Activity className="size-4" />,
        title: "Leg movements are waking you up",
        body: `About ${stats.meanArousalPct.toFixed(0)}% of your periodic limb movements cause brief arousals (micro-awakenings). This means they're actively disrupting your sleep, even if you don't remember waking.`,
        tone: "attention",
      })
    } else if (stats.meanArousalPct < 15) {
      insights.push({
        icon: <Moon className="size-4" />,
        title: "Low arousal impact",
        body: `Only ${stats.meanArousalPct.toFixed(0)}% of limb movements cause arousals. While you do have some leg movement, most of it isn't waking you up — which is the more important metric.`,
        tone: "positive",
      })
    }
  }

  // HR insight
  if (stats.hasHRStats && stats.avgSleepingHR != null) {
    if (stats.avgHRDip != null && stats.avgHRDip >= 10) {
      insights.push({
        icon: <Heart className="size-4" />,
        title: "Healthy heart rate dip",
        body: `Your heart rate drops ${stats.avgHRDip}% during sleep (to ~${stats.avgSleepingHR} bpm). A dip of 10%+ is called a "dipper" pattern and is associated with good cardiovascular health.`,
        tone: "positive",
      })
    } else if (stats.avgHRDip != null && stats.avgHRDip < 5) {
      insights.push({
        icon: <Heart className="size-4" />,
        title: "Minimal heart rate dip",
        body: `Your heart rate only drops ${stats.avgHRDip}% during sleep. Ideally, it should dip at least 10%. A "non-dipper" pattern can indicate stress, poor sleep depth, or other factors worth discussing with your doctor.`,
        tone: "attention",
      })
    }
  }

  // Sleep efficiency
  if (stats.hasSleepQuality && stats.avgEfficiency != null) {
    if (stats.avgEfficiency >= 85) {
      insights.push({
        icon: <Moon className="size-4" />,
        title: "Good sleep efficiency",
        body: `You're sleeping ${stats.avgEfficiency}% of the time you're in bed. Above 85% is considered healthy — you're spending your time in bed actually sleeping, not tossing and turning.`,
        tone: "positive",
      })
    } else if (stats.avgEfficiency < 75) {
      insights.push({
        icon: <Moon className="size-4" />,
        title: "Low sleep efficiency",
        body: `Your sleep efficiency is ${stats.avgEfficiency}%, meaning you're awake for a significant portion of your time in bed. This could be due to leg movements, anxiety, or habits like phone use in bed.`,
        tone: "attention",
      })
    }
  }

  return insights.slice(0, 3)
}

const toneBadge: Record<Insight["tone"], { label: string; className: string }> =
  {
    positive: {
      label: "Looking good",
      className: "bg-severity-normal/15 text-severity-normal",
    },
    neutral: {
      label: "Worth noting",
      className: "bg-severity-mild/15 text-severity-mild",
    },
    attention: {
      label: "Pay attention",
      className: "bg-severity-moderate/15 text-severity-moderate",
    },
  }

export function SleepInsight({ stats }: { stats: DashboardStats }) {
  const insights = useMemo(() => generateInsights(stats), [stats])

  if (insights.length === 0) return null

  return (
    <Card className="border-primary/15 bg-gradient-to-br from-primary/[0.03] to-transparent">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Lightbulb className="size-4" />
          </div>
          <div>
            <CardTitle className="text-sm">Sleep Insights</CardTitle>
            <CardDescription>
              What your {stats.nightCount} nights of data tell us
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {insights.map((insight, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-lg border bg-card/50 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{insight.icon}</span>
                  <span className="text-sm font-medium">{insight.title}</span>
                </div>
                <Badge
                  variant="secondary"
                  className={`shrink-0 text-[10px] ${toneBadge[insight.tone].className}`}
                >
                  {toneBadge[insight.tone].label}
                </Badge>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {insight.body}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
