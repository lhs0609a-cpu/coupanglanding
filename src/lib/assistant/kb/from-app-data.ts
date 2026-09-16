import type { KbEntry, KbMedia } from '../types';

import { GUIDE_ARTICLES as OPS_GUIDE_ARTICLES, GUIDE_CATEGORIES } from '@/lib/data/guides';
import { GUIDE_ARTICLES as PUBLIC_ARTICLES } from '@/lib/data/guide-articles';
import { FEATURE_TUTORIALS } from '@/lib/data/feature-tutorials';
import { TUTORIAL_CONTENT } from '@/lib/data/onboarding-tutorials';
import { EMERGENCY_GUIDES } from '@/lib/data/emergency-responses';
import { PENALTY_GUIDES } from '@/lib/data/penalty-response-guide';
import { CHANNEL_SETUP_GUIDES } from '@/lib/data/channel-setup-guides';
import { CHANNEL_ONBOARDING_GUIDES } from '@/lib/data/channel-onboarding-guides';
import { adTipCategories } from '@/lib/data/ad-tips';
import { AD_ACADEMY_STAGES } from '@/lib/data/ad-academy-stages';
import { scalingStages } from '@/lib/data/scaling-guide';
import { GROWTH_TIERS } from '@/lib/data/growth-roadmap';
import { ROADMAP_STEPS, ROADMAP_FAQS } from '@/lib/data/start-roadmap';
import { CS_TEMPLATES } from '@/lib/data/cs-templates';
import { CONTRACT_ARTICLES } from '@/lib/data/contract-terms';

/**
 * 앱이 이미 가지고 있는 콘텐츠를 상담봇 KB 형태로 평탄화한다.
 *
 * 콘텐츠를 복사하지 않는 게 핵심이다 — 가이드 문서를 고치면 봇의 답도 같이 바뀐다.
 * (모듈 로드 시 한 번만 계산되도록 buildAppDataKb() 결과를 kb/index.ts 에서 캐시한다.)
 */

const bullet = (xs: readonly string[] | undefined) =>
  xs && xs.length ? xs.map((x) => `- ${x}`).join('\n') : '';

const section = (heading: string, content: string) => (content ? `\n**${heading}**\n${content}\n` : '');

/** 유튜브 URL/ID 어느 쪽이 와도 재생 가능한 형태로 맞춘다. */
export function toVideoMedia(url: string, caption?: string): KbMedia {
  const yt = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
  if (yt) return { kind: 'youtube', src: yt[1], caption };
  if (/^[A-Za-z0-9_-]{8,15}$/.test(url)) return { kind: 'youtube', src: url, caption };
  return { kind: 'video', src: url, caption };
}

