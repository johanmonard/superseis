"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useCreateCompany } from "@/services/query/admin-companies";

export function CreateCompanyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = React.useState("");
  const [maxUsers, setMaxUsers] = React.useState("5");
  const { toast } = useToast();
  const createMutation = useCreateCompany();

  const resetForm = () => {
    setName("");
    setMaxUsers("5");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    createMutation.mutate(
      { name: trimmed, max_users: Number(maxUsers) || 5 },
      {
        onSuccess: (company) => {
          toast(`"${company.name}" created`, "success");
          resetForm();
          onOpenChange(false);
        },
        onError: () => {
          toast("Failed to create company", "error");
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreate();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogHeader>
        <DialogTitle>New Company</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-[var(--space-4)]">
          <Field label="Company name" htmlFor="company-name">
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Acme Corp"
              disabled={createMutation.isPending}
              autoFocus
            />
          </Field>
          <Field label="Max users" htmlFor="company-max-users">
            <Input
              id="company-max-users"
              type="number"
              min={1}
              value={maxUsers}
              onChange={(e) => setMaxUsers(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={createMutation.isPending}
            />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleOpenChange(false)}
          disabled={createMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={!name.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? "Creating..." : "Create"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
