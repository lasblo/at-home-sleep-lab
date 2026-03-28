import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { AlertTriangle, SearchX, ArrowLeft } from "lucide-react"

interface NotFoundProps {
  title?: string
  description?: string
  backTo?: string
  backLabel?: string
}

export function NotFound({
  title = "Not found",
  description = "The page you're looking for doesn't exist or has been removed.",
  backTo = "/",
  backLabel = "Go back",
}: NotFoundProps) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-6 p-6">
      <Empty className="min-h-[400px]">
        <EmptyMedia variant="icon">
          <SearchX />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onClick={() => navigate(backTo)}>
          <ArrowLeft data-icon="inline-start" />
          {backLabel}
        </Button>
      </Empty>
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  description?: string
  retry?: () => void
}

export function ErrorState({
  title = "Something went wrong",
  description = "An error occurred while loading this page.",
  retry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Empty className="min-h-[400px]">
        <EmptyMedia variant="icon">
          <AlertTriangle />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {retry && (
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        )}
      </Empty>
    </div>
  )
}
