/**
 * PlanAdminView — CRUD de planes del catálogo (admin).
 *
 * Permite crear / editar / desactivar planes sin tocar código. Los precios
 * y límites quedan en MySQL (tabla `saas_plans`) y se sirven vía API.
 *
 * Para SaaS multi-tenant: cada org tiene su propia subscripción a UNO de
 * estos planes. El catálogo es compartido entre todas las orgs (es lo que
 * típicamente hacen SaaS tipo Stripe).
 */

import { useEffect, useState } from 'react';
import { Plus, Edit3, Trash2, Star, Check, X, AlertTriangle, Loader2 } from 'lucide-react';
import { Button, Card, Modal, Input, cn } from '../../shared/ui';
import { useSaasBillingStore } from './saasBillingStore';
import type { Plan, PlanCreateInput, PlanUpdateInput } from './types';
import { formatCop } from './types';

export interface PlanAdminViewProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export function PlanAdminView({ showToast }: PlanAdminViewProps) {
  const { plans, hydrate, createPlan, updatePlan, removePlan, serverReachable } = useSaasBillingStore();
  const [editing, setEditing] = useState<{ mode: 'create' | 'edit'; plan?: Plan } | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div className="space-y-4">
      {!serverReachable && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>Servidor no disponible. Mostrando datos cacheados — los cambios no se pueden guardar hasta que vuelva.</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {plans.length} plan{plans.length === 1 ? '' : 'es'} en el catálogo. Cambios afectan a todas las orgs.
        </p>
        <Button onClick={() => setEditing({ mode: 'create' })} className="gap-1">
          <Plus className="w-3.5 h-3.5" /> Nuevo plan
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left p-3">Plan</th>
              <th className="text-right p-3">Precio/mes</th>
              <th className="text-right p-3">Inmuebles</th>
              <th className="text-right p-3">Usuarios</th>
              <th className="text-right p-3">Alertas/mes</th>
              <th className="text-center p-3">Activo</th>
              <th className="text-right p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {plans.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-slate-400">Sin planes aún.</td></tr>
            ) : plans.map((plan) => (
              <tr key={plan.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{plan.name}</span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{plan.slug}</span>
                  </div>
                  {plan.description && <p className="text-xs text-slate-500">{plan.description}</p>}
                </td>
                <td className="p-3 text-right font-mono">{formatCop(plan.priceCop)}</td>
                <td className="p-3 text-right font-mono">{plan.maxProperties}</td>
                <td className="p-3 text-right font-mono">{plan.maxUsers}</td>
                <td className="p-3 text-right font-mono">{plan.maxAlertsPerMonth.toLocaleString('es-CO')}</td>
                <td className="p-3 text-center">
                  {plan.isActive ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><Check className="w-2.5 h-2.5" /> Sí</span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600"><X className="w-2.5 h-2.5" /> No</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ mode: 'edit', plan })} className="text-slate-500 hover:text-blue-600 px-2">
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (confirm(`¿Eliminar/Desactivar plan "${plan.name}"?`)) {
                        removePlan(plan.id)
                          .then((res) => showToast(res.deactivated ? 'Plan desactivado (tenía subs activas)' : 'Plan eliminado', 'success'))
                          .catch((e) => showToast(e.message, 'error'));
                      }
                    }} className="text-slate-400 hover:text-red-600 px-2">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.mode === 'create' ? 'Nuevo plan' : `Editar plan: ${editing?.plan?.name ?? ''}`}
        size="lg"
      >
        {editing && (
          <PlanForm
            plan={editing.plan}
            onCancel={() => setEditing(null)}
            onSave={async (data: PlanCreateInput | PlanUpdateInput) => {
              try {
                if (editing.mode === 'create') {
                  await createPlan(data as PlanCreateInput);
                  showToast('Plan creado', 'success');
                } else if (editing.plan) {
                  await updatePlan(editing.plan.id, data as PlanUpdateInput);
                  showToast('Plan actualizado', 'success');
                }
                setEditing(null);
              } catch (e: any) {
                showToast(e.message ?? 'Error al guardar', 'error');
              }
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function PlanForm({
  plan, onCancel, onSave,
}: {
  plan?: Plan;
  onCancel: () => void;
  onSave: (data: PlanCreateInput | PlanUpdateInput) => Promise<void>;
}) {
  const [slug, setSlug] = useState(plan?.slug ?? '');
  const [name, setName] = useState(plan?.name ?? '');
  const [description, setDescription] = useState(plan?.description ?? '');
  const [priceCop, setPriceCop] = useState(plan?.priceCop?.toString() ?? '0');
  const [maxProperties, setMaxProperties] = useState(plan?.maxProperties?.toString() ?? '5');
  const [maxUsers, setMaxUsers] = useState(plan?.maxUsers?.toString() ?? '1');
  const [maxAlerts, setMaxAlerts] = useState(plan?.maxAlertsPerMonth?.toString() ?? '100');
  const [features, setFeatures] = useState((plan?.features ?? []).join('\n'));
  const [sortOrder, setSortOrder] = useState(plan?.sortOrder?.toString() ?? '100');
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Slug (URL-safe)" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="pro" disabled={!!plan} />
        <Input label="Nombre comercial" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pro" />
      </div>
      <Input label="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Para inmobiliarias en crecimiento" />

      <div className="grid grid-cols-2 gap-3">
        <Input label="Precio/mes (COP)" type="number" value={priceCop} onChange={(e) => setPriceCop(e.target.value)} />
        <Input label="Orden display" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Input label="Max inmuebles" type="number" value={maxProperties} onChange={(e) => setMaxProperties(e.target.value)} />
        <Input label="Max usuarios" type="number" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} />
        <Input label="Max alertas/mes" type="number" value={maxAlerts} onChange={(e) => setMaxAlerts(e.target.value)} />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Features (uno por línea)</label>
        <textarea
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white font-mono"
          placeholder={'Hasta 100 inmuebles\n5 usuarios\nWhatsApp + Email'}
        />
      </div>

      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
        <span className="text-slate-700">Plan activo (visible para nuevas subscripciones)</span>
      </label>

      <div className="pt-2 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button
          disabled={saving || !slug || !name}
          onClick={async () => {
            setSaving(true);
            try {
              const data = {
                ...(plan ? {} : { slug }),
                name,
                description: description || undefined,
                priceCop: Number(priceCop),
                maxProperties: Number(maxProperties),
                maxUsers: Number(maxUsers),
                maxAlertsPerMonth: Number(maxAlerts),
                features: features.split('\n').map((s) => s.trim()).filter(Boolean),
                sortOrder: Number(sortOrder),
                isActive,
              } as PlanCreateInput;
              await onSave(data);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando…</> : 'Guardar'}
        </Button>
      </div>
    </div>
  );
}
