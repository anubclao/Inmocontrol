/**
 * Tipos del módulo de Alertas.
 *
 * Este módulo se rehace en dos fases:
 *  - Fase 1 (actual): tipos + derivación + store. El dashboard consume esto
 *    para mostrar las alertas reales (mora, vencimientos, etc.) en vez del
 *    mock "3 pendientes" que tenía.
 *  - Fase 2 (siguiente): rewrite completo de AlertsView como módulo integral
 *    parametrizable (reglas + canales + reglas por usuario).
 *
 * Decisiones:
 *  - `id` determinístico (`mora-<invoiceId>`, `venc-<contractId>`, etc.) para
 *    que el "dismissed" del usuario persista entre derivaciones aunque los
 *    datos cambien de orden/posición.
 *  - Severidad tipada y ordenada; el dashboard la usa para ordenar.
 *  - `entityRef` agrupa punteros a las entidades relacionadas — así la UI
 *    puede navegar al detalle sin tener que recomponer el id.
 */

export type AlertSeverity = 'critical' | 'warning' | 'info';

/** Peso para ordenar (mayor = más urgente). */
export const ALERT_SEVERITY_WEIGHT: Record<AlertSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

export type AlertCategory =
  | 'mora'           // factura de arriendo vencida y no pagada
  | 'vencimiento'    // contrato próximo a vencer (≤90 días)
  | 'preaviso'       // fecha de preaviso de no-renovación ya vencida
  | 'documento'      // documento legal faltante (ej: mandato sin firmar)
  | 'pago';          // recordatorio de pago próximo

export const ALERT_CATEGORY_LABEL: Record<AlertCategory, string> = {
  mora: 'Mora',
  vencimiento: 'Vencimiento',
  preaviso: 'Preaviso',
  documento: 'Documento',
  pago: 'Pago',
};

/** Referencia a la entidad raíz que dispara la alerta (para drill-down). */
export interface AlertEntityRef {
  propertyId?: string;
  tenantId?: string;
  contractId?: string;
  invoiceId?: string;
}

export interface Alert {
  /** ID determinístico — estable entre derivaciones. */
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  /** Título corto (≤ 60 chars). Se muestra en el card del dashboard. */
  title: string;
  /** Descripción de una línea con contexto (inquilino, dirección, días). */
  description: string;
  /** Puntero a la entidad. La UI puede navegar al detalle desde acá. */
  entity: AlertEntityRef;
  /** Dato clave en `meta` que dispara la alerta (días vencidos, fecha, etc). */
  meta?: {
    daysOverdue?: number;
    daysToEnd?: number;
    daysToNotice?: number;
    amount?: number;
    period?: string;
  };
  /** Cuándo fue detectada por primera vez (ISO). Persiste aunque se rederive. */
  detectedAt: string;
}
