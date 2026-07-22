/**
 * More — profile, security, preferences, export, NIPPYSKY family, account.
 */
import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { startOfMonth, endOfMonth, subMonths, format as formatDate } from 'date-fns';
import {
  Banknote,
  CalendarRange,
  ChevronRight,
  ExternalLink,
  FileDown,
  Fingerprint,
  LogOut,
  Moon,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react-native';
import { useTheme } from '../../theme';
import { FontFamily, FontSize } from '../../theme/typography';
import { Layout, Spacing } from '../../theme/spacing';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { SheetModal } from '../../components/ui/SheetModal';
import { UgwoDatePicker } from '../../components/ui/UgwoDatePicker';
import { useAuthStore } from '../../store/auth.store';
import { useLedgerStore } from '../../store/ledger.store';
import { useUIStore } from '../../store/ui.store';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import { updateName } from '../../lib/api-client';
import { exportStatementPdf, type StatementRange } from '../../lib/pdf-export';
import { friendlyDate } from '../../lib/reminder-message';
import { todayStr } from '../../lib/debt-math';

const SITE = 'https://ugwo.nippysky.com';

export default function MoreScreen() {
  const { colors, text, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const user      = useAuthStore((s) => s.user);
  const biometric = useAuthStore((s) => s.biometric);
  const setupBiometric   = useAuthStore((s) => s.setupBiometric);
  const disableBiometric = useAuthStore((s) => s.disableBiometric);
  const signOut          = useAuthStore((s) => s.signOut);
  const deleteAccount    = useAuthStore((s) => s.deleteAccount);
  const updateUser       = useAuthStore((s) => s.updateUser);

  const { persons, debts, repayments } = useLedgerStore();
  const { themeMode, setThemeMode, currency, showToast } = useUIStore();
  const { symbol } = useCurrencyFormat();

  const [nameSheet, setNameSheet] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting]   = useState(false);

  // Statement export — date-range picker
  const [rangeSheet, setRangeSheet] = useState(false);
  const [rangeFrom, setRangeFrom]   = useState<string | null>(null);
  const [rangeTo, setRangeTo]       = useState<string | null>(null);
  const [datePickerFor, setDatePickerFor] = useState<'from' | 'to' | null>(null);

  // ── Handlers ────────────────────────────────────────────────────────────

  const toggleLock = async (value: boolean) => {
    if (value) {
      const ok = await setupBiometric();
      if (!ok) {
        showToast('info', 'Add a screen lock in your device settings first.');
      }
    } else {
      await disableBiometric();
    }
  };

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name) return;
    setSavingName(true);
    try {
      await updateName(name);
      updateUser({ name });
      setNameSheet(false);
      showToast('success', 'Name updated');
    } catch {
      showToast('error', 'Could not update your name.');
    } finally {
      setSavingName(false);
    }
  };

  const handleExport = async (range?: StatementRange) => {
    if (!user || exporting) return;
    setExporting(true);
    try {
      await exportStatementPdf({
        userName: user.name,
        persons,
        debts,
        repayments,
        symbol,
        range,
      });
      setRangeSheet(false);
    } catch {
      showToast('error', 'Could not create the PDF.');
    } finally {
      setExporting(false);
    }
  };

  const openRangeSheet = () => {
    setRangeFrom(null);
    setRangeTo(null);
    setRangeSheet(true);
  };

  const applyPreset = (preset: 'all' | 'thisMonth' | 'lastMonth') => {
    if (preset === 'all') {
      setRangeFrom(null);
      setRangeTo(null);
    } else if (preset === 'thisMonth') {
      setRangeFrom(formatDate(startOfMonth(new Date()), 'yyyy-MM-dd'));
      setRangeTo(todayStr());
    } else {
      const last = subMonths(new Date(), 1);
      setRangeFrom(formatDate(startOfMonth(last), 'yyyy-MM-dd'));
      setRangeTo(formatDate(endOfMonth(last), 'yyyy-MM-dd'));
    }
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Sign out?',
      'Your data stays encrypted on the server — sign back in any time to restore it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
      ],
    );
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete your account?',
      'This permanently erases your account and every encrypted record from our server. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
            } catch {
              setDeleting(false);
              showToast('error', "Couldn't reach the server. Please try again.");
            }
          },
        },
      ],
    );
  };

  const cycleTheme = () => {
    const next = themeMode === 'system' ? 'dark' : themeMode === 'dark' ? 'light' : 'system';
    setThemeMode(next);
  };

  // ── Row primitive (plain render function — react-compiler friendly) ─────

  const renderRow = ({
    icon: Icon,
    label,
    value,
    onPress,
    danger = false,
    right,
  }: {
    icon: React.ElementType;
    label: string;
    value?: string;
    onPress?: () => void;
    danger?: boolean;
    right?: React.ReactNode;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress && !right}
      style={({ pressed }) => [
        styles.rowItem,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? colors.dangerBg : colors.backgroundTertiary }]}>
        <Icon size={17} color={(danger ? colors.danger : colors.textSecondary) as string} />
      </View>
      <Text style={[text.body, { color: danger ? colors.danger : colors.text, flex: 1 }]}>
        {label}
      </Text>
      {value ? (
        <Text style={[text.bodySm, { color: colors.textTertiary }]}>{value}</Text>
      ) : null}
      {right ?? (onPress ? <ChevronRight size={17} color={colors.textTertiary as string} /> : null)}
    </Pressable>
  );

  const renderSection = (title: string, children: React.ReactNode) => (
    <View style={{ gap: 2 }}>
      <Text style={[text.label, { color: colors.textTertiary, marginBottom: 6 }]}>{title}</Text>
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
        {children}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop:        insets.top + Spacing[4],
          paddingBottom:     120,
          paddingHorizontal: Layout.screenPadding,
          gap:               Spacing[5],
        }}
      >
        {/* Header */}
        <View>
          <Text style={[text.bodySm, { color: colors.textTertiary }]}>Settings &amp; more</Text>
          <Text style={[styles.screenTitle, { color: colors.text }]}>More</Text>
        </View>

        {/* Profile card — plain name + email, no avatar */}
        <Pressable
          onPress={() => { setNameDraft(user?.name ?? ''); setNameSheet(true); }}
          style={[styles.profile, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[text.bodyMedium, { color: colors.text }]}>{user?.name}</Text>
            <Text style={[text.caption, { color: colors.textTertiary }]}>{user?.email}</Text>
          </View>
          <ChevronRight size={17} color={colors.textTertiary as string} />
        </Pressable>

        {/* Security */}
        {renderSection('SECURITY & PRIVACY', <>
          {renderRow({
            icon: Fingerprint,
            label: 'App lock',
            right: (
              <Switch
                value={biometric.enabled}
                onValueChange={toggleLock}
                trackColor={{ true: colors.primary as string, false: colors.border as string }}
                thumbColor="#FFFFFF"
              />
            ),
          })}
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          {renderRow({ icon: ShieldCheck, label: 'How your data is protected', onPress: () => Linking.openURL(`${SITE}/privacy`) })}
        </>)}

        {/* Preferences */}
        {renderSection('PREFERENCES', <>
          {renderRow({ icon: Banknote, label: 'Currency', value: `${currency.code} ${currency.symbol}`, onPress: () => router.push('/currency' as never) })}
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          {renderRow({ icon: Moon, label: 'Appearance', value: themeMode === 'system' ? 'System' : themeMode === 'dark' ? 'Dark' : 'Light', onPress: cycleTheme })}
        </>)}

        {/* Data */}
        {renderSection('YOUR DATA', <>
          {renderRow({ icon: FileDown, label: exporting ? 'Preparing statement…' : 'Export PDF statement', onPress: openRangeSheet })}
        </>)}

        {/* NIPPYSKY family */}
        {renderSection('MORE FROM NIPPYSKY', <>
          {renderRow({ icon: Sparkles, label: 'Akù — your financial companion', onPress: () => Linking.openURL('https://aku.nippysky.com'), right: <ExternalLink size={15} color={colors.textTertiary as string} /> })}
        </>)}

        {/* Account */}
        {renderSection('ACCOUNT', <>
          {renderRow({ icon: LogOut, label: 'Sign out', onPress: confirmSignOut })}
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          {renderRow({ icon: Trash2, label: deleting ? 'Deleting…' : 'Delete account', onPress: confirmDelete, danger: true })}
        </>)}

        {/* Footer */}
        <Text style={[styles.footer, { color: colors.textTertiary }]}>
          Ụgwọ · A venture by NIPPYSKY{'\n'}By the makers of Akù
        </Text>
      </ScrollView>

      {/* Edit name sheet */}
      <SheetModal visible={nameSheet} onClose={() => setNameSheet(false)}>
        <Text style={[text.screenTitle, { color: colors.text, marginBottom: Spacing[4] }]}>Your name</Text>
        <Input
          label="Name"
          value={nameDraft}
          onChangeText={setNameDraft}
          autoCapitalize="words"
          placeholder="Your name"
        />
        <View style={{ marginTop: Spacing[4] }}>
          <Button
            label="Save"
            onPress={saveName}
            loading={savingName}
            disabled={!nameDraft.trim()}
            fullWidth
          />
        </View>
      </SheetModal>

      {/* Statement export — pick a date range */}
      <SheetModal visible={rangeSheet} onClose={() => setRangeSheet(false)}>
        <Text style={[text.screenTitle, { color: colors.text, marginBottom: 4 }]}>
          Export statement
        </Text>
        <Text style={[text.bodySm, { color: colors.textSecondary, marginBottom: Spacing[4] }]}>
          Choose which period the PDF should cover.
        </Text>

        <View style={styles.presetRow}>
          {([
            { key: 'all',       label: 'All time' },
            { key: 'thisMonth', label: 'This month' },
            { key: 'lastMonth', label: 'Last month' },
          ] as const).map((p) => (
            <Pressable
              key={p.key}
              onPress={() => applyPreset(p.key)}
              style={[styles.presetChip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            >
              <Text style={[text.bodySm, { color: colors.text }]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionLabel, text.label, { color: colors.textTertiary }]}>OR PICK A CUSTOM RANGE</Text>
        <View style={styles.dateRow}>
          <Pressable
            style={[styles.dateBtn, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
            onPress={() => setDatePickerFor('from')}
          >
            <CalendarRange size={16} color={colors.textSecondary as string} />
            <View>
              <Text style={[text.caption, { color: colors.textTertiary }]}>From</Text>
              <Text style={[text.bodySm, { color: rangeFrom ? colors.text : colors.textTertiary }]}>
                {rangeFrom ? friendlyDate(rangeFrom) : 'Earliest'}
              </Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.dateBtn, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
            onPress={() => setDatePickerFor('to')}
          >
            <CalendarRange size={16} color={colors.textSecondary as string} />
            <View>
              <Text style={[text.caption, { color: colors.textTertiary }]}>To</Text>
              <Text style={[text.bodySm, { color: rangeTo ? colors.text : colors.textTertiary }]}>
                {rangeTo ? friendlyDate(rangeTo) : 'Today'}
              </Text>
            </View>
          </Pressable>
        </View>

        <View style={{ marginTop: Spacing[5] }}>
          <Button
            label={exporting ? 'Preparing…' : 'Export PDF'}
            onPress={() => handleExport({ from: rangeFrom, to: rangeTo })}
            loading={exporting}
            disabled={exporting}
            fullWidth
          />
        </View>
      </SheetModal>

      <UgwoDatePicker
        isOpen={datePickerFor === 'from'}
        value={rangeFrom ?? todayStr()}
        maxDate={rangeTo ?? undefined}
        onChange={(iso) => setRangeFrom(iso)}
        onClose={() => setDatePickerFor(null)}
        title="From which date?"
      />
      <UgwoDatePicker
        isOpen={datePickerFor === 'to'}
        value={rangeTo ?? todayStr()}
        minDate={rangeFrom ?? undefined}
        onChange={(iso) => setRangeTo(iso)}
        onClose={() => setDatePickerFor(null)}
        title="Through which date?"
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenTitle: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['3xl'],
    letterSpacing: -0.8,
    marginTop:     2,
  },
  profile: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           14,
    padding:       16,
    borderRadius:  18,
    borderWidth:   1,
  },
  section: {
    borderRadius: 18,
    borderWidth:  1,
    overflow:     'hidden',
  },
  rowItem: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               12,
    paddingVertical:   13,
    paddingHorizontal: 14,
  },
  rowIcon: {
    width:          32,
    height:         32,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  divider: {
    height:     1,
    marginLeft: 58,
  },
  footer: {
    textAlign:  'center',
    fontFamily: FontFamily.sansRegular,
    fontSize:   FontSize.xs,
    lineHeight: FontSize.xs * 1.6,
    marginTop:  Spacing[2],
  },

  // Statement export sheet
  presetRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
    marginBottom:  Spacing[5],
  },
  presetChip: {
    paddingVertical:   9,
    paddingHorizontal: 14,
    borderRadius:      100,
    borderWidth:       1,
  },
  sectionLabel: {
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    gap:           Spacing[3],
  },
  dateBtn: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    borderWidth:       1,
    borderRadius:      14,
    paddingVertical:   10,
    paddingHorizontal: 14,
  },
});
