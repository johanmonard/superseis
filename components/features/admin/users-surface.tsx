"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import type { AdminUser } from "@/services/api/admin-users";
import {
  useAdminUsersList,
  useUpdateAdminUser,
} from "@/services/query/admin-users";

import { CreateUserDialog } from "./create-user-dialog";

export function UsersSurface() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const { data: users, isLoading, isError } = useAdminUsersList();
  const updateMutation = useUpdateAdminUser();
  const { toast } = useToast();

  const handleToggleActive = (user: AdminUser) => {
    updateMutation.mutate(
      { id: user.id, is_active: !user.is_active },
      {
        onSuccess: (updated) => {
          toast(
            `"${updated.email}" ${updated.is_active ? "activated" : "deactivated"}`,
            "success"
          );
        },
        onError: () => {
          toast("Failed to update user", "error");
        },
      }
    );
  };

  const columns: DataTableColumn<AdminUser>[] = [
    {
      id: "email",
      header: "Email",
      tone: "strong",
      cell: (row) => row.email,
    },
    {
      id: "role",
      header: "Role",
      cell: (row) => (
        <Badge variant="accent">
          {row.role.charAt(0).toUpperCase() + row.role.slice(1)}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <Badge variant={row.is_active ? "success" : "danger"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      id: "created",
      header: "Created",
      tone: "muted",
      cell: (row) => new Date(row.created_at).toLocaleDateString(),
    },
    {
      id: "actions",
      header: "",
      cell: (row) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleToggleActive(row)}
          disabled={updateMutation.isPending}
        >
          {row.is_active ? "Deactivate" : "Activate"}
        </Button>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-[var(--space-3)]">
        <Skeleton height="2rem" width="8rem" />
        <Skeleton height="12rem" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)]">
        Failed to load users.
      </p>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={users ?? []}
        title="Users"
        headerAction={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            New User
          </Button>
        }
        getRowId={(row) => String(row.id)}
        emptyMessage="No users yet."
      />
      <CreateUserDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
