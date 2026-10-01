// filepath: src/features/saasBilling/components/AddPaymentMethodForm.tsx
/**
 * AddPaymentMethodForm — form para agregar un método de pago (mock).
 * Sale de SaasBillingView.tsx como parte del refactor #16.
 */
import { useState } from "react";
import { Button, Input, cn } from "../../../shared/ui";
import type { PaymentMethodInput, PaymentMethodType } from "../types";

export interface AddPaymentMethodFormProps {
  onCancel: () => void;
  onSave: (data: PaymentMethodInput) => void;
}

const TYPE_LABELS: Record<PaymentMethodType, string> = {
  card: "💳 Tarjeta",
  pse: "🏦 PSE",
  nequi: "💜 Nequi",
  bancolombia: "🟡 Bancolombia",
};

export function AddPaymentMethodForm({
  onCancel,
  onSave,
}: AddPaymentMethodFormProps) {
  const [type, setType] = useState<PaymentMethodType>("card");
  const [brand, setBrand] = useState("visa");
  const [last4, setLast4] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [holderName, setHolderName] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);

  const canSave =
    type === "card"
      ? last4.length === 4 && !!expMonth && !!expYear && !!holderName
      : true;

  const handleSave = () => {
    if (!canSave) return;
    const data: PaymentMethodInput = {
      type,
      brand: type === "card" ? brand : undefined,
      last4: type === "card" ? last4 : undefined,
      expiryMonth: type === "card" ? Number(expMonth) : undefined,
      expiryYear: type === "card" ? Number(expYear) : undefined,
      holderName: type === "card" ? holderName : undefined,
    };
    onSave(data);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
          Tipo
        </label>
        <div className="flex gap-2 flex-wrap">
          {(["card", "pse", "nequi", "bancolombia"] as PaymentMethodType[]).map(
            (t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  type === t
                    ? "bg-blue-50 border-blue-200 text-blue-700"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                {TYPE_LABELS[t]}
              </button>
            ),
          )}
        </div>
      </div>
      {type === "card" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                Marca
              </label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white"
              >
                <option value="visa">Visa</option>
                <option value="mastercard">Mastercard</option>
                <option value="amex">Amex</option>
                <option value="diners">Diners</option>
              </select>
            </div>
            <Input
              label="Últimos 4"
              value={last4}
              onChange={(e) =>
                setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="4242"
              maxLength={4}
              inputMode="numeric"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Mes"
              value={expMonth}
              onChange={(e) => setExpMonth(e.target.value)}
              placeholder="MM"
              maxLength={2}
              inputMode="numeric"
            />
            <Input
              label="Año"
              value={expYear}
              onChange={(e) => setExpYear(e.target.value)}
              placeholder="YYYY"
              maxLength={4}
              inputMode="numeric"
            />
          </div>
          <Input
            label="Titular"
            value={holderName}
            onChange={(e) => setHolderName(e.target.value)}
            placeholder="Como aparece en la tarjeta"
          />
        </>
      )}
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={makeDefault}
          onChange={(e) => setMakeDefault(e.target.checked)}
        />
        Marcar como método predeterminado
      </label>
      <div className="pt-2 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={!canSave}>
          Guardar método
        </Button>
      </div>
    </div>
  );
}
