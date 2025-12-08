import { ChangeEvent } from 'react';
import { Button, Input, Textarea } from '@onfire/ui';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerCloseButton } from './ui/drawer';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogCloseButton } from './ui/dialog';

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
      <Drawer open={openAssign} onOpenChange={setOpenAssign}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>批量指派</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-3 px-4 pb-4">
            <div className="text-sm text-zinc-600">已选 {selectedIds.size} 条工单</div>
            <Input placeholder="指派给坐席 ID" value={bulkAssignee} onChange={(e: ChangeEvent<HTMLInputElement>) => setBulkAssignee(e.target.value)} />
            <div className="flex justify-end gap-2">
              <DrawerCloseButton />
              <Button size="sm" onClick={onBulkAssign} disabled={!bulkAssignee || !canAssign}>
                确认指派
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <Dialog open={openClose} onOpenChange={setOpenClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量关闭工单</DialogTitle>
            <DialogDescription>将关闭已选的 {selectedIds.size} 条工单，请填写关闭原因。</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="关闭原因" value={bulkReason} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBulkReason(e.target.value)} rows={3} />
          <DialogFooter>
            <DialogCloseButton />
            <Button variant="outline" onClick={onBulkClose} disabled={selectedIds.size === 0 || !canClose}>
              确认关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

