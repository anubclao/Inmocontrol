// filepath: src/features/properties/components/signatureStep/SignerCard.tsx
import { useEffect, type ChangeEvent, type RefObject } from "react";
import { Camera, Upload } from "lucide-react";
import { Card, Input } from "../../../../shared/ui";
import { SignaturePad, type SignaturePadRef } from "../../SignaturePad";
import {
  validateEmail,
  validateIdNumber,
  validateName,
  validatePhone,
} from "./validators";

export interface SignerCardProps {
  title: string;
  subtitle?: string;
  name: string;
  onName: (v: string) => void;
  idNumber: string;
  onIdNumber: (v: string) => void;
  phone: string;
  onPhone: (v: string) => void;
  email: string;
  onEmail: (v: string) => void;
  photo: string | null;
  onPhoto: (v: string | null) => void;
  padRef: RefObject<SignaturePadRef | null>;
  onValid: (v: boolean) => void;
  /** Reporta si los 4 campos (nombre/cédula/teléfono/correo) están con formato válido. */
  onFieldsValid: (v: boolean) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onUploadPhoto: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  /** Texto del botón "Subir/Cambiar" — distinto para arrendatario ("cédula") vs agente ("foto"). */
  uploadLabel?: string;
}

/**
 * Card reutilizable por firmante del inventario. Muestra: foto del firmante
 * (obligatoria), nombre/cédula/teléfono/email con validación en vivo, y
 * SignaturePad. Reporta al padre si los campos tienen formato válido
 * (`onFieldsValid`) y si la firma está dibujada (`onValid`).
 */
export function SignerCard({
  title,
  subtitle,
  name,
  onName,
  idNumber,
  onIdNumber,
  phone,
  onPhone,
  email,
  onEmail,
  photo,
  onPhoto,
  padRef,
  onValid,
  onFieldsValid,
  fileInputRef,
  onUploadPhoto,
  uploadLabel,
}: SignerCardProps) {
  // Errores por campo. undefined = válido. Calculamos en cada render para que
  // la UI reaccione a cada cambio.
  const nameErr = validateName(name);
  const idErr = validateIdNumber(idNumber);
  const phoneErr = validatePhone(phone);
  const emailErr = validateEmail(email);
  const fieldsValid = !nameErr && !idErr && !phoneErr && !emailErr;

  // Reportar al padre (sin bucle: setState es estable cuando el valor no cambia).
  useEffect(() => {
    onFieldsValid(fieldsValid);
  }, [fieldsValid, onFieldsValid]);

  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        {/* Foto */}
        <div className="flex-shrink-0">
          {photo ? (
            <div className="relative">
              <img
                src={photo}
                alt="Foto"
                className="w-20 h-20 rounded-full object-cover border-2 border-slate-200"
              />
              <button
                type="button"
                onClick={() => onPhoto(null)}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
                title="Quitar foto"
              >
                ×
              </button>
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">
              <Camera className="w-6 h-6" />
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onUploadPhoto}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 w-full text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1"
          >
            <Upload className="w-3 h-3" />{" "}
            {photo ? "Cambiar" : (uploadLabel ?? "Subir foto")}
          </button>
          {!photo && (
            <p className="mt-1 text-[10px] text-red-500 text-center">
              Obligatorio
            </p>
          )}
        </div>

        {/* Datos + firma */}
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {title}
            </p>
            {subtitle && (
              <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Nombre completo *"
              value={name}
              onChange={(e) => onName(e.target.value)}
              error={nameErr}
            />
            <Input
              label="Cédula / Documento *"
              value={idNumber}
              onChange={(e) => onIdNumber(e.target.value)}
              error={idErr}
              placeholder="Ej: 52123456"
            />
            <Input
              label="Teléfono (WhatsApp) *"
              value={phone}
              onChange={(e) => onPhone(e.target.value)}
              placeholder="300 123 4567"
              error={phoneErr}
            />
            <Input
              label="Correo electrónico *"
              type="email"
              value={email}
              onChange={(e) => onEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              error={emailErr}
            />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Firma *
            </p>
            <SignaturePad ref={padRef} onChange={onValid} />
          </div>
        </div>
      </div>
    </Card>
  );
}
