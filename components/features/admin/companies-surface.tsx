"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import type { Company } from "@/services/api/admin-companies";
import {
  useCompaniesList,
  useUpdateCompany,
} from "@/services/query/admin-companies";

import { CreateCompanyDialog } from "./create-company-dialog";

export function CompaniesSurface() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const { data: companies, isLoading, isError } = useCompaniesList();
  const updateMutation = useUpdateCompany();
  const { toast } = useToast();

  const handleToggleActive = (company: Company) => {
    updateMutation.mutate(
      { id: company.id, is_active: !company.is_active },
      {
        onSuccess: (updated) => {
          toast(
            `"${updated.name}" ${updated.is_active ? "activated" : "deactivated"}`,
            "success"
          );
        },
        onError: () => {
          toast("Failed to update company", "error");
        },
      }
    );
  };

  const columns: DataTableColumn<Company>[] = [
    {
      id: "name",
      header: "Name",
      tone: "strong",
      cell: (row) => row.name,
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
      id: "max_users",
      header: "Max Users",
      align: "right",
      cell: (row) => row.max_users,
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
        Failed to load companies.
      </p>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={companies ?? []}
        title="Companies"
        headerAction={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            New Company
          </Button>
        }
        getRowId={(row) => String(row.id)}
        emptyMessage="No companies yet."
      />
      <CreateCompanyDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
