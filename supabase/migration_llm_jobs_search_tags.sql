-- 검색어 태그 20개 채우기 — 로컬 에이전트(도우미 GPU)에 새 일감 종류를 연다.
-- ---------------------------------------------------------------------------
-- 왜: 쿠팡 검색어 태그(searchTags)는 상품명 밖의 검색어를 알고리즘에 넣는 유일한 통로인데,
--     생성기 키워드가 상품명과 겹쳐 6/20 에서 멈추는 카드가 흔했다. 남는 14칸은 그냥 버리는
--     노출이다. 그 칸을 **쿠팡에서 사람들이 실제로 치는 연관검색어**로 채운다.
-- 어디서: 서버 LLM 이 아니라 셀러/관리자 PC 의 도우미(Ollama)가 뽑는다 — 호출 비용 0.
--     웹(enqueue) → megaload_llm_jobs(task_type='search_tags') → 도우미 llm-pull-loop
--     → result(jsonb) → 웹이 폴링해 카드에 반영.
ALTER TABLE megaload_llm_jobs DROP CONSTRAINT IF EXISTS megaload_llm_jobs_task_type_check;
ALTER TABLE megaload_llm_jobs ADD CONSTRAINT megaload_llm_jobs_task_type_check
  CHECK (task_type IN ('display_name', 'content', 'options', 'category', 'search_tags'));
