import { describe, expect, it } from "vitest";

import { buildResourceMapRows } from "@/components/features/resources/resource-maps";

describe("buildResourceMapRows", () => {
  it("uses the unique union of travel-map, moving-map, and motion-allocated resource layers", () => {
    const rows = buildResourceMapRows({
      resourceName: "Bulldozer",
      maps: [
        { id: "travel", name: "Travel Routes", layers: ["Roads", "Cutlines"] },
        { id: "moving", name: "Moving Surface", layers: ["Mud", "Roads"] },
      ],
      movingMapName: "Moving Surface",
      travelMapName: "Travel Routes",
      crewSection: {
        options: [
          {
            id: "crew-1",
            name: "Crew Option",
            activities: [
              {
                id: "activity-1",
                name: "Clear",
                resources: [{ id: "resource-1", name: "Bulldozer" }],
              },
              {
                id: "activity-2",
                name: "Survey",
                resources: [{ id: "resource-2", name: "Surveyor" }],
              },
            ],
          },
        ],
        activeId: "crew-1",
      },
      motionCells: {
        "Forest|activity-1|resource-1": true,
        "Roads|activity-1|resource-1": true,
        "Mud|activity-2|resource-2": true,
      },
    });

    expect(rows).toEqual([
      {
        layer: "Roads",
        canEditWorkTime: true,
        canEditMoveSpeed: true,
        canEditTravelSpeed: true,
      },
      {
        layer: "Cutlines",
        canEditWorkTime: false,
        canEditMoveSpeed: false,
        canEditTravelSpeed: true,
      },
      {
        layer: "Mud",
        canEditWorkTime: false,
        canEditMoveSpeed: true,
        canEditTravelSpeed: false,
      },
      {
        layer: "Forest",
        canEditWorkTime: true,
        canEditMoveSpeed: false,
        canEditTravelSpeed: false,
      },
    ]);
  });
});
