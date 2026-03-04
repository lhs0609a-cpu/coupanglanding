-- profiles 테이블에 phone 컬럼 추가
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT NULL;

-- 아이디 찾기용 인덱스
CREATE INDEX IF NOT EXISTS idx_profiles_name_phone ON public.profiles(full_name, phone);

-- handle_new_user 트리거 함수 수정: phone 메타데이터 저장
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_active, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'pt_user'),
    true,
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    phone = COALESCE(EXCLUDED.phone, profiles.phone);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
