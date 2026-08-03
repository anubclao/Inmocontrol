import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion, AnimatePresence } from "motion/react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ComponentPropsWithoutRef<"button"> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  type?: "button" | "submit" | "reset";
  children?: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  /**
   * Tooltip nativo del browser. Algunos consumidores (AlertRules, BillingPanel,
   * SettingsView) lo pasan y TS necesita reconocerlo — `ComponentPropsWithoutRef`
   * ya lo incluye vía `HTMLAttributes`, pero acá lo declaramos explícito para
   * que el type-check no se queje con React 19.
   */
  title?: string;
  /**
   * Para tests E2E (data-testid="..."). React 19 lo acepta como atributo HTML
   // pero TS no lo infiere de `ComponentPropsWithoutRef<'button'>` en algunos
   // setups; lo declaramos acá para no pelear con el lint.
   */
  "data-testid"?: string;
}

export const Button = ({
  className,
  variant = "primary",
  size = "md",
  type,
  ...props
}: ButtonProps) => {
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
    secondary: "bg-slate-800 text-white hover:bg-slate-900 shadow-sm",
    outline:
      "border border-slate-200 bg-transparent hover:bg-slate-50 text-slate-700",
    ghost: "bg-transparent hover:bg-slate-100 text-slate-600",
    danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
};

export const Card = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
  key?: string;
}) => (
  <div
    className={cn(
      "bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden",
      className,
    )}
  >
    {children}
  </div>
);

export const Input = ({
  label,
  error,
  className,
  ...props
}: {
  label?: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="space-y-1.5">
    {label && (
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
        {label}
      </label>
    )}
    <input
      className={cn(
        "w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all",
        error && "border-red-500 focus:ring-red-500/20 focus:border-red-500",
        className,
      )}
      {...props}
    />
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}) => {
  const sizeClass = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-[95vw]",
  }[size];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizeClass} overflow-hidden flex flex-col max-h-[90vh] z-10`}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-lg text-slate-900">{title}</h3>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded-full"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 p-6 overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
