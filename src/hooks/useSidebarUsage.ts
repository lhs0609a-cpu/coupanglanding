'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'megaload_sidebar_usage';
const PINNED_HREF = '/my/dashboard';
const MAX_FREQUENT = 5;

type UsageMap = Record<string, number>;

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SidebarSections {
  pinned: NavItem[];
  frequent: NavItem[];
  more: NavItem[];
}

function loadUsage(): UsageMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveUsage(map: UsageMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // quota exceeded — ignore
  }
}

export function useSidebarUsage(navItems: NavItem[]) {
  const [usage, setUsage] = useState<UsageMap>({});
  const loaded = useRef(false);

  // SSR-safe: load from localStorage after mount
  useEffect(() => {
    setUsage(loadUsage());
    loaded.current = true;
  }, []);

  const trackClick = useCallback((href: string) => {
    if (href === PINNED_HREF) return; // don't track pinned item
    setUsage((prev) => {
      const next = { ...prev, [href]: (prev[href] || 0) + 1 };
      saveUsage(next);
      return next;
    });
  }, []);

  const sections: SidebarSections = (() => {
    const pinned: NavItem[] = [];
    const frequent: NavItem[] = [];
    const more: NavItem[] = [];

    // Separate pinned
    const rest: NavItem[] = [];
    for (const item of navItems) {
      if (item.href === PINNED_HREF) {
        pinned.push(item);
      } else {
        rest.push(item);
      }
    }

    // Before any usage data is loaded, return all in "more"
    if (!loaded.current) {
      return { pinned, frequent: [], more: rest };
    }

    // Separate items with clicks
    const withClicks: { item: NavItem; count: number }[] = [];
    const noClicks: NavItem[] = [];

    for (const item of rest) {
      const count = usage[item.href] || 0;
      if (count > 0) {
        withClicks.push({ item, count });
      } else {
        noClicks.push(item);
      }
    }

    // Sort by click count descending, take top MAX_FREQUENT
    withClicks.sort((a, b) => b.count - a.count);
    const topN = withClicks.slice(0, MAX_FREQUENT);
    const overflow = withClicks.slice(MAX_FREQUENT);

    for (const { item } of topN) {
      frequent.push(item);
    }

    // Overflow goes back to "more" in original order
    const overflowSet = new Set(overflow.map((o) => o.item.href));
    for (const item of rest) {
      if (item.href === PINNED_HREF) continue;
      if (frequent.some((f) => f.href === item.href)) continue;
      if (overflowSet.has(item.href) || noClicks.some((n) => n.href === item.href)) {
        more.push(item);
      }
    }

    return { pinned, frequent, more };
  })();

  const hasFrequent = sections.frequent.length > 0;

  return { sections, trackClick, hasFrequent };
}
