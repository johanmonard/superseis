export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | { [key: string]: boolean | null | undefined };

function toClassName(input: ClassValue): string {
  if (!input) {
    return "";
  }

  if (typeof input === "string" || typeof input === "number") {
    return String(input);
  }

  if (Array.isArray(input)) {
    return input.map(toClassName).filter(Boolean).join(" ");
  }

  if (typeof input === "object") {
    return Object.entries(input)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([className]) => className)
      .join(" ");
  }

  return "";
}

export function cn(...inputs: ClassValue[]): string {
  return inputs.map(toClassName).filter(Boolean).join(" ").trim();
}
