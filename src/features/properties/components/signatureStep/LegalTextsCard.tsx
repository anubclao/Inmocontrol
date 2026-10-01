// filepath: src/features/properties/components/signatureStep/LegalTextsCard.tsx
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "../../../../shared/ui";
import { LEGAL_TEXTS } from "./legalTexts";

export interface LegalTextsCardProps {
  propertyLabel: string;
  accepted: boolean;
  onAcceptChange: (v: boolean) => void;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
}

/**
 * Card colapsable con los textos jurídicos obligatorios del inventario
 * (declaración de entrega, mantenimientos, plazo para reportar anomalías).
 * El agente debe scrollear y aceptar antes de poder habilitar "Guardar
 * firmas". La marca `{empresa}` se deja literal para que el gerente la
 * reemplace en el PDF al imprimir.
 */
export function LegalTextsCard({
  propertyLabel,
  accepted,
  onAcceptChange,
  expanded,
  onExpandedChange,
}: LegalTextsCardProps) {
  return (
    <Card className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => onExpandedChange(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-blue-600" />
          <div className="text-left">
            <p className="font-bold text-slate-900">
              Textos Jurídicos del Inventario
            </p>
            <p className="text-xs text-slate-500">
              {accepted
                ? "Aceptados. Las partes firman en conformidad con los textos."
                : "Obligatorio leer y aceptar antes de firmar."}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-slate-100 p-4 max-h-96 overflow-y-auto bg-slate-50">
          <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
            {LEGAL_TEXTS.map((t) => {
              const body = t.body
                .replaceAll("{propertyType}", propertyLabel)
                .replaceAll("{empresa}", "{nombre de la agencia}");
              return (
                <div key={t.title}>
                  <p className="font-bold text-slate-900 mb-1">{t.title}.</p>
                  <p>{body}</p>
                </div>
              );
            })}
          </div>
          <label className="mt-4 flex items-start gap-2 cursor-pointer p-3 bg-white rounded-lg border border-slate-200">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => onAcceptChange(e.target.checked)}
              className="mt-0.5 w-4 h-4"
            />
            <span className="text-sm text-slate-700">
              Declaro haber leído y aceptado los textos jurídicos anteriores.
              Las partes firman en conformidad.
            </span>
          </label>
        </div>
      )}
      {!expanded && (
        <div className="border-t border-slate-100 p-3 bg-slate-50">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => onAcceptChange(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-slate-700">
              Acepto los textos jurídicos del inventario.
            </span>
          </label>
        </div>
      )}
    </Card>
  );
}
