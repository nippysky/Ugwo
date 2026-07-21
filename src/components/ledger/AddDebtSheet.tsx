/**
 * AddDebtSheet — the <10-second logging flow.
 *
 * Direction is chosen by the FAB ("Owed to me" / "I owe") before this sheet
 * opens. Inside: who (existing person or new name), amount, date, optional
 * due date, optional note. One button. Done.
 */
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CalendarDays, X } from 'lucide-react-native';
import { SheetModal } from '../ui/SheetModal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { AmountInput } from '../ui/AmountInput';
import { UgwoDatePicker } from '../ui/UgwoDatePicker';
import { InitialsAvatar } from '../ui/InitialsAvatar';
import { useTheme } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import { useLedgerStore } from '../../store/ledger.store';
import { useUIStore } from '../../store/ui.store';
import { todayStr, friendlyDateInput } from './helpers';
import type { DebtDirection } from '../../types';

interface AddDebtSheetProps {
  visible:   boolean;
  direction: DebtDirection;
  onClose:   () => void;
  /** Pre-select a person (when opened from their ledger). */
  personId?: string | null;
}

export function AddDebtSheet({ visible, direction, onClose, personId = null }: AddDebtSheetProps) {
  const { colors, text, spacing } = useTheme();
  const user     = useAuthStore((s) => s.user);
  const persons  = useLedgerStore((s) => s.persons);
  const addDebt  = useLedgerStore((s) => s.addDebt);
  const addPerson = useLedgerStore((s) => s.addPerson);
  const currency = useUIStore((s) => s.currency);
  const showToast = useUIStore((s) => s.showToast);

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(personId);
  const [newName, setNewName]     = useState('');
  const [amount, setAmount]       = useState(0);
  const [incurredOn, setIncurredOn] = useState(todayStr());
  const [dueOn, setDueOn]         = useState<string | null>(null);
  const [note, setNote]           = useState('');
  const [pickerFor, setPickerFor] = useState<'incurred' | 'due' | null>(null);
  const [saving, setSaving]       = useState(false);

  const owedToMe = direction === 'owed_to_me';

  const sortedPersons = useMemo(
    () => [...persons].sort((a, b) => a.name.localeCompare(b.name)),
    [persons],
  );

  const reset = () => {
    setSelectedPersonId(personId);
    setNewName('');
    setAmount(0);
    setIncurredOn(todayStr());
    setDueOn(null);
    setNote('');
    setSaving(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const canSave =
    amount > 0 && (selectedPersonId !== null || newName.trim().length > 0);

  const handleSave = async () => {
    if (!user || !canSave || saving) return;
    setSaving(true);
    try {
      let pid = selectedPersonId;
      if (!pid) {
        const person = await addPerson(user.id, newName.trim());
        pid = person.id;
      }
      await addDebt({
        userId:     user.id,
        personId:   pid,
        direction,
        principal:  amount,
        currency:   currency.code,
        incurredOn,
        dueOn,
        note:       note.trim() || null,
      });
      showToast('success', owedToMe ? 'Debt logged — owed to you' : 'Debt logged — you owe');
      close();
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
        {/* Title */}
        <Text style={[text.screenTitle, { color: colors.text, marginBottom: 4 }]}>
          {owedToMe ? 'Owed to me' : 'I owe'}
        </Text>
        <Text style={[text.bodySm, { color: colors.textSecondary, marginBottom: spacing[4] }]}>
          {owedToMe
            ? 'Log money someone owes you.'
            : 'Log money you owe someone.'}
        </Text>

        {/* Who */}
        <Text style={[styles.sectionLabel, text.label, { color: colors.textTertiary }]}>WHO</Text>
        {sortedPersons.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: spacing[3] }}
            contentContainerStyle={{ gap: spacing[2] }}
            keyboardShouldPersistTaps="handled"
          >
            {sortedPersons.map((p) => {
              const selected = selectedPersonId === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    setSelectedPersonId(selected ? null : p.id);
                    if (!selected) setNewName('');
                  }}
                  style={[
                    styles.personChip,
                    {
                      backgroundColor: selected ? colors.primary : colors.backgroundSecondary,
                      borderColor:     selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <InitialsAvatar name={p.name} size={22} />
                  <Text
                    style={[
                      text.bodySm,
                      { color: selected ? colors.textInverse : colors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {p.name}
                  </Text>
                  {selected && <X size={14} color={colors.textInverse as string} />}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        {selectedPersonId === null && (
          <Input
            label={sortedPersons.length > 0 ? 'Or add someone new' : 'Their name'}
            placeholder="e.g. Tobi"
            value={newName}
            onChangeText={setNewName}
            autoCapitalize="words"
          />
        )}

        {/* Amount */}
        <View style={{ marginTop: spacing[3] }}>
          <AmountInput
            label={`Amount (${currency.symbol})`}
            value={amount}
            onChange={setAmount}
            asBottomSheetInput
          />
        </View>

        {/* Dates */}
        <View style={[styles.dateRow, { marginTop: spacing[3], gap: spacing[3] }]}>
          <Pressable
            style={[styles.dateBtn, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
            onPress={() => setPickerFor('incurred')}
          >
            <CalendarDays size={16} color={colors.textSecondary as string} />
            <View>
              <Text style={[text.caption, { color: colors.textTertiary }]}>Date</Text>
              <Text style={[text.bodySm, { color: colors.text }]}>{friendlyDateInput(incurredOn)}</Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.dateBtn, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
            onPress={() => setPickerFor('due')}
          >
            <CalendarDays size={16} color={colors.textSecondary as string} />
            <View style={{ flex: 1 }}>
              <Text style={[text.caption, { color: colors.textTertiary }]}>Due date (optional)</Text>
              <Text style={[text.bodySm, { color: dueOn ? colors.text : colors.textTertiary }]}>
                {dueOn ? friendlyDateInput(dueOn) : 'Open-ended'}
              </Text>
            </View>
            {dueOn && (
              <Pressable hitSlop={8} onPress={() => setDueOn(null)}>
                <X size={16} color={colors.textTertiary as string} />
              </Pressable>
            )}
          </Pressable>
        </View>

        {/* Note */}
        <View style={{ marginTop: spacing[3] }}>
          <Input
            label="Note (optional)"
            placeholder={owedToMe ? 'e.g. School fees loan' : 'e.g. Borrowed for rent'}
            value={note}
            onChangeText={setNote}
            autoCapitalize="sentences"
          />
        </View>

        {/* Save */}
        <View style={{ marginTop: spacing[5] }}>
          <Button
            label={owedToMe ? 'Log — owed to me' : 'Log — I owe'}
            onPress={handleSave}
            disabled={!canSave}
            loading={saving}
            fullWidth
          />
        </View>
      </ScrollView>

      {/* Date pickers */}
      <UgwoDatePicker
        isOpen={pickerFor === 'incurred'}
        value={incurredOn}
        onChange={(iso) => setIncurredOn(iso)}
        onClose={() => setPickerFor(null)}
        title="When was it given?"
      />
      <UgwoDatePicker
        isOpen={pickerFor === 'due'}
        value={dueOn ?? todayStr()}
        minDate={incurredOn}
        onChange={(iso) => setDueOn(iso)}
        onClose={() => setPickerFor(null)}
        title="When is it due?"
      />
    </SheetModal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionLabel: {
    marginBottom: 8,
  },
  personChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingVertical:   6,
    paddingHorizontal: 10,
    borderRadius:      100,
    borderWidth:       1,
    maxWidth:          180,
  },
  dateRow: {
    flexDirection: 'column',
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
