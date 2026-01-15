import { ChangeEvent } from 'react';
import { Button, Input, Textarea, Sheet, SheetContent, SheetHeader, SheetTitle, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@onfire/ui';

interface Props {
  openAssign: boolean;
  setOpenAssign: (v: boolean) => void;
  openClose: boolean;
  setOpenClose: (v: boolean) => void;
  bulkAssignee: string;
  setBulkAssignee: (v: string) => void;
  bulkReason: string;
  setBulkReason: (v: string) => void;
  selectedIds: Set<string>;
  onBulkAssign: () => Promise<void>;
  onBulkClose: () => Promise<void>;
  canAssign: boolean;
  canClose: boolean;
}

export function BulkActions({
  openAssign,
  setOpenAssign,
  openClose,
  setOpenClose,
  bulkAssignee,
  setBulkAssignee,
  bulkReason,
  setBulkReason,
  selectedIds,
  onBulkAssign,
  onBulkClose,
  canAssign,
  canClose
}: Props) {
  return (
    <>
      <Sheet open={openAssign} onOpenChange={setOpenAssign}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>批量指派</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 pb-4">
            <div className="text-sm text-muted-foreground">已选 {selectedIds.size} 条工单</div>
            <Input placeholder="指派给坐席 ID" value={bulkAssignee} onChange={(e: ChangeEvent<HTMLInputElement>) => setBulkAssignee(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpenAssign(false)}>
                取消
              </Button>
              <Button size="sm" onClick={onBulkAssign} disabled={!bulkAssignee || !canAssign}>
                确认指派
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={openClose} onOpenChange={setOpenClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量关闭工单</DialogTitle>
            <DialogDescription>将关闭已选的 {selectedIds.size} 条工单，请填写关闭原因。</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="关闭原因" value={bulkReason} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBulkReason(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenClose(false)}>
              取消
            </Button>
            <Button variant="outline" onClick={onBulkClose} disabled={selectedIds.size === 0 || !canClose}>
              确认关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

