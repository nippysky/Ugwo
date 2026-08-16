/**
 * FAQ — answers to the questions people actually ask about Ụgwọ: privacy,
 * offline behaviour, reminders, currencies, account deletion. A plain
 * expand/collapse list, reachable from More.
 */
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronDown } from 'lucide-react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useTheme } from '../theme';
import { Spacing, Layout } from '../theme/spacing';
import { FontFamily, FontSize } from '../theme/typography';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'What does "Ụgwọ" mean?',
    a: '"Ụgwọ" is Igbo for debt, or an obligation owed. It\'s also the name of NIPPYSKY\'s sister app, Akù — Igbo for wealth — which helps you track everyday income and spending. Ụgwọ handles the money that moves between people; Akù handles the money that\'s yours.',
  },
  {
    q: 'Is my data private? Can anyone else see my ledger?',
    a: 'Yes, completely. Every amount, name, and note is encrypted on your device before it ever reaches our server — we store only scrambled data we cannot read. Nobody else, including us, can see what you owe or who owes you.',
  },
  {
    q: 'Can the person I owe (or who owes me) see my Ụgwọ entries?',
    a: "No. Ụgwọ is entirely private to you. The only way someone else sees anything is if you choose to send them a reminder message yourself — nothing is ever shared automatically.",
  },
  {
    q: 'What happens if I lose my phone or get a new one?',
    a: 'Sign in with the same email on the new device and your whole ledger restores automatically, still fully encrypted. Nothing is tied to the physical phone.',
  },
  {
    q: 'Does Ụgwọ work without internet?',
    a: 'Yes. Logging debts, recording repayments, and browsing your ledger all work fully offline. Everything quietly syncs once you\'re back online — nothing is lost in the meantime.',
  },
  {
    q: 'Will I get reminded automatically, or do I have to remember myself?',
    a: "Both. Ụgwọ schedules its own reminders as a due date approaches, plus a monthly recap of what came in and what's still out there. You can also send a one-tap, friendly WhatsApp reminder to anyone whenever you like.",
  },
  {
    q: 'What currencies does Ụgwọ support?',
    a: 'Several — set your default under More > Currency. Amounts you log keep the currency they were entered in.',
  },
  {
    q: 'I made a mistake logging a debt — can I fix or remove it?',
    a: "Yes. Open the person's ledger and long-press any entry to delete it, or tap it to record a repayment against it.",
  },
  {
    q: 'Is Ụgwọ free to use?',
    a: 'Yes, Ụgwọ is free.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Go to More > Delete account. This permanently and immediately erases your account and every record from our server — it cannot be undone.',
  },
];

export default function FAQScreen() {
  const { colors, text } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="FAQ"
        leftAction={{ icon: ArrowLeft, onPress: () => router.back(), accessibilityLabel: 'Back' }}
        style={{ paddingTop: insets.top }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal:  Layout.screenPadding,
          paddingBottom:      insets.bottom + Spacing[8],
          paddingTop:          Spacing[2],
          gap:                 Spacing[2],
        }}
      >
        {FAQS.map((item, i) => {
          const open = openIndex === i;
          return (
            <Pressable
              key={item.q}
              onPress={() => setOpenIndex(open ? null : i)}
              style={[styles.item, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
            >
              <View style={styles.itemHead}>
                <Text style={[text.bodyMedium, { color: colors.text, flex: 1 }]}>{item.q}</Text>
                <ChevronDown
                  size={18}
                  color={colors.textTertiary as string}
                  style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
                />
              </View>
              {open && (
                <Text style={[text.bodySm, { color: colors.textSecondary, marginTop: Spacing[2] }]}>
                  {item.a}
                </Text>
              )}
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => Linking.openURL('mailto:contact@nippysky.com').catch(() => {})}
          style={[styles.contactCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.borderLight }]}
        >
          <Text style={[text.bodyMedium, { color: colors.text }]}>Still have a question?</Text>
          <Text style={[text.bodySm, { color: colors.primary, marginTop: 2 }]}>contact@nippysky.com</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  item: {
    borderRadius:  16,
    borderWidth:   1,
    padding:       14,
  },
  itemHead: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  contactCard: {
    borderRadius:  16,
    borderWidth:   1,
    padding:       16,
    alignItems:    'center',
    marginTop:     Spacing[3],
  },
});
