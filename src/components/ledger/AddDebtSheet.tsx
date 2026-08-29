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
// NOTE: `ScrollView` above is still used for the horizontal person-suggestion
// chip row — only the OUTER vertical scroller was removed (see below).
import { CalendarDays, X } from 'lucide-react-native';
import { SheetModal } from '../ui/SheetModal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { AmountInput } from '../ui/AmountInput';
import { UgwoDatePicker } from '../ui/UgwoDatePicker';
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

/** How many matching people to show at once — keeps the picker usable no
 *  matter how many people are in the ledger (10 or 1,000). */
const MAX_SUGGESTIONS = 6;

export function AddDebtSheet({ visible, direction, onClose, personId = null }: AddDebtSheetProps) {
  const { colors, text, spacing } = useTheme();
  const user     = useAuthStore((s) => s.user);
  const persons  = useLedgerStore((s) => s.persons);
  const debts    = useLedgerStore((s) => s.debts);
  const addDebt  = useLedgerStore((s) => s.addDebt);
  const addPerson = useLedgerStore((s) => s.addPerson);
  const currency = useUIStore((s) => s.currency);
  const showToast = useUIStore((s) => s.showToast);

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(personId);
  const [query, setQuery]         = useState('');
  const [amount, setAmount]       = useState(0);
  const [incurredOn, setIncurredOn] = useState(todayStr());
  const [dueOn, setDueOn]         = useState<string | null>(null);
  const [note, setNote]           = useState('');
  const [pickerFor, setPickerFor] = useState<'incurred' | 'due' | null>(null);
  const [saving, setSaving]       = useState(false);

  const owedToMe = direction === 'owed_to_me';
  const selectedPerson = persons.find((p) => p.id === selectedPersonId) ?? null;

  // Most-recently-logged-with first, so the people you deal with often
  // surface without typing anything — a search field, not an endless list.
  const lastActivityByPerson = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of debts) {
      const existing = map.get(d.personId);
      if (!existing || d.createdAt > existing) map.set(d.personId, d.createdAt);
    }
    return map;
  }, [debts]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ranked = [...persons].sort((a, b) => {
      const aT = lastActivityByPerson.get(a.id) ?? a.createdAt;
      const bT = lastActivityByPerson.get(b.id) ?? b.createdAt;
      return bT.localeCompare(aT);
    });
    const matches = q ? ranked.filter((p) => p.name.toLowerCase().includes(q)) : ranked;
    return matches.slice(0, MAX_SUGGESTIONS);
  }, [persons, query, lastActivityByPerson]);

  const exactMatch = persons.some((p) => p.name.trim().toLowerCase() === query.trim().toLowerCase());

  const reset = () => {
    setSelectedPersonId(personId);
    setQuery('');
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
    amount > 0 && (selectedPersonId !== null || query.trim().length > 0);

  const handleSave = async () => {
    if (!user || !canSave || saving) return;
    setSaving(true);
    try {
      let pid = selectedPersonId;
      if (!pid) {
        const person = await addPerson(user.id, query.trim());
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
      {/*
        No nested vertical ScrollView here — SheetModal's own
        BottomSheetScrollView is the ONE scroll container for this sheet.
        Wrapping content in a second ScrollView (as this used to do) broke
        gorhom's `keyboardBehavior="interactive"` handling: only the outer
        BottomSheetScrollView participates in the sheet's keyboard-avoidance,
        so inputs living inside a nested inner ScrollView never got scrolled
        above the keyboard — the classic "keyboard covers the input" bug.
      */}
      <View style={{ paddingBottom: spacing[6] }}>
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
        {selectedPerson ? (
          <Pressable
            onPress={() => setSelectedPersonId(null)}
            style={[styles.selectedChip, { backgroundColor: colors.primary, borderColor: colors.primary }]}
          >
            <Text style={[text.bodyMedium, { color: colors.textInverse, flex: 1 }]} numberOfLines={1}>
              {selectedPerson.name}
            </Text>
            <X size={16} color={colors.textInverse as string} />
          </Pressable>
        ) : (
          <>
            <Input
              label={persons.length > 0 ? 'Search or add someone new' : 'Their name'}
              placeholder="e.g. Tobi"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="words"
            />
            {suggestions.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: spacing[2] }}
                contentContainerStyle={{ gap: spacing[2] }}
                keyboardShouldPersistTaps="handled"
              >
                {suggestions.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => { setSelectedPersonId(p.id); setQuery(''); }}
                    style={[styles.personChip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                  >
                    <Text style={[text.bodySm, { color: colors.text }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {query.trim().length > 0 && !exactMatch && (
              <Text style={[text.caption, { color: colors.textTertiary, marginTop: spacing[2] }]}>
                No match — "{query.trim()}" will be logged as a new person.
              </Text>
            )}
          </>
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
      </View>

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
  selectedChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    paddingVertical:   12,
    paddingHorizontal: 14,
    borderRadius:      14,
    borderWidth:       1,
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
