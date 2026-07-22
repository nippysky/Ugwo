/**
 * add-debt.store — shared state for the center FAB in the tab bar.
 *
 * The FAB lives in (tabs)/_layout.tsx so it's visible from every tab, but the
 * "Owed to me / I owe" picker and the AddDebtSheet it opens are rendered
 * alongside the Tabs navigator itself (not inside any one screen). This store
 * is the glue between the FAB's tabPress listener and that shared UI.
 */
import { create } from 'zustand';
import type { DebtDirection } from '../types';

interface AddDebtState {
  pickerOpen: boolean;
  sheetDir:   DebtDirection | null;

  openPicker:  () => void;
  closePicker: () => void;
  openSheet:   (dir: DebtDirection) => void;
  closeSheet:  () => void;
}

export const useAddDebtStore = create<AddDebtState>()((set) => ({
  pickerOpen: false,
  sheetDir:   null,

  openPicker:  () => set((s) => ({ pickerOpen: !s.pickerOpen })),
  closePicker: () => set({ pickerOpen: false }),
  openSheet:   (dir) => set({ pickerOpen: false, sheetDir: dir }),
  closeSheet:  () => set({ sheetDir: null }),
}));
