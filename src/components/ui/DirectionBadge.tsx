/**
 * DirectionBadge — replaces the old initials-avatar everywhere a person or
 * debt needs a quick visual identity. Ụgwọ is about direction of money, not
 * who's who by initials, so this shows a simple incoming/outgoing arrow
 * instead: amber + arrow-in for "owed to me", red + arrow-out for "I owe".
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { useTheme } from '../../theme';

interface DirectionBadgeProps {
  /** true = money is owed to the user; false = the user owes it. */
  owedToMe: boolean;
  size?: number;
}

export function DirectionBadge({ owedToMe, size = 44 }: DirectionBadgeProps) {
  const { colors } = useTheme();
  const Icon = owedToMe ? ArrowDownLeft : ArrowUpRight;
  const iconColor = (owedToMe ? colors.owedToMe : colors.iOwe) as string;
  const bg = (owedToMe ? colors.owedToMeBg : colors.iOweBg) as string;

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
      accessibilityLabel={owedToMe ? 'Owed to you' : 'You owe'}
    >
      <Icon size={Math.round(size * 0.42)} color={iconColor} strokeWidth={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems:     'center',
    justifyContent: 'center',
  },
});
