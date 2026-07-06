import { useState, useEffect } from 'react';
import { Button, Card, Input } from '../../shared/ui';
import {
  generateActaEntregaPdf,
  downloadActaEntregaPdf,
  type ActaEntregaData,
} from './actaEntregaPdf';
import { FileDown, Save, X } from 'lucide-react';

interface ActaEntregaModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  tenant: {
    id: string;
    name: string;
    idNumber: string;
    leaseStartDate?: string;
    tenantDriveFolderId?: string | null;
  };
  property: {
    address: string;
    owner: string;
    ownerIdNumber: string;
  };
  onUploaded?: (fileId: string, webViewLink?: string) => void;
}

const todayIso = () => new Date().toISOString().split('T')[0];

/** Modal con el formulario para generar el Acta de Entrega.
 *  Re-usa los datos que ya tenemos (inquilino + propietario) y pide los
 *  datos del estado físico del inmueble (servicios, llaves, observaciones). */
export function ActaEntregaModal({
  isOpen, onClose, showToast, tenant, property, onUploaded,
}: ActaEntregaModalProps) {
  const [form, setForm] = useState<ActaEntregaData>(() => ({
    ciudad: '',
    fechaActa: todayIso(),
    arrendador: { nombre: property.owner ?? '', cedula: property.ownerIdNumber ?? '' },
    arrendatario: { nombre: tenant.name ?? '', cedula: tenant.idNumber ?? '' },
    fechaFirmaContrato: tenant.leaseStartDate ?? todayIso(),
    inmueble: { direccion: property.address ?? '' },
    servicios: {
      energia: { lectura: '', estado: '' },
      agua: { lectura: '', estado: '' },
      gas: { lectura: '', estado: '' },
    },
    paredes: '',
    puertasVentanas: '',
    cocina: '',
    banos: '',
    instalaciones: '',
    llaves: { principal: 0, habitaciones: 0, controles: 0 },
    observaciones: '',
  }));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  // Si cambia el tenant / property mientras está abierto, re-sincroniza los auto-fills.
  useEffect(() => {
    if (!isOpen) return;
    setForm((f) => ({
      ...f,
      arrendador: { nombre: property.owner ?? '', cedula: property.ownerIdNumber ?? '' },
      arrendatario: { nombre: tenant.name ?? '', cedula: tenant.idNumber ?? '' },
      fechaFirmaContrato: tenant.leaseStartDate ?? f.fechaFirmaContrato,
      inmueble: { direccion: property.address ?? '' },
    }));
  }, [isOpen, property.owner, property.ownerIdNumber, property.address, tenant.name, tenant.idNumber, tenant.leaseStartDate]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.ciudad.trim()) e.ciudad = 'La ciudad es obligatoria';
    if (!form.fechaActa) e.fechaActa = 'La fecha del acta es obligatoria';
    if (!form.fechaFirmaContrato) e.fechaFirmaContrato = 'La fecha del contrato es obligatoria';
    if (!form.arrendador.nombre.trim()) e.arrendadorNombre = 'Falta el nombre del arrendador';
    if (!form.arrendador.cedula.trim()) e.arrendadorCedula = 'Falta la cédula del arrendador';
    if (!form.arrendatario.nombre.trim()) e.arrendatarioNombre = 'Falta el nombre del arrendatario';
    if (!form.arrendatario.cedula.trim()) e.arrendatarioCedula = 'Falta la cédula del arrendatario';
    if (!form.inmueble.direccion.trim()) e.inmuebleDireccion = 'Falta la dirección del inmueble';

    // Al menos las lecturas de servicios (los estados pueden quedar vacíos)
    if (!form.servicios.energia.lectura.trim()) e.energia = 'Falta la lectura de energía';
    if (!form.servicios.agua.lectura.trim()) e.agua = 'Falta la lectura de agua';
    if (!form.servicios.gas.lectura.trim()) e.gas = 'Falta la lectura de gas';

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleGenerar = async () => {
    if (!validate()) {
      showToast('Revisa los campos obligatorios antes de generar', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const blob = await generateActaEntregaPdf(form);
      setPreviewBlob(blob);
      // También descarga directo (UX estándar)
      const filename = buildFilename(form);
      downloadActaEntregaPdf(blob, filename);
      showToast('Acta de Entrega generada y descargada', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error al generar el acta', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuardarDrive = async () => {
    if (!previewBlob) {
      showToast('Primero genera el PDF', 'error');
      return;
    }
    // Auto-recuperación: si el tenant no tiene carpeta en Drive, la creamos
    // on-demand. Caso típico: tenant creado sin Drive conectado, o con
    // creación de carpeta que falló silenciosamente.
    let folderId = tenant.tenantDriveFolderId;
    if (!folderId) {
      try {
        const res = await fetch(
          `/api/tenants/${encodeURIComponent(tenant.id)}/ensure-drive-folder`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' } },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(data?.error ?? 'No se pudo crear la carpeta del arrendatario en Drive', 'error');
          return;
        }
        folderId = data.tenantDriveFolderId as string;
        showToast('Carpeta de Drive creada para el arrendatario', 'success');
      } catch {
        showToast('Error de conexión al preparar Drive', 'error');
        return;
      }
    }
    setSubmitting(true);
    try {
      const base64 = await blobToBase64(previewBlob);
      const res = await fetch('/api/tenants/upload-acta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantDriveFolderId: folderId,
          fileName: buildFilename(form),
          base64Data: base64,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Error al guardar en Drive', 'error');
        return;
      }
      showToast('Acta guardada en Google Drive', 'success');
      onUploaded?.(data.fileId, data.webViewLink);
      onClose();
    } catch (err) {
      console.error(err);
      showToast('Error de conexión al guardar en Drive', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[170] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg text-slate-900">Acta de Entrega y Recibo de Llaves</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Documento legal de entrega del inmueble · Arrendatario: <strong>{tenant.name}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded-full"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
          {/* Encabezado / datos del acta */}
          <Card className="p-4 space-y-3">
            <p className="text-xs font-bold uppercase text-slate-500">Datos del acta</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Ciudad"
                placeholder="Ej: Bogotá D.C."
                value={form.ciudad}
                onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                error={errors.ciudad}
              />
              <Input
                label="Fecha del acta"
                type="date"
                value={form.fechaActa}
                onChange={(e) => setForm({ ...form, fechaActa: e.target.value })}
                error={errors.fechaActa}
              />
              <Input
                label="Fecha de firma del contrato"
                type="date"
                value={form.fechaFirmaContrato}
                onChange={(e) => setForm({ ...form, fechaFirmaContrato: e.target.value })}
                error={errors.fechaFirmaContrato}
              />
              <Input
                label="Dirección del inmueble"
                value={form.inmueble.direccion}
                onChange={(e) => setForm({ ...form, inmueble: { ...form.inmueble, direccion: e.target.value } })}
                error={errors.inmuebleDireccion}
              />
            </div>
          </Card>

          {/* Partes */}
          <Card className="p-4 space-y-3">
            <p className="text-xs font-bold uppercase text-slate-500">Las partes (auto-completado)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">EL ARRENDADOR (Propietario)</p>
                <Input
                  label="Nombre"
                  value={form.arrendador.nombre}
                  onChange={(e) => setForm({ ...form, arrendador: { ...form.arrendador, nombre: e.target.value } })}
                  error={errors.arrendadorNombre}
                />
                <Input
                  label="Cédula / ID"
                  value={form.arrendador.cedula}
                  onChange={(e) => setForm({ ...form, arrendador: { ...form.arrendador, cedula: e.target.value } })}
                  error={errors.arrendadorCedula}
                />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">EL ARRENDATARIO (Inquilino)</p>
                <Input
                  label="Nombre"
                  value={form.arrendatario.nombre}
                  onChange={(e) => setForm({ ...form, arrendatario: { ...form.arrendatario, nombre: e.target.value } })}
                  error={errors.arrendatarioNombre}
                />
                <Input
                  label="Cédula / ID"
                  value={form.arrendatario.cedula}
                  onChange={(e) => setForm({ ...form, arrendatario: { ...form.arrendatario, cedula: e.target.value } })}
                  error={errors.arrendatarioCedula}
                />
              </div>
            </div>
          </Card>

          {/* Servicios públicos */}
          <Card className="p-4 space-y-3">
            <p className="text-xs font-bold uppercase text-slate-500">Servicios públicos (lectura + estado)</p>
            {([
              ['energia', 'Energía eléctrica'],
              ['agua', 'Agua potable'],
              ['gas', 'Gas domiciliario'],
            ] as const).map(([key, label]) => (
              <div key={key} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                <p className="text-xs font-bold text-slate-700 md:col-span-1">{label}</p>
                <Input
                  placeholder="Lectura actual"
                  value={form.servicios[key].lectura}
                  onChange={(e) => setForm({ ...form, servicios: { ...form.servicios, [key]: { ...form.servicios[key], lectura: e.target.value } } })}
                  error={errors[key as string]}
                />
                <select
                  className="h-10 px-3 bg-slate-100 border-transparent rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                  value={form.servicios[key].estado}
                  onChange={(e) => setForm({ ...form, servicios: { ...form.servicios, [key]: { ...form.servicios[key], estado: e.target.value as any } } })}
                >
                  <option value="">Estado…</option>
                  <option value="Bueno">Bueno</option>
                  <option value="Regular">Regular</option>
                  <option value="Malo">Malo</option>
                </select>
              </div>
            ))}
          </Card>

          {/* Estado físico */}
          <Card className="p-4 space-y-3">
            <p className="text-xs font-bold uppercase text-slate-500">Estado físico del inmueble</p>
            {([
              ['paredes', 'Paredes, Techos y Pisos'],
              ['puertasVentanas', 'Puertas y Ventanas'],
              ['cocina', 'Cocina'],
              ['banos', 'Baños'],
              ['instalaciones', 'Instalaciones Eléctricas'],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className="text-[10px] font-bold uppercase text-slate-400">{label}</label>
                <textarea
                  rows={2}
                  className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder={`Describe el estado de ${label.toLowerCase()}...`}
                  value={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value } as any)}
                />
              </div>
            ))}
          </Card>

          {/* Llaves + Observaciones */}
          <Card className="p-4 space-y-3">
            <p className="text-xs font-bold uppercase text-slate-500">Llaves entregadas</p>
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Puerta principal"
                type="number"
                min={0}
                value={String(form.llaves.principal)}
                onChange={(e) => setForm({ ...form, llaves: { ...form.llaves, principal: parseInt(e.target.value || '0', 10) } })}
              />
              <Input
                label="Habitaciones"
                type="number"
                min={0}
                value={String(form.llaves.habitaciones)}
                onChange={(e) => setForm({ ...form, llaves: { ...form.llaves, habitaciones: parseInt(e.target.value || '0', 10) } })}
              />
              <Input
                label="Controles / chips"
                type="number"
                min={0}
                value={String(form.llaves.controles)}
                onChange={(e) => setForm({ ...form, llaves: { ...form.llaves, controles: parseInt(e.target.value || '0', 10) } })}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400">Observaciones</label>
              <textarea
                rows={3}
                className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="Notas adicionales sobre el estado del inmueble o la entrega..."
                value={form.observaciones}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              />
            </div>
          </Card>
        </div>

        {/* Footer con acciones */}
        <div className="p-4 border-t border-slate-100 flex flex-wrap gap-3 shrink-0 bg-slate-50">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={handleGenerar} disabled={submitting} className="gap-2">
            <FileDown className="w-4 h-4" />
            {previewBlob ? 'Volver a generar' : 'Generar y descargar PDF'}
          </Button>
          <Button
            onClick={handleGuardarDrive}
            disabled={submitting || !previewBlob}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            Guardar en Google Drive
          </Button>
        </div>
      </div>
    </div>
  );
}

function buildFilename(form: ActaEntregaData): string {
  const fecha = (form.fechaActa || todayIso()).replace(/-/g, '');
  const slug = (form.arrendatario.nombre || 'inquilino')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `Acta_Entrega_${slug}_${fecha}.pdf`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Quitar el prefijo "data:application/pdf;base64,"
      resolve(result.split(',')[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
