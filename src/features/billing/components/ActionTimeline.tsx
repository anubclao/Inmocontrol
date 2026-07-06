/**
 * InmoControl — Timeline del histórico de acciones de una propiedad.
 *
 * Muestra en orden cronológico inverso las acciones registradas
 * (property_actions en MySQL). Lee vía /api/billing/actions?propertyId=
 *
 * El timestamp se muestra relativo ("hace 2 horas", "ayer") + absoluto.
 */

import React, { useEffect, useState } from 'react';
import {
  History, FileSignature, CreditCard, Tag, Receipt, Wallet, RefreshCw,
  Building2, User, FileText, Bell, Loader2, TrendingUp,
} from 'lucide-react';
import { Card } from '../../../shared/ui';
import { listActions } from '../api';
import type { PropertyAction, PropertyActionType } from '../types';

const TYPE_META: Record<PropertyActionType, { Icon: any; color: string; label: string }> = {
  property_created:       { Icon: Building2,     color: 'text-slate-600 bg-slate-100',     label: 'Propiedad creada' },
  property_archived:      { Icon: Building2,     color: 'text-amber-700 bg-amber-100',     label: 'Archivada' },
  property_restored:      { Icon: Building2,     color: 'text-emerald-700 bg-emerald-100', label: 'Restaurada' },
  property_owner_changed: { Icon: User,          color: 'text-blue-700 bg-blue-100',       label: 'Cambio de propietario' },
  documents_uploaded:     { Icon: FileText,      color: 'text-slate-600 bg-slate-100',     label: 'Documentos subidos' },
  mandato_signed:         { Icon: FileSignature, color: 'text-emerald-700 bg-emerald-100', label: 'Mandato firmado' },
  inventory_initial_signed:{ Icon: FileSignature, color: 'text-blue-700 bg-blue-100',       label: 'Inventario inicial firmado' },
  inventory_final_signed: { Icon: FileSignature, color: 'text-blue-700 bg-blue-100',       label: 'Inventario final firmado' },
  contract_created:       { Icon: FileText,      color: 'text-slate-600 bg-slate-100',     label: 'Contrato creado' },
  contract_signed:        { Icon: FileSignature, color: 'text-emerald-700 bg-emerald-100', label: 'Contrato firmado' },
  policy_approved:        { Icon: FileText,      color: 'text-emerald-700 bg-emerald-100', label: 'Póliza aprobada' },
  tenant_assigned:        { Icon: User,          color: 'text-blue-700 bg-blue-100',       label: 'Inquilino asignado' },
  tenant_changed:         { Icon: User,          color: 'text-amber-700 bg-amber-100',     label: 'Inquilino cambiado' },
  payment_received:       { Icon: CreditCard,    color: 'text-emerald-700 bg-emerald-100', label: 'Pago recibido' },
  discount_registered:    { Icon: Tag,           color: 'text-red-700 bg-red-100',         label: 'Descuento registrado' },
  increase_registered:    { Icon: TrendingUp,    color: 'text-amber-700 bg-amber-100',     label: 'Aumento registrado' },
  invoice_sent:           { Icon: Receipt,       color: 'text-blue-700 bg-blue-100',       label: 'Cuenta de cobro enviada' },
  invoice_paid:           { Icon: Wallet,        color: 'text-emerald-700 bg-emerald-100', label: 'Cuenta cobrada' },
  billing_policy_updated: { Icon: RefreshCw,     color: 'text-blue-700 bg-blue-100',       label: 'Política de billing actualizada' },
  bank_account_added:     { Icon: Wallet,        color: 'text-slate-600 bg-slate-100',     label: 'Cuenta bancaria agregada' },
  property_returned:      { Icon: Building2,     color: 'text-emerald-700 bg-emerald-100', label: 'Propiedad restituida' },
  note_added:             { Icon: Bell,          color: 'text-slate-600 bg-slate-100',     label: 'Nota agregada' },
};

export interface ActionTimelineProps {
  propertyId: string;
}

export function ActionTimeline({ propertyId }: ActionTimelineProps) {
  const [actions, setActions] = useState<PropertyAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await listActions(propertyId);
        if (!cancelled) setActions(list);
      } catch {
        // ignore — silently empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [propertyId]);

  return (
    <Card>
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
        <History className="w-5 h-5 text-blue-600" />
        <h3 className="font-bold text-slate-900 text-lg">Histórico de acciones</h3>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center gap-3 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          Cargando historial…
        </div>
      ) : actions.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400">
          Sin acciones registradas todavía.
        </div>
      ) : (
        <ol className="p-6 space-y-4">
          {actions.map((a) => {
            const meta = TYPE_META[a.type] ?? TYPE_META.note_added;
            const Icon = meta.Icon;
            const date = new Date(a.occurredAt);
            return (
              <li key={a.id} className="flex gap-3">
                <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${meta.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm text-slate-900">{meta.label}</span>
                    <span className="text-xs text-slate-400">· {formatRelative(date)}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-0.5">{a.description}</p>
                  <div className="text-xs text-slate-400 mt-1">
                    {date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })} · {a.actorName}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function formatRelative(date: Date): string {
  const now = new Date();
  const diff = (now.getTime() - date.getTime()) / 1000; // seconds
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} d`;
  return date.toLocaleDateString('es-CO');
}