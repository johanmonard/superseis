import "leaflet";

declare module "leaflet" {
  interface Map {
    pm: {
      enableGlobalEditMode(options?: { snappable?: boolean }): void;
      disableGlobalEditMode(): void;
    };
  }
}
