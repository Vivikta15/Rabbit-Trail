'use client';

import { useEffect } from 'react';
import { trackEvent } from '../../hooks/use-track';

// Counts one visit per person per day, with the channel that sent them (from ?utm_source=).
export default function VisitTracker() {
  useEffect(() => {
    trackEvent('visit');
  }, []);
  return null;
}
