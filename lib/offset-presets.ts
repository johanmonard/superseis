/**
 * Offset rule presets.
 *
 * Pure functions that derive a list of offset rules from project context
 * (active design attributes + side + region). The frontend calls these from
 * the Offsets UI; the shape they return matches the `OffsetRule` model in
 * `components/features/project/project-offsets.tsx` (minus the `id`,
 * which the caller assigns).
 *
 * Rule-type → saisai mapping (see `docs` / chat history for the full table):
 *
 *   - "Max crossline"   → saisai `i_range`   (value = scalar v)
 *   - "Shifted inline"  → saisai `j_range_at` (value = v, valueAt = at)
 *   - "Max radius"      → saisai `radius`    (value = scalar v)
 */

export type Side = "sources" | "receivers";

/** Subset of design attributes the Standard preset consumes. */
export interface DesignAttrs {
  sli: number;
  rli: number;
  rpi: number;
  spi: number;
}

/** Shape of a single rule returned by a preset (caller adds the id). */
export interface PresetRule {
  ruleType: "Max crossline" | "Shifted inline" | "Max radius";
  value: string;
  valueAt?: string;
}

export type PresetResult =
  | { ok: true; rules: PresetRule[]; warnings: string[] }
  | { ok: false; errors: string[] };

/**
 * "Standard" offset rules preset.
 *
 * Validation requirements:
 *   - `sli > 0` and `rli > 0` always
 *   - `rpi > 0` for sources, `spi > 0` for receivers
 *
 * Generated rules:
 *   Sources (uses sli, rpi, rli):
 *     - Max crossline, value = round(sli/2)
 *     - For step in 1..floor((sli/rpi)/2):
 *         Shifted inline, value = round(sli/2), valueAt = rpi*step
 *     - Max radius, value = round(hypot(sli/2, rli/2))
 *
 *   Receivers (uses rli, spi, sli):
 *     - Max crossline, value = round(rli/2)
 *     - For step in 1..floor((rli/spi)/2):
 *         Shifted inline, value = round(rli/2), valueAt = spi*step
 *     - Max radius, value = round(hypot(sli/2, rli/2))
 */
export function buildStandardPreset(
  side: Side,
  d: DesignAttrs,
): PresetResult {
  const errors: string[] = [];
  if (!Number.isFinite(d.sli) || d.sli <= 0) errors.push("Design is missing a valid sli.");
  if (!Number.isFinite(d.rli) || d.rli <= 0) errors.push("Design is missing a valid rli.");
  if (side === "sources" && (!Number.isFinite(d.rpi) || d.rpi <= 0)) {
    errors.push("Sources preset requires a valid rpi.");
  }
  if (side === "receivers" && (!Number.isFinite(d.spi) || d.spi <= 0)) {
    errors.push("Receivers preset requires a valid spi.");
  }
  if (errors.length > 0) return { ok: false, errors };

  const rules: PresetRule[] = [];
  const warnings: string[] = [];

  // Max radius uses both line intervals regardless of side.
  const radius = Math.round(Math.hypot(d.sli / 2, d.rli / 2));

  if (side === "sources") {
    const cross = Math.round(d.sli / 2);
    rules.push({ ruleType: "Max crossline", value: String(cross) });

    const maxStep = Math.floor((d.sli / d.rpi) / 2);
    if (maxStep < 1) {
      warnings.push(
        `No "Shifted inline" rules: floor((sli/rpi)/2) = ${maxStep} ` +
          `(sli=${d.sli}, rpi=${d.rpi}).`,
      );
    }
    for (let step = 1; step <= maxStep; step++) {
      rules.push({
        ruleType: "Shifted inline",
        value: String(cross),
        valueAt: String(d.rpi * step),
      });
    }

    rules.push({ ruleType: "Max radius", value: String(radius) });
  } else {
    const cross = Math.round(d.rli / 2);
    rules.push({ ruleType: "Max crossline", value: String(cross) });

    const maxStep = Math.floor((d.rli / d.spi) / 2);
    if (maxStep < 1) {
      warnings.push(
        `No "Shifted inline" rules: floor((rli/spi)/2) = ${maxStep} ` +
          `(rli=${d.rli}, spi=${d.spi}).`,
      );
    }
    for (let step = 1; step <= maxStep; step++) {
      rules.push({
        ruleType: "Shifted inline",
        value: String(cross),
        valueAt: String(d.spi * step),
      });
    }

    rules.push({ ruleType: "Max radius", value: String(radius) });
  }

  return { ok: true, rules, warnings };
}
