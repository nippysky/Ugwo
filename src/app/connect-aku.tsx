/**
 * Connect Akù — optional, opt-in link to the user's own Akù account.
 *
 * Once connected, new debts and repayments quietly mirror into Akù as
 * expense/income records (category: Loans) so your Akù financial picture
 * stays complete without double-entry. Entirely one-way (Ụgwọ → Akù), and
 * gated on both accounts using the same currency — see aku-link.store.ts.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, History, Info, Sparkles, TriangleAlert } from 'lucide-react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Input, Button } from '../components/ui';
import { useTheme } from '../theme';
import { useUIStore } from '../store/ui.store';
import { useAkuLinkStore } from '../store/aku-link.store';
import { useLedgerStore } from '../store/ledger.store';

export default function ConnectAkuScreen() {
  const { colors, spacing, text } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showToast, currency } = useUIStore();

  const {
    connected, akuName, akuEmail, akuCurrencyCode, akuCurrencySymbol,
    currencyMismatch, isConnecting, error,
    requestOtp, confirmOtp, disconnect, clearError,
  } = useAkuLinkStore();

  const [step, setStep]   = useState<'input' | 'sent'>('input');
  const [email, setEmail] = useState('');
  const [otp, setOtp]     = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError]     = useState<string | null>(null);
  const [resending, setResending]   = useState(false);
  const [resent, setResent]         = useState(false);
  // Opt-in, default OFF — see backfillHistoryToAku's doc comment for why this
  // must never run silently: anyone who already logged these same loans in
  // Akù by hand before connecting would end up double-counted.
  const [backfillOpted, setBackfillOpted] = useState(false);
  const [backfilling, setBackfilling]     = useState(false);
  const otpRef = useRef<TextInput>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSendCode = useCallback(async () => {
    clearError();
    try {
      await requestOtp(email);
      setOtp('');
      setOtpError(null);
      setStep('sent');
    } catch {
      // error already surfaced via store's `error` field
    }
  }, [email, requestOtp, clearError]);

  const handleResend = useCallback(async () => {
    if (resending) return;
    setResending(true);
    setOtpError(null);
    setOtp('');
    clearError();
    try {
      await requestOtp(email);
      setResent(true);
      setTimeout(() => setResent(false), 4000);
      setTimeout(() => otpRef.current?.focus(), 100);
    } catch {
      // error already surfaced via store's `error` field, rendered below
    } finally {
      setResending(false);
    }
  }, [resending, email, requestOtp, clearError]);

  const handleOtpChange = useCallback(async (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setOtp(digits);
    setOtpError(null);

    if (digits.length === 6) {
      setOtpLoading(true);
      try {
        await confirmOtp(email, digits);
        showToast('success', 'Akù connected');

        if (backfillOpted) {
          setBackfilling(true);
          try {
            const result = await useLedgerStore.getState().backfillAkuHistory();
            const synced  = result.debtsSynced + result.repaymentsSynced;
            const skipped = result.debtsSkipped + result.repaymentsSkipped;
            const total   = synced + skipped;
            showToast(
              'info',
              total === 0
                ? 'No existing history to sync'
                : skipped > 0
                  ? `Synced ${synced} of ${total} past entries — ${skipped} skipped (different currency)`
                  : `Synced ${synced} past entr${synced === 1 ? 'y' : 'ies'} to Akù`,
            );
          } catch {
            showToast('error', "Couldn't backfill history — you can try again later");
          } finally {
            setBackfilling(false);
          }
        }

        router.back();
      } catch (err) {
        setOtpError(err instanceof Error ? err.message : 'Invalid code. Please try again.');
        setOtp('');
        setTimeout(() => otpRef.current?.focus(), 100);
      } finally {
        setOtpLoading(false);
      }
    }
  }, [email, confirmOtp, showToast, router, backfillOpted]);

  const handleDisconnect = useCallback(() => {
    Alert.alert(
      'Disconnect Akù?',
      'Ụgwọ will stop mirroring new debts and repayments to Akù. Your Akù account and its existing records are untouched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect', style: 'destructive',
          onPress: async () => {
            await disconnect();
            showToast('info', 'Akù disconnected');
          },
        },
      ],
    );
  }, [disconnect, showToast]);

  // ── Connected state ───────────────────────────────────────────────────────

  if (connected) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader
          title="Connect Akù"
          leftAction={{ icon: ArrowLeft, onPress: () => router.back(), accessibilityLabel: 'Back' }}
          style={{ paddingTop: insets.top }}
        />
        <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 16 }}>
          <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
            <View style={[styles.statusIcon, { backgroundColor: colors.primary + '18' }]}>
              <CheckCircle2 size={22} color={colors.primary as string} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[text.bodyMedium, { color: colors.text }]}>{akuName}</Text>
              <Text style={[text.caption, { color: colors.textTertiary }]}>{akuEmail}</Text>
            </View>
          </View>

          {currencyMismatch ? (
            <View style={[styles.warnCard, { backgroundColor: colors.dangerBg, borderColor: colors.danger }]}>
              <TriangleAlert size={16} color={colors.danger as string} />
              <Text style={[text.bodySm, { color: colors.danger, flex: 1 }]}>
                Ụgwọ's current default is {currency.code} but your Akù account uses {akuCurrencyCode ?? '—'}.
                Debts logged in {currency.code} from now on won't sync — switch one under More &gt;
                Currency (Ụgwọ) or inside Akù itself. Entries in {akuCurrencyCode ?? 'Akù’s currency'} still sync fine.
              </Text>
            </View>
          ) : (
            <Text style={[text.bodySm, { color: colors.textSecondary }]}>
              New debts and repayments quietly mirror into Akù as expense/income entries under the
              Loans category — nothing to do on your end.
              {akuCurrencySymbol ? ` Currency: ${currency.code} ${akuCurrencySymbol}.` : ''}
            </Text>
          )}

          <Pressable onPress={handleDisconnect} style={styles.disconnectBtn}>
            <Text style={[text.bodyMedium, { color: colors.danger }]}>Disconnect Akù</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── OTP sent state ────────────────────────────────────────────────────────

  if (step === 'sent') {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader
          title="Connect Akù"
          leftAction={{ icon: ArrowLeft, onPress: () => setStep('input'), accessibilityLabel: 'Back' }}
          style={{ paddingTop: insets.top }}
        />
        <KeyboardAwareScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, gap: 4 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[text.body, { color: colors.textSecondary }]}>
            We sent a 6-digit code to{' '}
            <Text style={{ color: colors.text, fontFamily: 'PlusJakartaSans_500Medium' }}>{email}</Text>.
          </Text>

          <View style={{ marginTop: spacing[6] }}>
            <Text style={[text.label, { color: colors.textSecondary, marginBottom: spacing[3] }]}>
              Enter code
            </Text>
            <TextInput
              ref={otpRef}
              value={otp}
              onChangeText={handleOtpChange}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
              editable={!otpLoading}
              placeholder="——————"
              placeholderTextColor={colors.border as string}
              style={[
                styles.otpInput,
                {
                  backgroundColor: colors.backgroundSecondary,
                  borderColor: otpError ? colors.danger : otp.length > 0 ? colors.primary : colors.border,
                  color: colors.text,
                },
              ]}
            />
            {otpLoading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing[3] }}>
                <ActivityIndicator size="small" color={colors.primary as string} />
                <Text style={[text.bodySm, { color: colors.textSecondary, marginLeft: spacing[2] }]}>
                  {backfilling ? 'Syncing your existing history…' : 'Verifying…'}
                </Text>
              </View>
            ) : otpError ? (
              <Text style={[text.bodySm, { color: colors.danger, marginTop: spacing[2] }]}>{otpError}</Text>
            ) : null}
          </View>

          <View style={{ marginTop: spacing[6] }}>
            {error ? (
              <Text style={[text.bodySm, { color: colors.danger, textAlign: 'center', marginBottom: spacing[3] }]}>
                {error}
              </Text>
            ) : null}
            <Button
              label={resending ? 'Sending…' : resent ? 'Code sent!' : "Didn't get it? Resend code"}
              variant="secondary"
              fullWidth
              loading={resending}
              disabled={resending || otpLoading}
              onPress={handleResend}
            />
          </View>
        </KeyboardAwareScrollView>
      </View>
    );
  }

  // ── Email input state ─────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Connect Akù"
        leftAction={{ icon: ArrowLeft, onPress: () => router.back(), accessibilityLabel: 'Back' }}
        style={{ paddingTop: insets.top }}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, gap: 4 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.introCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
          <Sparkles size={20} color={colors.primary as string} />
          <Text style={[text.bodySm, { color: colors.textSecondary, marginTop: 8 }]}>
            Link your Akù account so money you lend, borrow, and pay back here shows up there too —
            as expenses and income under a Loans category. Fully optional, and only flows one way.
          </Text>
        </View>

        <View style={{ marginTop: 20 }}>
          <Input
            label="Your Akù email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="done"
            onSubmitEditing={handleSendCode}
          />
          {error ? (
            <Text style={[text.bodySm, { color: colors.danger, marginTop: 8 }]}>{error}</Text>
          ) : null}
        </View>

        <View style={[styles.backfillCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
          <View style={styles.backfillHeaderRow}>
            <View style={[styles.backfillIcon, { backgroundColor: colors.warning + '18' }]}>
              <History size={17} color={colors.warning as string} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[text.bodySm, { color: colors.text, fontFamily: 'PlusJakartaSans_600SemiBold' }]}>
                Sync existing history
              </Text>
              <Text style={[text.caption, { color: colors.textTertiary, marginTop: 1 }]}>
                One-time copy of past debts &amp; repayments into Akù
              </Text>
            </View>
            <Switch
              value={backfillOpted}
              onValueChange={setBackfillOpted}
              trackColor={{ true: colors.warning as string, false: colors.border as string }}
              thumbColor="#FFFFFF"
              accessibilityLabel="Sync existing history to Akù"
            />
          </View>

          <View
            style={[
              styles.backfillStatus,
              { backgroundColor: backfillOpted ? colors.warningBg : colors.backgroundSecondary },
            ]}
          >
            {backfillOpted
              ? <TriangleAlert size={14} color={colors.warning as string} />
              : <Info size={14} color={colors.textTertiary as string} />}
            <Text
              style={[
                text.caption,
                { color: backfillOpted ? colors.warning : colors.textTertiary, flex: 1, lineHeight: 16 },
              ]}
            >
              {backfillOpted
                ? "Already logged these loans in Akù by hand? They'll be duplicated. Leave this off if you're not sure."
                : 'Off — only new activity syncs from today forward. Nothing already in Akù is touched.'}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 20 }}>
          <Button
            label="Send code"
            variant="primary"
            fullWidth
            disabled={!emailValid || isConnecting}
            loading={isConnecting}
            onPress={handleSendCode}
          />
        </View>

        <Text style={[text.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: 16 }]}>
          Don't have an Akù account yet?{' '}
          <Text
            style={{ color: colors.primary }}
            onPress={() => Linking.openURL('https://aku.nippysky.com').catch(() => {})}
          >
            Get Akù
          </Text>{' '}
          — sending a code here creates one automatically.
        </Text>
      </KeyboardAwareScrollView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  statusCard: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    padding:       16,
    borderRadius:  18,
    borderWidth:   1,
  },
  statusIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  warnCard: {
    flexDirection: 'row',
    gap:           10,
    padding:       14,
    borderRadius:  14,
    borderWidth:   1,
  },
  disconnectBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  introCard: {
    borderRadius: 16,
    borderWidth:  1,
    padding:      16,
  },
  otpInput: {
    height:        64,
    borderWidth:   1.5,
    borderRadius:  14,
    fontSize:      28,
    letterSpacing: 10,
    fontFamily:    'PlusJakartaSans_600SemiBold',
  },
  backfillCard: {
    borderRadius: 16,
    borderWidth:  1,
    padding:      14,
    marginTop:    16,
    gap:          12,
  },
  backfillHeaderRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
  },
  backfillIcon: {
    width:  36,
    height: 36,
    borderRadius: 12,
    alignItems:     'center',
    justifyContent: 'center',
  },
  backfillStatus: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           8,
    padding:       10,
    borderRadius:  10,
  },
});
