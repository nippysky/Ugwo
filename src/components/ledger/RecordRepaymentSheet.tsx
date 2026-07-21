/**
 * RecordRepaymentSheet — log a repayment against a specific debt.
 * Auto-settles the debt at zero balance; the caller receives `onSettled`
 * so the person screen can play the settlement celebration.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { SheetModal } from '../ui/SheetModal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { AmountInput } from '../ui/AmountInput';
import { UgwoDatePicker } from '../ui/UgwoDatePicker';
import { useTheme } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import { useLedgerStore } from '../../store/ledger.store';
import { useUIStore } from '../../store/ui.store';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import { todayStr, friendlyDateInput } from './helpers';
import type { DebtWithBalance } from '../../types';

interface RecordRepaymentSheetProps {
  visible:   boolean;
  debt:      DebtWithBalance | null;
  onClose:   () => void;
  onSettled: () => void;
}

export function RecordRepaymentSheet({ visible, debt, onClose, onSettled }: RecordRepaymentSheetProps) {
  const { colors, text, spacing } = useTheme();
  const user            = useAuthStore((s) => s.user);
  const recordRepayment = useLedgerStore((s) => s.recordRepayment);
  const showToast       = useUIStore((s) => s.showToast);
  const { fmt }         = useCurrencyFormat();

  const [amount, setAmount]     = useState(0);
  const [paidOn, setPaidOn]     = useState(todayStr());
  const [note, setNote]         = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving]     = useState(false);

  const reset = () => {
    setAmount(0);
    setPaidOn(todayStr());
    setNote('');
    setSaving(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  if (!debt) return null;

  const canSave = amount > 0 && amount <= debt.outstanding;

  const handleSave = async () => {
    if (!user || !canSave || saving) return;
    setSaving(true);
    try {
      const { settled } = await recordRepayment({
        userId: user.id,
        debtId: debt.id,
        amount,
        paidOn,
        note: note.trim() || null,
      });
      close();
      if (settled) {
        onSettled();
      } else {
        showToast('success', 'Repayment recorded');
      }
    } catch {
      showToast('error', 'Could not save. Please try again.');
      setSaving(false);
    }
  };

  return (
    <SheetModal visible={visible} onClose={close}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing[6] }}
      >
        <Text style={[text.screenTitle, { color: colors.text, marginBottom: 4 }]}>
          Record repayment
        </Text>
        <Text style={[text.bodySm, { color: colors.textSecondary, marginBottom: spacing[4] }]}>
          Outstanding: {fmt(debt.outstanding)}
        </Text>

        <AmountInput
          label="Amount repaid"
          value={amount}
          onChange={setAmount}
          asBottomSheetInput
        />
        {amount > debt.outstanding && (
          <Text style={[text.caption, { color: colors.danger, marginTop: 4 }]}>
            {"That's more than the outstanding balance."}
          </Text>
        )}

        {/* Quick-fill: settle in full */}
        <Pressable
          onPress={() => setAmount(debt.outstanding)}
          style={[styles.fullChip, { borderColor: colors.accent, marginTop: spacing[3] }]}
        >
          <Text style={[text.bodySm, { color: colors.accent }]}>
            Settle in full — {fmt(debt.outstanding)}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.dateBtn,
            { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, marginTop: spacing[3] },
          ]}
          onPress={() => setPickerOpen(true)}
        >
          <CalendarDays size={16} color={colors.textSecondary as string} />
          <View>
            <Text style={[text.caption, { color: colors.textTertiary }]}>Paid on</Text>
            <Text style={[text.bodySm, { color: colors.text }]}>{friendlyDateInput(paidOn)}</Text>
          </View>
        </Pressable>

        <View style={{ marginTop: spacing[3] }}>
          <Input
            label="Note (optional)"
            placeholder="e.g. Bank transfer"
            value={note}
            onChangeText={setNote}
            autoCapitalize="sentences"
          />
        </View>

        <View style={{ marginTop: spacing[5] }}>
          <Button
            label="Record repayment"
            onPress={handleSave}
            disabled={!canSave}
            loading={saving}
            fullWidth
          />
        </View>
      </ScrollView>

      <UgwoDatePicker
        isOpen={pickerOpen}
        value={paidOn}
        maxDate={todayStr()}
        onChange={(iso) => setPaidOn(iso)}
        onClose={() => setPickerOpen(false)}
        title="When was it paid?"
      />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  fullChip: {
    alignSelf:         'flex-start',
    borderWidth:       1,
    borderRadius:      100,
    paddingVertical:   6,
    paddingHorizontal: 14,
  },
  dateBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    borderWidth:       1,
    borderRadius:      14,
    paddingVertical:   10,
    paddingHorizontal: 14,
  },
});
