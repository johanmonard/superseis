export function parseUnitValue(
  raw: string | undefined,
  fallbackUnit: string,
  allowedUnits: readonly string[],
) {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { value: "", unit: fallbackUnit };

  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const unit = parts[parts.length - 1];
    return {
      value: parts.slice(0, -1).join(" "),
      unit: allowedUnits.includes(unit) ? unit : fallbackUnit,
    };
  }

  return { value: parts[0], unit: fallbackUnit };
}

export function formatUnitValue(value: string, unit: string) {
  const trimmed = value.trim();
  return trimmed ? `${trimmed} ${unit}` : "";
}
