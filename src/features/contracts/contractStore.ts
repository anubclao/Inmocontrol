import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Contract, ContractStatus } from './contractTypes';

interface ContractState {
  contracts: Contract[];

  addContract: (c: Contract) => void;
  updateContract: (id: string, patch: Partial<Contract>) => void;
  removeContract: (id: string) => void;
  setStatus: (id: string, status: ContractStatus) => void;
  reset: () => void;
}

const initialState = { contracts: [] as Contract[] };

export const useContractStore = create<ContractState>()(
  persist(
    (set) => ({
      ...initialState,
      addContract: (c) => set((s) => ({ contracts: [c, ...s.contracts] })),
      updateContract: (id, patch) =>
        set((s) => ({
          contracts: s.contracts.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c)),
        })),
      removeContract: (id) => set((s) => ({ contracts: s.contracts.filter((c) => c.id !== id) })),
      setStatus: (id, status) =>
        set((s) => ({
          contracts: s.contracts.map((c) => (c.id === id ? { ...c, status, updatedAt: new Date().toISOString() } : c)),
        })),
      reset: () => set(initialState),
    }),
    {
      name: 'inmocontrol:contracts:v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
