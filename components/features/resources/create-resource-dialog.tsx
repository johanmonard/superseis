"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

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
import { useCreateResource } from "@/services/query/resources";

export function CreateResourceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = React.useState("");
  const { toast } = useToast();
  const router = useRouter();
  const createMutation = useCreateResource();

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    createMutation.mutate(
      { name: trimmed },
      {
        onSuccess: (resource) => {
          toast(`"${resource.name}" created`, "success");
          setName("");
          onOpenChange(false);
          router.push(`/project/resources/${resource.slug}`);
        },
        onError: () => {
          toast("Failed to create resource", "error");
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>New Resource</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <Field label="Resource name" htmlFor="resource-name">
          <Input
            id="resource-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Vibrator Fleet"
            disabled={createMutation.isPending}
            autoFocus
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onOpenChange(false)}
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
