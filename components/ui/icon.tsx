import * as React from "react";
import {
  BarChart3,
  Blocks,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  Home,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Moon,
  Plane,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  User,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { cn } from "../../lib/utils";

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, "children"> {
  icon: LucideIcon;
  size?: number;
  strokeWidth?: number;
}

export function Icon({
  icon: IconComponent,
  size = 16,
  strokeWidth = 1.75,
  className,
  ...props
}: IconProps) {
  return (
    <IconComponent
      aria-hidden="true"
      focusable="false"
      size={size}
      strokeWidth={strokeWidth}
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}

// Add your app-specific icons here.
// Import from lucide-react and map them to semantic names.
export const appIcons = {
  home: Home,
  dashboards: LayoutDashboard,
  blocks: Blocks,
  barChart3: BarChart3,
  calendarDays: CalendarDays,
  listChecks: ListChecks,
  projectManagement: ClipboardList,
  workshop: Wrench,
  travel: Plane,
  tools: KeyRound,
  search: Search,
  user: User,
  settings: Settings,
  admin: ShieldCheck,
  mapPin: MapPin,
  sun: Sun,
  moon: Moon,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  refresh: RefreshCw,
  download: Download,
} as const;

export type AppIconKey = keyof typeof appIcons;
