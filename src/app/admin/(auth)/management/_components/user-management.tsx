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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Pencil, Search } from "lucide-react";
import { Role } from "@/lib/types";

interface User {
  id: string;
  email: string;
  displayName: string;
  tenantId: string;
  role: Role;
  isAgent?: boolean;
  agentLevel?: number;
  agentActive?: boolean;
  teamIds?: string[];
}

const roleLabels: Record<Role, string> = {
  [Role.SuperAdmin]: "Super Admin",
  [Role.TenantAdmin]: "Tenant Admin",
  [Role.ProductAdmin]: "Product Admin",
  [Role.TeamAdmin]: "Team Admin",
  [Role.Agent]: "Agent",
};

const roleColors: Record<Role, "default" | "secondary" | "destructive" | "outline"> = {
  [Role.SuperAdmin]: "destructive",
  [Role.TenantAdmin]: "default",
  [Role.ProductAdmin]: "secondary",
  [Role.TeamAdmin]: "outline",
  [Role.Agent]: "outline",
};

export function UserManagement() {
  const { t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    displayName: "",
    role: Role.Agent as Role,
  });
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/tob/admin/users");
      const data = (await res.json()) as { ok: boolean; data: User[] };
      if (data.ok) {
        setUsers(data.data);
        setFilteredUsers(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      setFilteredUsers(
        users.filter(
          (u) =>
            u.email.toLowerCase().includes(query) ||
            u.displayName.toLowerCase().includes(query)
        )
      );
    } else {
      setFilteredUsers(users);
    }
  }, [searchQuery, users]);

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      displayName: user.displayName,
      role: user.role,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingUser) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/tob/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: formData.displayName,
          role: formData.role,
        }),
      });

      if (res.ok) {
        setDialogOpen(false);
        fetchUsers();
      }
    } catch (error) {
      console.error("Failed to save user:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.management.tabs.users}</CardTitle>
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
          <CardTitle>{t.management.users.accounts}</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t.management.users.searchEmail}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {t.management.noData.replace("{{type}}", t.management.tabs.users)}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>{t.management.users.displayName}</TableHead>
                  <TableHead>{t.management.users.role}</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="w-16">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-mono text-xs">{user.email}</TableCell>
                    <TableCell>{user.displayName}</TableCell>
                    <TableCell>
                      <Badge variant={roleColors[user.role]}>{roleLabels[user.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      {user.isAgent ? (
                        <Badge variant={user.agentActive ? "success" : "secondary"}>
                          Lv.{user.agentLevel}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(user)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
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
            <DialogTitle>{t.management.users.editRole}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t.management.users.displayName}</Label>
              <Input
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t.management.users.role}</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value as Role })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t.management.users.selectRole} />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(Role).map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleLabels[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
