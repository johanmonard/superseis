import * as React from "react";
import {
  Activity,
  BarChart3,
  Blocks,
  Braces,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Compass,
  Download,
  FolderOpen,
  Grid3x3,
  GripVertical,
  Home,
  KeyRound,
  Layers,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Map,
  MapPin,
  Minus,
  Moon,
  Mountain,
  Pencil,
  Plus,
  Plane,
  RefreshCw,
  Rows3,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sliders,
  Sun,
  Trash2,
  Upload,
  User,
  Users,
  Wrench,
  X,
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
  activity: Activity,
  braces: Braces,
  home: Home,
  dashboards: LayoutDashboard,
  blocks: Blocks,
  barChart3: BarChart3,
  calendarDays: CalendarDays,
  check: Check,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  compass: Compass,
  download: Download,
  folderOpen: FolderOpen,
  grid: Grid3x3,
  gripVertical: GripVertical,
  layers: Layers,
  listChecks: ListChecks,
  logOut: LogOut,
  map: Map,
  mapPin: MapPin,
  minus: Minus,
  moon: Moon,
  mountain: Mountain,
  pencil: Pencil,
  plus: Plus,
  projectManagement: ClipboardList,
  refresh: RefreshCw,
  rows3: Rows3,
  save: Save,
  search: Search,
  settings: Settings,
  admin: ShieldCheck,
  sliders: Sliders,
  sun: Sun,
  tools: KeyRound,
  trash: Trash2,
  travel: Plane,
  upload: Upload,
  user: User,
  users: Users,
  workshop: Wrench,
  x: X,
} as const;

export type AppIconKey = keyof typeof appIcons;
