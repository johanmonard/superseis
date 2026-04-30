import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("ResourceParameters Terrain labels", () => {
  it("uses the current Camps Definition labels", () => {
    const source = readFileSync(
      join(process.cwd(), "components/features/resources/resource-parameters.tsx"),
      "utf8",
    );

    expect(source).toContain('<Field label="Map" htmlFor="camp-mapper"');
    expect(source).toContain('<Field label="POI vs Region"');
    expect(source).toContain('<Field label="POI Start" htmlFor="camp-start"');
    expect(source).toContain("<th scope=\"col\">Moving speed</th>");
    expect(source).toContain("ariaLabel={`Moving speed for ${row.layer}`}");
    expect(source).toContain("units={WORK_TIME_UNITS}");
    expect(source).toContain("units={SPEED_UNITS}");
    expect(source).toContain("w-[3.25rem]");
    expect(source).toContain("appearance-none");
    expect(source).toContain("text-[var(--color-accent)] hover:underline");
    expect(source).toContain("pl-[calc(6rem+var(--space-3))]");
    expect(source).toContain("[&_th:first-child]:pl-0");
    expect(source).toContain("[&_td:last-child]:pr-0");
  });
});
