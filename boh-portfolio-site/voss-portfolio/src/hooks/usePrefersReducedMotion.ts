import { useContext } from 'react';
import { MotionContext } from '../components/MotionProvider';

export function usePrefersReducedMotion(): boolean {
  return !useContext(MotionContext).enabled;
}
