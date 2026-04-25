import type { Metadata } from "next";
import type { ReactNode } from "react";

import "../styles/tokens.css";
import "../styles/globals.css";

import { AppProviders } from "@/components/providers/app-providers";
import { appConfig } from "@/config/app.config";
import {
  DEFAULT_THEME_PREFERENCES,
  THEME_REGISTRY,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

const themeKindById = Object.fromEntries(
  THEME_REGISTRY.map((t) => [t.id, t.kind])
);
const defaultDef = THEME_REGISTRY.find((t) => t.id === DEFAULT_THEME_PREFERENCES.mode);

const themeRestoreScript = `
(function(){
  try {
    var p = JSON.parse(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) || "{}");
    var h = document.documentElement;
    var kinds = ${JSON.stringify(themeKindById)};
    var mode = Object.prototype.hasOwnProperty.call(kinds, p.mode) ? p.mode : ${JSON.stringify(DEFAULT_THEME_PREFERENCES.mode)};
    h.setAttribute("data-theme", mode);
    h.setAttribute("data-theme-kind", kinds[mode]);
    h.setAttribute("data-density", ${JSON.stringify(DEFAULT_THEME_PREFERENCES.density)});
  } catch(e) {}
})();
`;

export const metadata: Metadata = {
  title: {
    default: appConfig.name,
    template: `%s | ${appConfig.name}`,
  },
  description: appConfig.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={DEFAULT_THEME_PREFERENCES.mode}
      data-theme-kind={defaultDef?.kind ?? "light"}
      data-density={DEFAULT_THEME_PREFERENCES.density}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeRestoreScript }} />
      </head>
      <body className="app-scrollbar">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
