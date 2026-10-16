import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function HistorySavedDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>History saved</DialogTitle>
          <DialogDescription>The chart and its image have been saved. You can view them on the Saved History Board.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">OK</Button></DialogClose>
          <Button asChild><Link to="/history" onClick={() => onOpenChange(false)}>Go to Saved History Board</Link></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
