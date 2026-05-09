-- ============================================================
-- 카테고리 임베딩 테이블 — Tier 1 시맨틱 매칭
-- 16k 쿠팡 leaf 카테고리에 대한 OpenAI text-embedding-3-small 벡터 저장.
-- text-embedding-3-small 의 dimensions 파라미터로 512 차원 축소 사용 (정확도 손실 미미, 저장공간 1/3).
-- ============================================================

create extension if not exists vector;

create table if not exists public.coupang_category_embeddings (
  category_code text primary key,
  category_path text not null,
  leaf_name text not null,
  depth int not null,
  embedding vector(512) not null,
  text_hash text not null,
  updated_at timestamptz not null default now()
);

-- 코사인 유사도 검색용 IVFFlat 인덱스 (16k vectors → list ≈ sqrt(16k) ≈ 127)
create index if not exists coupang_category_embeddings_cos_idx
  on public.coupang_category_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 128);

-- text_hash 로 변경 감지 (재빌드 시 변경된 카테고리만 업데이트)
create index if not exists coupang_category_embeddings_hash_idx
  on public.coupang_category_embeddings (text_hash);

-- ============================================================
-- 학습 alias 테이블 — Tier 3 자동 학습 루프
-- 사용자가 수동 매칭한 결과를 키워드 → 카테고리 코드로 저장.
-- 동일/유사 상품명 다음 등장 시 Tier 0 직전에 즉시 매칭.
-- ============================================================

create table if not exists public.megaload_category_aliases (
  product_keyword text primary key,         -- 정규화된 상품 키워드 (lowercase, 공백 제거)
  category_code text not null,
  category_path text,
  hits int not null default 1,              -- 누적 사용 횟수 (인기 키워드 우선)
  source text not null,                     -- 'manual' | 'llm_confirmed' | 'embedding_high_conf'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists megaload_category_aliases_code_idx
  on public.megaload_category_aliases (category_code);

-- 빈도 ↑ 시 우선 노출
create index if not exists megaload_category_aliases_hits_idx
  on public.megaload_category_aliases (hits desc);

-- RLS — 읽기는 모든 인증 사용자, 쓰기는 service_role 만
alter table public.coupang_category_embeddings enable row level security;
alter table public.megaload_category_aliases enable row level security;

drop policy if exists "embeddings_read" on public.coupang_category_embeddings;
create policy "embeddings_read" on public.coupang_category_embeddings
  for select using (true);

drop policy if exists "aliases_read" on public.megaload_category_aliases;
create policy "aliases_read" on public.megaload_category_aliases
  for select using (true);

-- top-K 코사인 유사도 RPC — 클라이언트가 vector 타입을 직접 다루지 않도록 함수 래핑.
create or replace function public.match_coupang_category(
  query_embedding vector(512),
  match_count int default 10
)
returns table (
  category_code text,
  category_path text,
  leaf_name text,
  depth int,
  similarity float
)
language sql stable
as $$
  select
    e.category_code,
    e.category_path,
    e.leaf_name,
    e.depth,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.coupang_category_embeddings e
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