function truncate(s: string, n: number) {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

export function buildAppDataKb(): KbEntry[] {
  const out: KbEntry[] = [];

  // ── 1. 운영 가이드 (src/lib/data/guides.ts) — /my/guides ──
  const categoryTitle = new Map(GUIDE_CATEGORIES.map((c) => [c.categoryId, c.title]));
  for (const a of OPS_GUIDE_ARTICLES) {
    const steps = a.steps
      .map((s, i) => {
        const parts = [
          `${i + 1}. **${s.title}** — ${s.description}`,
          bullet(s.detailedInstructions),
          s.tip ? `  💡 ${s.tip}` : '',
          s.warning ? `  ⚠️ ${s.warning}` : '',
          s.externalLink ? `  🔗 ${s.externalLink.label}: ${s.externalLink.url}` : '',
          s.copyableTemplates?.length
            ? s.copyableTemplates.map((t) => `  📋 ${t.label}:\n${t.text}`).join('\n')
            : '',
        ].filter(Boolean);
        return parts.join('\n');
      })
      .join('\n\n');

    const faqs = a.faqs.map((f) => `- Q. ${f.question}\n  A. ${f.answer}`).join('\n');

    // 단계에 붙은 실제 화면 캡처를 미디어로 실어 보낸다 (봇이 답변에 띄운다)
    const guideMedia: KbMedia[] = [];
    for (const st of a.steps) {
      for (const img of st.images ?? []) {
        if (guideMedia.length >= 4) break;
        guideMedia.push({ kind: 'image', src: img.src, alt: img.alt, caption: img.caption ?? st.title });
      }
    }

    out.push({
      id: `guide-${a.articleId}`,
      title: a.title,
      summary: a.subtitle || truncate(a.overview, 140),
      body: [
        a.overview,
        section('단계', steps),
        section('자주 묻는 질문', faqs),
        `\n소요 시간: ${a.estimatedTime}`,
      ].join('\n'),
      tags: [
        a.title,
        a.subtitle,
        categoryTitle.get(a.categoryId) || '',
        ...a.faqs.map((f) => f.question),
      ].filter(Boolean),
      paths: ['/my/guides'],
      audience: 'pt',
      priority: 55,
      source: 'guide',
      link: { label: '운영 가이드에서 보기', href: `/my/guides/${a.categoryId}/${a.articleId}` },
      media: guideMedia.length ? guideMedia : undefined,
    });
  }

  // ── 2. 공개 아티클 (src/lib/data/guide-articles.ts) — /guide/{slug} ──
  for (const a of PUBLIC_ARTICLES) {
    const sections = a.sections
      .map((s) => {
        const table = s.table
          ? `\n| ${s.table.headers.join(' | ')} |\n|${s.table.headers.map(() => '---').join('|')}|\n` +
            s.table.rows.map((r) => `| ${r.join(' | ')} |`).join('\n')
          : '';
        return [
          `**${s.heading}**`,
          s.body.join('\n'),
          bullet(s.list),
          table,
          s.callout ? `${s.callout.kind === 'warn' ? '⚠️' : '💡'} ${s.callout.text}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');

    out.push({
      id: `article-${a.slug}`,
      title: a.title,
      summary: a.description,
      body: [a.lead, '', sections, a.faq?.length ? section('FAQ', a.faq.map((f) => `- Q. ${f.q}\n  A. ${f.a}`).join('\n')) : ''].join('\n'),
      tags: [a.title, ...a.keywords, ...(a.faq || []).map((f) => f.q)],
      paths: ['/guide'],
      audience: 'all',
      priority: 45,
      source: 'article',
      link: { label: '문서 열기', href: `/guide/${a.slug}` },
    });
  }

  // ── 3. 기능 튜토리얼 (화면별 사용법) ──
  for (const t of FEATURE_TUTORIALS) {
    const steps = t.steps
      .map(
        (s, i) =>
          `${i + 1}. ${s.emoji} **${s.title}** — ${s.description}` +
          (s.proTip ? `\n   💡 ${s.proTip}` : '') +
          (s.relatedLink ? `\n   🔗 ${s.relatedLink.label}: ${s.relatedLink.href}` : ''),
      )
      .join('\n');

    out.push({
      id: `tutorial-${t.featureKey}`,
      title: `${t.name} 사용법`,
      summary: `${t.name} 화면을 처음 쓸 때 알아야 할 것들.`,
      body: steps,
      tags: [t.name, `${t.name} 사용법`, t.featureKey],
      audience: 'pt',
      priority: 42,
      source: 'tutorial',
    });
  }

  // ── 4. 온보딩 튜토리얼 (리셀 합법성, 사업자, 쿠팡 입점 등) ──
  for (const t of TUTORIAL_CONTENT) {
    const subs = t.subSteps
      .map(
        (s, i) =>
          `${i + 1}. **${s.title}** — ${s.description}\n` +
          bullet(s.detailedInstructions) +
          (s.tip ? `\n   💡 ${s.tip}` : '') +
          (s.warning ? `\n   ⚠️ ${s.warning}` : '') +
          (s.externalLink ? `\n   🔗 ${s.externalLink.label}: ${s.externalLink.url}` : ''),
      )
      .join('\n\n');

    out.push({
      id: `onboarding-${t.stepKey}`,
      title: `${t.tagline}`,
      summary: t.overview,
      body: [t.overview, '', subs, `\n예상 소요: ${t.estimatedTotalTime}`].join('\n'),
      tags: [t.stepKey, t.tagline, ...t.subSteps.map((s) => s.title)],
      paths: ['/my/education', '/start'],
      audience: 'all',
      priority: 50,
      source: 'tutorial',
      link: { label: '교육 센터에서 보기', href: '/my/education' },
      media: t.videoUrl ? [toVideoMedia(t.videoUrl, t.tagline)] : undefined,
    });
  }

  // ── 5. 긴급 대응 (브랜드 클레임 / 계정 페널티) ── 최우선
  for (const g of EMERGENCY_GUIDES) {
    const actions = [...g.immediateActions]
      .sort((a, b) => a.order - b.order)
      .map((a) => `${a.order}. ${a.urgent ? '🔴 ' : ''}**${a.title}** — ${a.description}`)
      .join('\n');
    const templates = g.responseTemplates
      .map((t) => `**${t.title}** (대상: ${t.target})\n\n${t.body}`)
      .join('\n\n---\n\n');
    const prevention = g.preventionChecklist
      .map((p) => `- ${p.required ? '[필수] ' : ''}${p.title} — ${p.description}`)
      .join('\n');

    out.push({
      id: `emergency-${g.incidentType}-${g.subType}`,
      title: `[긴급] ${g.title}`,
      summary: truncate(g.summary, 180),
      body: [
        g.summary,
        section('즉시 조치', actions),
        section('회신/소명 템플릿', templates),
        section('예방 체크리스트', prevention),
        section('전문가 연결이 필요한 경우', bullet(g.escalationCriteria)),
        section('자주 묻는 질문', g.faqs.map((f) => `- Q. ${f.question}\n  A. ${f.answer}`).join('\n')),
      ].join('\n'),
      tags: [
        g.title,
        g.subType,
        g.incidentType,
        '긴급',
        ...g.faqs.map((f) => f.question),
      ],
      paths: ['/my/emergency'],
      audience: 'all',
      priority: 96,
      source: 'emergency',
      link: { label: '긴급 대응 가이드 열기', href: '/my/emergency' },
    });
  }

  // ── 6. 페널티 대응 ──
  for (const g of PENALTY_GUIDES) {
    const steps = g.responseSteps
      .map((s) => `${s.step}. **${s.title}** — ${s.description}${s.deadline ? ` (기한: ${s.deadline})` : ''}`)
      .join('\n');
    const docs = g.requiredDocuments.map((d) => `- ${d.required ? '[필수] ' : '[선택] '}${d.name} — ${d.description}`).join('\n');
    const cases = g.realCases
      .map((c) => `- ${c.result === 'success' ? '✅' : '❌'} **${c.title}** — ${c.summary}`)
      .join('\n');

    out.push({
      id: `penalty-${g.id}`,
      title: `[페널티] ${g.label}`,
      summary: g.shortDescription,
      body: [
        g.detailedDescription,
        `\n심각도: ${g.severityLabel} · 점수 영향: ${g.scoreImpact} · 기한: ${g.deadline}`,
        section('대응 단계', steps),
        section('필요 서류', docs),
        section('흔한 실수', bullet(g.commonMistakes)),
        section('실전 팁', bullet(g.proTips)),
        section('실제 사례', cases),
        section('연락처', g.contactInfo.map((c) => `- ${c.channel}: ${c.value}`).join('\n')),
      ].join('\n'),
      tags: [g.label, g.id, g.group, '페널티', ...g.commonMistakes.slice(0, 3)],
      paths: ['/my/penalty', '/my/emergency'],
      audience: 'pt',
      priority: 90,
      source: 'penalty',
      link: { label: '페널티 트래커 열기', href: '/my/penalty' },
    });
  }

  // ── 7. 채널 API 연동 가이드 ──
  for (const g of Object.values(CHANNEL_SETUP_GUIDES)) {
    const steps = g.steps
      .map(
        (s) =>
          `${s.stepNumber}. **${s.title}** — ${s.description}\n` +
          bullet(s.detailedInstructions) +
          (s.url ? `\n   🔗 ${s.url}` : '') +
          (s.inputFields?.length ? `\n   입력 항목: ${s.inputFields.join(', ')}` : '') +
          (s.tip ? `\n   💡 ${s.tip}` : '') +
          (s.warning ? `\n   ⚠️ ${s.warning}` : ''),
      )
      .join('\n\n');

    const setupMedia: KbMedia[] = [];
    for (const st of g.steps) {
      if (st.imageUrl && setupMedia.length < 4) {
        setupMedia.push({ kind: 'image', src: st.imageUrl, alt: st.title, caption: st.title });
      }
    }

    out.push({
      id: `channel-setup-${g.channel}`,
      title: g.title,
      summary: `${g.channel} API 연동 절차 (예상 ${g.estimatedTime}).`,
      body: [section('사전 준비', bullet(g.prerequisites)), section('절차', steps), g.finalNote].join('\n'),
      tags: [g.channel, g.title, 'API', '연동', 'API키', '채널연동'],
      paths: ['/megaload/channels'],
      audience: 'megaload',
      priority: 70,
      source: 'channel',
      link: { label: '채널관리 열기', href: '/megaload/channels' },
      media: setupMedia.length ? setupMedia : undefined,
    });
  }

  // ── 8. 채널 입점 가이드 (수수료 / 정산 / 서류) ──
  for (const g of Object.values(CHANNEL_ONBOARDING_GUIDES)) {
    const steps = g.steps
      .map(
        (s) =>
          `${s.stepNumber}. **${s.title}** — ${s.description}\n` +
          bullet(s.detailedInstructions) +
          (s.url ? `\n   🔗 ${s.url}` : '') +
          (s.tip ? `\n   💡 ${s.tip}` : '') +
          (s.warning ? `\n   ⚠️ ${s.warning}` : ''),
      )
      .join('\n\n');

    const onbMedia: KbMedia[] = [];
    for (const st of g.steps) {
      if (st.imageUrl && onbMedia.length < 4) {
        onbMedia.push({ kind: 'image', src: st.imageUrl, alt: st.title, caption: st.title });
      }
    }

    out.push({
      id: `channel-onboarding-${g.channel}`,
      title: `${g.channel} 입점 가이드`,
      summary: g.headline,
      body: [
        g.headline,
        `\n- 입점 대상: ${g.eligibility}\n- 소요: ${g.estimatedTime}\n- 비용: ${g.cost}\n- 정산/수수료: ${g.settlementSummary}`,
        section('준비 서류', bullet(g.documents)),
        section('절차', steps),
        g.finalNote,
        g.available ? '' : '\n⚠️ 현재 셀프 입점은 지원되지 않습니다. 담당자 협의가 필요합니다.',
      ].join('\n'),
      tags: [g.channel, '입점', '수수료', '정산', ...g.documents],
      paths: ['/megaload/channels'],
      audience: 'all',
      priority: 68,
      source: 'channel',
      media: onbMedia.length ? onbMedia : undefined,
    });
  }

  // ── 9. 광고 노하우 ──
  for (const cat of adTipCategories) {
    for (const tip of cat.tips) {
      out.push({
        id: `adtip-${cat.id}-${tip.id}`,
        title: `[광고] ${tip.title}`,
        summary: `${cat.title} — ${truncate(tip.content, 140)}`,
        body: tip.content,
        // 빈 문자열이 태그로 들어가면 제목+태그 매칭 문자열이 지저분해진다 — 걸러낸다.
        tags: ['광고', cat.title, tip.title, ...tip.tags, tip.importance === 'must' ? '필수' : ''].filter(Boolean),
        paths: ['/my/ad-tips', '/megaload/ads'],
        audience: 'pt',
        priority: tip.importance === 'must' ? 62 : 50,
        source: 'ads',
        link: { label: '광고 노하우 열기', href: '/my/ad-tips' },
      });
    }
  }

  // ── 10. 광고 아카데미 (개념 카드) ──
  for (const stage of AD_ACADEMY_STAGES) {
    const cards = stage.conceptCards
      .map((c) => `${c.emoji} **${c.title}**\n${c.content}` + (c.bonusTip ? `\n   💡 ${c.bonusTip.text}` : ''))
      .join('\n\n');
    const quiz = stage.checkpointQuiz
      .map((q) => `- Q. ${q.question}\n  A. ${q.correctAnswer} — ${q.explanation}`)
      .join('\n');

    out.push({
      id: `adacademy-${stage.id}`,
      title: `[광고 기초 ${stage.stageNumber}] ${stage.title}`,
      summary: stage.subtitle,
      body: [stage.storyIntro.lines.join('\n'), section('핵심 개념', cards), section('체크 문제', quiz)].join('\n'),
      tags: ['광고', '광고아카데미', stage.title, stage.subtitle, ...stage.conceptCards.map((c) => c.title)],
      paths: ['/my/ad-academy', '/megaload/ads'],
      audience: 'pt',
      priority: 48,
      source: 'ads',
      link: { label: '광고 아카데미 열기', href: `/my/ad-academy/${stage.id}` },
    });
  }

  // ── 11. 매출 단계별 운영 (인력·고정비) ──
  for (const s of scalingStages) {
    out.push({
      id: `scaling-${s.id}`,
      title: `[${s.revenueRange}] ${s.title} — ${s.subtitle}`,
      summary: `월 매출 ${s.revenueRange} 구간의 인력 구성과 고정비(${s.totalFixedCost}, 매출 대비 ${s.costRatio}).`,
      body: [
        section('인력', s.staffing.map((m) => `- ${m.role} ${m.count} — ${m.cost}${m.note ? ` (${m.note})` : ''}`).join('\n')),
        section('고정비', s.fixedCosts.map((c) => `- ${c.category}: ${c.amount}`).join('\n') + `\n합계: ${s.totalFixedCost} (매출 대비 ${s.costRatio})`),
        section('체크리스트', bullet(s.checklist)),
        section('다음 단계로 넘어갈 신호', bullet(s.nextStageSignals)),
      ].join('\n'),
      tags: ['매출단계', '사업확장', '인력', '고정비', '직원', s.title, s.revenueRange],
      paths: ['/my/scaling-guide'],
      audience: 'pt',
      priority: 46,
      source: 'growth',
      link: { label: '사업 확장 가이드', href: '/my/scaling-guide' },
    });
  }

  // ── 12. 성장 로드맵 (단계별 할 일 + 혜택) ──
  for (const t of GROWTH_TIERS) {
    const range =
      t.revenueMax === null
        ? `월 ${(t.revenueMin / 10000).toLocaleString()}만원 이상`
        : `월 ${(t.revenueMin / 10000).toLocaleString()}~${(t.revenueMax / 10000).toLocaleString()}만원`;
    out.push({
      id: `growth-tier-${t.tier}`,
      title: `[성장 ${t.tier}단계] ${t.label} (${range})`,
      summary: `${range} 구간에서 해야 할 일과 열리는 혜택. 예상 소요 ${t.estimatedTimeMonths}.`,
      body: [
        section('해야 할 일', t.actions.map((a) => `- **${a.label}** — ${a.description}`).join('\n')),
        section('팁', bullet(t.tips)),
        section('이 단계 혜택', t.benefits.map((b) => `- [${b.label}] ${b.description}`).join('\n')),
      ].join('\n'),
      tags: ['성장', '로드맵', t.label, range, ...t.actions.map((a) => a.label)],
      paths: ['/my/growth'],
      audience: 'pt',
      priority: 46,
      source: 'growth',
      link: { label: '성장 로드맵 열기', href: '/my/growth' },
    });
  }

  // ── 13. 시작 로드맵 (사업자등록 ~ 쿠팡 입점) ──
  for (const s of ROADMAP_STEPS) {
    const subs = s.subSteps
      .map(
        (ss) =>
          `- **${ss.label}**${ss.description ? ` — ${ss.description}` : ''}` +
          (ss.tip ? `\n  💡 ${ss.tip}` : '') +
          (ss.warning ? `\n  ⚠️ ${ss.warning}` : '') +
          (ss.link ? `\n  🔗 ${ss.link.label}: ${ss.link.url}` : ''),
      )
      .join('\n');
    out.push({
      id: `start-${s.id}`,
      title: `[시작 ${s.number}단계] ${s.title}`,
      summary: `${s.subtitle} (소요 ${s.estimatedTime}, 비용 ${s.cost}${s.required ? '' : ', 선택'})`,
      body: [`${s.subtitle}\n\n소요: ${s.estimatedTime} · 비용: ${s.cost} · ${s.required ? '필수' : '선택(건너뛸 수 있음)'}`, '', subs].join('\n'),
      tags: ['시작', '준비', s.title, s.subtitle, ...s.subSteps.map((x) => x.label)],
      paths: ['/start'],
      audience: 'all',
      priority: 58,
      source: 'growth',
      link: { label: '시작 로드맵 열기', href: '/start' },
    });
  }
  if (ROADMAP_FAQS.length) {
    out.push({
      id: 'start-faqs',
      title: '시작 전에 가장 많이 묻는 질문',
      summary: '사업자등록, 통신판매업 신고, 비용, 소요 기간 등 시작 단계 FAQ.',
      body: ROADMAP_FAQS.map((f) => `- Q. ${f.question}\n  A. ${f.answer}`).join('\n'),
      tags: ['시작', 'FAQ', ...ROADMAP_FAQS.map((f) => f.question)],
      paths: ['/start'],
      audience: 'all',
      priority: 58,
      source: 'growth',
    });
  }

  // ── 14. CS 응답 템플릿 ──
  for (const t of CS_TEMPLATES) {
    out.push({
      id: `cs-${t.id}`,
      title: `[CS 템플릿] ${t.title}`,
      summary: t.situation,
      body: [t.situation, '\n**답변 문구**\n', t.responseText, section('주의', bullet(t.tips))].join('\n'),
      tags: ['CS', '고객문의', '답변', t.title, t.category, ...t.tags],
      paths: ['/my/cs-templates', '/megaload/cs'],
      audience: 'pt',
      priority: 52,
      source: 'cs',
      link: { label: 'CS 템플릿 열기', href: '/my/cs-templates' },
    });
  }

  // ── 15. 계약 조항 ──
  for (const a of CONTRACT_ARTICLES) {
    out.push({
      id: `contract-${a.number}`,
      title: `[계약 제${a.number}조] ${a.title}`,
      summary: truncate(a.paragraphs.join(' '), 160),
      body: [a.paragraphs.join('\n\n'), a.subItems?.length ? '\n' + a.subItems.map((s) => `${s.label}. ${s.text}`).join('\n') : ''].join('\n'),
      tags: ['계약', '계약서', a.title, `제${a.number}조`],
      paths: ['/my/contract'],
      audience: 'pt',
      priority: 44,
      source: 'contract',
      link: { label: '계약서 보기', href: '/my/contract' },
    });
  }

  return out;
}
