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
import { useCreateActivity } from "@/services/query/activities";

export function CreateActivityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = React.useState("");
  const { toast } = useToast();
  const router = useRouter();
  const createMutation = useCreateActivity();

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    createMutation.mutate(
      { name: trimmed },
      {
        onSuccess: (activity) => {
          toast(`"${activity.name}" created`, "success");
          setName("");
          onOpenChange(false);
          router.push(`/project/activities/${activity.slug}`);
        },
        onError: () => {
          toast("Failed to create activity", "error");
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
        <DialogTitle>New Activity</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <Field label="Activity name" htmlFor="activity-name">
          <Input
            id="activity-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Field Ops"
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
