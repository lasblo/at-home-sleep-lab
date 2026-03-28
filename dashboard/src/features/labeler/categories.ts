export interface Category {
  key: string
  label: string
  shortcut: string
  color: string
}

export const CATEGORIES: Category[] = [
  { key: "leg", label: "Leg", shortcut: "1", color: "#3b82f6" },
  { key: "arm", label: "Arm", shortcut: "2", color: "#f59e0b" },
  { key: "head", label: "Head", shortcut: "3", color: "#8b5cf6" },
  { key: "body", label: "Body", shortcut: "4", color: "#ef4444" },
  { key: "respiratory", label: "Respiratory", shortcut: "5", color: "#06b6d4" },
  { key: "arousal", label: "Arousal", shortcut: "6", color: "#ec4899" },
  { key: "artifact", label: "Artifact", shortcut: "7", color: "#6b7280" },
]
