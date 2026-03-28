import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Play } from "lucide-react"
import { useProcessing } from "../hooks/use-processing"

export function ProcessButton() {
  const { isRunning, processAll } = useProcessing()

  return (
    <Button
      onClick={() => processAll.mutate()}
      disabled={isRunning || processAll.isPending}
    >
      {isRunning ? (
        <>
          <Spinner data-icon="inline-start" />
          Processing...
        </>
      ) : (
        <>
          <Play data-icon="inline-start" />
          Process All Videos
        </>
      )}
    </Button>
  )
}
