// filepath: src/features/properties/components/StepDocs/DocSection.tsx
// Sub-componente que renderiza una seccion del wizard (titulo + grilla de DocCards).
//
// fix-issue-07 (FASE 4 Karpathy, oct-2026): extraido del componente principal
// para que StepDocs.tsx quede <200 lineas. Las 3 secciones (propietarios,
// unidades, propiedad) usan el mismo shape: titulo + grilla de cards.

import type { LucideIcon } from "lucide-react";
import { DocCard } from "./DocCard";
import { iconForKey, labelForKey } from "./hooks/useDocCards";
import type { WizardOwner, WizardUnit } from "../StepBasic";
import type { RequiredSlot, UploadedDocsMap } from "./types";

interface DocSectionProps {
  title: string;
  Icon: LucideIcon;
  slots: RequiredSlot[];
  uploadedDocs: UploadedDocsMap;
  uploadingDoc: string | null;
  owners: WizardOwner[];
  units: WizardUnit[];
  /** Si true, la card detecta slotKey === "mandato" y marca isMandato. */
  checkMandato?: boolean;
  triggerFileInput: (label: string) => void;
  removeFileFromSlot: (slotKey: string, index: number) => void;
  setViewingDoc: (v: { label: string; url: string } | null) => void;
}

export function DocSection({
  title,
  Icon,
  slots,
  uploadedDocs,
  uploadingDoc,
  owners,
  units,
  checkMandato,
  triggerFileInput,
  removeFileFromSlot,
  setViewingDoc,
}: DocSectionProps) {
  if (slots.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-slate-500" />
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          {title}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {slots.map((s) => {
          const isMandato = checkMandato ? s.slotKey === "mandato" : false;
          const label = labelForKey(s.slotKey, owners, units);
          return (
            <DocCard
              key={s.slotKey}
              docKey={s.slotKey}
              label={label}
              Icon={iconForKey(s.slotKey, s.group, s.unitId, units)}
              files={uploadedDocs[s.slotKey] ?? []}
              required={s.required}
              isMandato={isMandato}
              helpText={s.helpText}
              uploading={uploadingDoc === s.slotKey}
              onPick={() => triggerFileInput(s.slotKey)}
              onAddAnother={() => triggerFileInput(s.slotKey)}
              onRemove={(i) => removeFileFromSlot(s.slotKey, i)}
              onView={(url) => setViewingDoc({ label, url })}
            />
          );
        })}
      </div>
    </div>
  );
}
