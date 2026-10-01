// filepath: src/features/contracts/components/CurrencyInput.tsx
/**
 * CurrencyInput — input numérico con formato COP (sin decimales) usado en
 * el form de contratos. Sale de ContractsView.tsx como parte del refactor #13.
 */
import { Input } from "../../../shared/ui";

export interface CurrencyInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

export function CurrencyInput({ label, value, onChange }: CurrencyInputProps) {
  return (
    <Input
      label={label}
      type="number"
      min={0}
      step={1000}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  );
}
