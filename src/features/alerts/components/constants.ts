// filepath: src/features/alerts/components/constants.ts
/**
 * Constantes de presentación compartidas entre los sub-componentes de AlertsView.
 * Salen de `AlertsView.tsx` como parte del refactor #11.
 */
import {
  AlertTriangle,
  Bell,
  Clock,
  DollarSign,
  FileX,
  Mail,
  MessageSquare,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import type { AlertCategory, AlertSeverity } from "../types";
import type { ChannelType } from "../ruleTypes";

export const SEVERITY_BADGE: Record<
  AlertSeverity,
  { label: string; cls: string }
> = {
  critical: { label: "Crítica", cls: "bg-red-100 text-red-700 border-red-200" },
  warning: {
    label: "Alerta",
    cls: "bg-amber-100 text-amber-700 border-amber-200",
  },
  info: { label: "Info", cls: "bg-sky-100 text-sky-700 border-sky-200" },
};

export const CATEGORY_ICON: Record<AlertCategory, LucideIcon> = {
  mora: DollarSign,
  vencimiento: Clock,
  preaviso: AlertTriangle,
  documento: FileX,
  pago: Bell,
};

export const CHANNEL_ICON: Record<ChannelType, LucideIcon> = {
  whatsapp: MessageSquare,
  email: Mail,
  in_app: Smartphone,
};

export const CHANNEL_COLOR: Record<ChannelType, string> = {
  whatsapp: "text-emerald-600 bg-emerald-50",
  email: "text-blue-600 bg-blue-50",
  in_app: "text-violet-600 bg-violet-50",
};
