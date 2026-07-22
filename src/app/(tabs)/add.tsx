/**
 * add — placeholder route for the center FAB tab.
 *
 * This screen never actually renders: the FAB's tabPress listener in
 * (tabs)/_layout.tsx always calls e.preventDefault() and opens the shared
 * direction picker instead of navigating here. The route still needs to
 * exist for expo-router to register the tab, so if it's ever somehow
 * reached (e.g. a stale deep link) it just bounces back to Home.
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function AddPlaceholder() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/(tabs)' as never);
  }, []);

  return null;
}
