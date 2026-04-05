"use client";

import * as React from "react";

export interface DefinitionFormData {
  client: string;
  country: string;
  epsg: string;
  second: string;
}

const REQUIRED_FIELDS: (keyof DefinitionFormData)[] = ["client", "country", "epsg", "second"];

export type DefinitionStatus = "todo" | "ongoing" | "completed";

export function getDefinitionStatus(data: DefinitionFormData): DefinitionStatus {
  const filled = REQUIRED_FIELDS.filter((k) => data[k].trim() !== "").length;
  if (filled === REQUIRED_FIELDS.length) return "completed";
  if (filled > 0) return "ongoing";
  return "todo";
}

interface DefinitionFormContextValue {
  definition: DefinitionFormData;
  setDefinitionField: <K extends keyof DefinitionFormData>(key: K, value: DefinitionFormData[K]) => void;
}

const DEFAULT_DEFINITION: DefinitionFormData = {
  client: "",
  country: "",
  epsg: "",
  second: "",
};

const DefinitionFormContext = React.createContext<DefinitionFormContextValue>({
  definition: DEFAULT_DEFINITION,
  setDefinitionField: () => {},
});

export function DefinitionFormProvider({ children }: { children: React.ReactNode }) {
  const [definition, setDefinition] = React.useState<DefinitionFormData>(DEFAULT_DEFINITION);

  const setDefinitionField = React.useCallback(
    <K extends keyof DefinitionFormData>(key: K, value: DefinitionFormData[K]) => {
      setDefinition((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const value = React.useMemo(
    () => ({ definition, setDefinitionField }),
    [definition, setDefinitionField],
  );

  return (
    <DefinitionFormContext.Provider value={value}>
      {children}
    </DefinitionFormContext.Provider>
  );
}

export function useDefinitionForm() {
  return React.useContext(DefinitionFormContext);
}
