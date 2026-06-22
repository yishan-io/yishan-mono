import {
  AlarmClock,
  Anchor,
  Aperture,
  Archive,
  Atom,
  Award,
  BadgeCheck,
  Bell,
  BookOpen,
  Bot,
  Briefcase,
  Bug,
  Bus,
  Calendar,
  Camera,
  Cloud,
  Code,
  Folder,
  Globe,
  Heart,
  House,
  Image,
  Key,
  Layers,
  Lightbulb,
  Lock,
  Map as MapIcon,
  Moon,
  Rocket,
  Settings,
  Shield,
  ShoppingBag,
  SquareTerminal,
  Star,
  Sun,
  User,
  Wrench,
} from "@tamagui/lucide-icons";
import type { ReactNode } from "react";

type ProjectIconRenderer = (size: number) => ReactNode;

const PROJECT_ICON_BY_ID: Record<string, ProjectIconRenderer> = {
  alarm: (size) => <AlarmClock color="$color1" size={size} />,
  anchor: (size) => <Anchor color="$color1" size={size} />,
  aperture: (size) => <Aperture color="$color1" size={size} />,
  archive: (size) => <Archive color="$color1" size={size} />,
  atom: (size) => <Atom color="$color1" size={size} />,
  award: (size) => <Award color="$color1" size={size} />,
  badge: (size) => <BadgeCheck color="$color1" size={size} />,
  bag: (size) => <ShoppingBag color="$color1" size={size} />,
  bell: (size) => <Bell color="$color1" size={size} />,
  book: (size) => <BookOpen color="$color1" size={size} />,
  bot: (size) => <Bot color="$color1" size={size} />,
  briefcase: (size) => <Briefcase color="$color1" size={size} />,
  bug: (size) => <Bug color="$color1" size={size} />,
  bulb: (size) => <Lightbulb color="$color1" size={size} />,
  bus: (size) => <Bus color="$color1" size={size} />,
  calendar: (size) => <Calendar color="$color1" size={size} />,
  camera: (size) => <Camera color="$color1" size={size} />,
  cloud: (size) => <Cloud color="$color1" size={size} />,
  code: (size) => <Code color="$color1" size={size} />,
  folder: (size) => <Folder color="$color1" size={size} />,
  globe: (size) => <Globe color="$color1" size={size} />,
  heart: (size) => <Heart color="$color1" size={size} />,
  home: (size) => <House color="$color1" size={size} />,
  image: (size) => <Image color="$color1" size={size} />,
  key: (size) => <Key color="$color1" size={size} />,
  layer: (size) => <Layers color="$color1" size={size} />,
  lock: (size) => <Lock color="$color1" size={size} />,
  map: (size) => <MapIcon color="$color1" size={size} />,
  moon: (size) => <Moon color="$color1" size={size} />,
  rocket: (size) => <Rocket color="$color1" size={size} />,
  settings: (size) => <Settings color="$color1" size={size} />,
  shield: (size) => <Shield color="$color1" size={size} />,
  star: (size) => <Star color="$color1" size={size} />,
  sun: (size) => <Sun color="$color1" size={size} />,
  terminal: (size) => <SquareTerminal color="$color1" size={size} />,
  user: (size) => <User color="$color1" size={size} />,
  wrench: (size) => <Wrench color="$color1" size={size} />,
};

export function renderMobileProjectIcon(iconId: string | undefined, size: number): ReactNode {
  const normalized = iconId?.trim() ?? "";
  const renderIcon = PROJECT_ICON_BY_ID[normalized];
  if (renderIcon) {
    return renderIcon(size);
  }

  if (normalized) {
    return normalized.charAt(0).toUpperCase();
  }

  return <Folder color="$color1" size={size} />;
}
