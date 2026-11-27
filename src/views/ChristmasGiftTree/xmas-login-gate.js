export function resolveXmasPrimaryAction({ isLoggedIn, isSignedUp, ctaDisabled }) {
  if (ctaDisabled) return 'noop';
  if (!isLoggedIn) return 'login';
  return isSignedUp ? 'leave' : 'intro';
}
