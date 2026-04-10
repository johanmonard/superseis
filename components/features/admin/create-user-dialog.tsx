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
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useCompaniesList } from "@/services/query/admin-companies";
import { useCreateAdminUser } from "@/services/query/admin-users";

const ROLES = ["viewer", "member", "admin", "owner"] as const;

export function CreateUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [companyId, setCompanyId] = React.useState("");
  const [role, setRole] = React.useState("member");
  const { toast } = useToast();
  const createMutation = useCreateAdminUser();
  const { data: companies } = useCompaniesList();

  const activeCompanies = React.useMemo(
    () => (companies ?? []).filter((c) => c.is_active),
    [companies]
  );

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setCompanyId("");
    setRole("member");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const canSubmit =
    email.trim() && password.trim() && companyId && !createMutation.isPending;

  const handleCreate = () => {
    if (!canSubmit) return;

    createMutation.mutate(
      {
        email: email.trim(),
        password: password.trim(),
        company_id: Number(companyId),
        role,
      },
      {
        onSuccess: (user) => {
          toast(`User "${user.email}" created`, "success");
          resetForm();
          onOpenChange(false);
        },
        onError: () => {
          toast("Failed to create user", "error");
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
        <DialogTitle>New User</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-[var(--space-4)]">
          <Field label="Email" htmlFor="user-email">
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="user@example.com"
              disabled={createMutation.isPending}
              autoFocus
            />
          </Field>
          <Field label="Password" htmlFor="user-password">
            <Input
              id="user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Minimum 8 characters"
              disabled={createMutation.isPending}
            />
          </Field>
          <Field label="Company" htmlFor="user-company">
            <Select
              id="user-company"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              disabled={createMutation.isPending}
            >
              <option value="" disabled>
                Select a company
              </option>
              {activeCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Role" htmlFor="user-role">
            <Select
              id="user-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={createMutation.isPending}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </Select>
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
          disabled={!canSubmit}
        >
          {createMutation.isPending ? "Creating..." : "Create"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
