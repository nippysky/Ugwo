/**
 * More — profile, security, preferences, support, NIPPYSKY family, account.
 *
 * Statement/PDF export intentionally lives only in Akù — Ụgwọ stays a plain,
 * private ledger and doesn't produce exportable documents.
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
import {
  Banknote,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Fingerprint,
  LogOut,
  Moon,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Trash2,
} from 'lucide-react-native';
import { useTheme } from '../../theme';
import { FontFamily, FontSize } from '../../theme/typography';
import { Layout, Spacing } from '../../theme/spacing';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { SheetModal } from '../../components/ui/SheetModal';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import { useAkuLinkStore } from '../../store/aku-link.store';
import { updateName } from '../../lib/api-client';

const SITE = 'https://ugwo.nippysky.com';

export default function MoreScreen() {
  const { colors, text } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const user      = useAuthStore((s) => s.user);
  const biometric = useAuthStore((s) => s.biometric);
  const setupBiometric   = useAuthStore((s) => s.setupBiometric);
  const disableBiometric = useAuthStore((s) => s.disableBiometric);
  const signOut          = useAuthStore((s) => s.signOut);
  const deleteAccount    = useAuthStore((s) => s.deleteAccount);
  const updateUser       = useAuthStore((s) => s.updateUser);

  const { themeMode, setThemeMode, currency, showToast } = useUIStore();
  const akuConnected        = useAkuLinkStore((s) => s.connected);
  const akuName             = useAkuLinkStore((s) => s.akuName);
  const akuCurrencyMismatch = useAkuLinkStore((s) => s.currencyMismatch);

  const [nameSheet, setNameSheet] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting]   = useState(false);

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

        {/* Support */}
        {renderSection('SUPPORT', <>
          {renderRow({ icon: CircleHelp, label: 'FAQ', onPress: () => router.push('/faq' as never) })}
        </>)}

        {/* Connect Akù */}
        {renderSection('AKÙ SYNC', <>
          {renderRow({
            icon: akuCurrencyMismatch ? TriangleAlert : Sparkles,
            label: akuConnected ? `Connected · ${akuName}` : 'Connect Akù',
            value: akuConnected && akuCurrencyMismatch ? 'Paused' : undefined,
            danger: akuConnected && akuCurrencyMismatch,
            onPress: () => router.push('/connect-aku' as never),
          })}
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
});
