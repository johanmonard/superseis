import { describe, expect, it } from "vitest";

import { formatUnitValue, parseUnitValue } from "@/components/features/resources/resource-units";

describe("resource unit value helpers", () => {
  it("parses OCFA value/unit strings and falls back when the unit is missing", () => {
    expect(parseUnitValue("12 mn", "s", ["s", "mn", "h", "d"])).toEqual({
      value: "12",
      unit: "mn",
    });
    expect(parseUnitValue("4.5", "kmph", ["kmph", "kts"])).toEqual({
      value: "4.5",
      unit: "kmph",
    });
  });

  it("formats empty values as empty strings and non-empty values with units", () => {
    expect(formatUnitValue("", "h")).toBe("");
    expect(formatUnitValue(" 3.5 ", "kts")).toBe("3.5 kts");
  });
});
