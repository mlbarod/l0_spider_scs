import { useRef } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { createHitHistory } from "../api/hitHistoryApi"

export function useHitHistorySave() {
  const client = useQueryClient()
  const lock = useRef(false)
  const pending = useRef(null)
  const mutation = useMutation({
    mutationFn: async ({ fields, prepareImage }) => {
      const key = JSON.stringify(fields)
      if (!pending.current || pending.current.key !== key) {
        const execDate = new Date().toISOString()
        const image = await prepareImage()
        pending.current = { key, input: { ...fields, execDate, requestId: crypto.randomUUID(), image } }
      }
      // Keep the exact image, timestamp and request ID after a lost response.
      return createHitHistory(pending.current.input)
    },
    onSuccess: () => {
      pending.current = null
      void client.invalidateQueries({ queryKey: ["hit-history"] })
      toast.success("History saved")
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => { lock.current = false },
  })
  return {
    isPending: mutation.isPending,
    save(fields, prepareImage) {
      if (lock.current) return
      lock.current = true
      mutation.mutate({ fields, prepareImage })
    },
  }
}
