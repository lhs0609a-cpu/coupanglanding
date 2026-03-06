'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import { ShieldAlert, ArrowRight, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import type { BrandBlacklist } from '@/lib/supabase/types';

export default function EmergencyAlertWidget() {
  const [recentBlacklist, setRecentBlacklist] = useState<BrandBlacklist[]>([]);
  const [activeIncidents, setActiveIncidents] = useState(0);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // 최근 블랙리스트 3건
      const { data: bl } = await supabase
        .from('brand_blacklist')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(3);

      if (bl) setRecentBlacklist(bl as BrandBlacklist[]);

      // 본인 활성 인시던트 수
      const { data: ptUser } = await supabase
        .from('pt_users')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (ptUser) {
        const { count } = await supabase
          .from('incidents')
          .select('*', { count: 'exact', head: true })
          .eq('pt_user_id', ptUser.id)
          .in('status', ['reported', 'in_progress', 'escalated']);

        setActiveIncidents(count || 0);
      }

      setLoading(false);
    })();
  }, [supabase]);

  if (loading) return null;

  // 블랙리스트도 없고 활성 인시던트도 없으면 표시하지 않음
  if (recentBlacklist.length === 0 && activeIncidents === 0) return null;

  return (
    <Link href="/my/emergency">
      <Card className="hover:border-[#E31837] hover:shadow-md transition cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900">긴급 대응 센터</p>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                {activeIncidents > 0 && (
                  <span className="flex items-center gap-1 text-red-600">
                    <AlertTriangle className="w-3 h-3" />
                    활성 인시던트 {activeIncidents}건
                  </span>
                )}
                {recentBlacklist.length > 0 && (
                  <span>블랙리스트 {recentBlacklist.length}건 업데이트</span>
                )}
              </div>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-400" />
        </div>
      </Card>
    </Link>
  );
}
