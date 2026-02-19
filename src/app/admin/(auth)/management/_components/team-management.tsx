"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

interface Team {
  id: string;
  tenantId: string;
  name: string;
  allowReassign?: boolean | null;
  memberIds?: string[];
  productIds?: string[];
}

export function TeamManagement() {
  const { t } = useI18n();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    allowReassign: true,
    memberIds: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch("/api/tob/admin/teams");
      const data = (await res.json()) as { ok: boolean; data: Team[] };
      if (data.ok) {
        setTeams(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch teams:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const handleCreate = () => {
    setEditingTeam(null);
    setFormData({ name: "", allowReassign: true, memberIds: "" });
    setDialogOpen(true);
  };

  const handleEdit = async (team: Team) => {
    try {
      const res = await fetch(`/api/tob/admin/teams/${team.id}`);
      const data = (await res.json()) as { ok: boolean; data: Team };
      if (data.ok) {
        const t = data.data;
        setEditingTeam(t);
        setFormData({
          name: t.name,
          allowReassign: t.allowReassign ?? true,
          memberIds: t.memberIds?.join(",") || "",
        });
        setDialogOpen(true);
      }
    } catch (error) {
      console.error("Failed to fetch team:", error);
    }
  };

  const handleDelete = (team: Team) => {
    setDeletingTeam(team);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;

    setSaving(true);
    try {
      const url = editingTeam
        ? `/api/tob/admin/teams/${editingTeam.id}`
        : "/api/tob/admin/teams";
      const method = editingTeam ? "PATCH" : "POST";

      const payload: Record<string, unknown> = {
        name: formData.name,
        allowReassign: formData.allowReassign,
      };

      if (editingTeam && formData.memberIds) {
        payload.memberIds = formData.memberIds.split(",").map((id) => id.trim()).filter(Boolean);
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setDialogOpen(false);
        fetchTeams();
      }
    } catch (error) {
      console.error("Failed to save team:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingTeam) return;

    try {
      const res = await fetch(`/api/tob/admin/teams/${deletingTeam.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setDeleteDialogOpen(false);
        setDeletingTeam(null);
        fetchTeams();
      }
    } catch (error) {
      console.error("Failed to delete team:", error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.management.tabs.teams}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t.management.tabs.teams}</CardTitle>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {t.management.teams.create}
          </Button>
        </CardHeader>
        <CardContent>
          {teams.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {t.management.noData.replace("{{type}}", t.management.tabs.teams)}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{t.management.teams.namePlaceholder}</TableHead>
                  <TableHead>{t.management.teams.allowReassign}</TableHead>
                  <TableHead className="w-24">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map((team) => (
                  <TableRow key={team.id}>
                    <TableCell className="font-mono text-xs">{team.id}</TableCell>
                    <TableCell>{team.name}</TableCell>
                    <TableCell>
                      <Badge variant={team.allowReassign ? "success" : "secondary"}>
                        {team.allowReassign ? t.common.yes : t.common.no}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(team)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(team)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTeam ? t.management.teams.edit : t.management.teams.create}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t.management.teams.namePlaceholder}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t.management.teams.namePlaceholder}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>{t.management.teams.allowReassign}</Label>
              <Switch
                checked={formData.allowReassign}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, allowReassign: checked })
                }
              />
            </div>

            {editingTeam && (
              <div className="space-y-2">
                <Label>Member IDs (comma separated)</Label>
                <Input
                  value={formData.memberIds}
                  onChange={(e) => setFormData({ ...formData, memberIds: e.target.value })}
                  placeholder="user-a,user-b"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.name.trim()}>
              {saving ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deletingTeam?.name || ""}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
