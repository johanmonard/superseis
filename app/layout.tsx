import type { Metadata } from "next";
import type { ReactNode } from "react";

import "../styles/tokens.css";
import "../styles/globals.css";

import { AppProviders } from "@/components/providers/app-providers";
import { appConfig } from "@/config/app.config";
import {
  DEFAULT_THEME_PREFERENCES,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

const themeRestoreScript = `
(function(){
  try {
    var p = JSON.parse(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) || "{}");
    var h = document.documentElement;
    h.setAttribute("data-theme", p.mode === "dark" ? "dark" : "light");
    h.setAttribute(
      "data-density",
      p.density === "comfortable" || p.density === "dense" ? p.density : "compact"
    );
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
