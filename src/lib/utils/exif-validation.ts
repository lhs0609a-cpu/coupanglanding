import exifr from 'exifr';

export interface ExifValidationResult {
  isValid: boolean;
  hasSoftware: boolean;
  hasDateTime: boolean;
  flagged: boolean;          // EXIF 없음/부족 → 관리자 검토 플래그(차단은 안 함)
  warningMessage: string | null;
}

/**
 * EXIF 메타데이터를 파싱해 "관리자 검토 플래그"를 만든다.
 * ⚠️ EXIF 없음으로 '차단'하지 않는다 — 캡처도구·PrtScn 등 정상 스크린샷(PNG)도 EXIF 가 없기 때문.
 *    (EXIF 는 카메라 사진 메타데이터) 위변조 의심은 flagged 로 표시하고 관리자가 수동 검증한다.
 */
export async function validateExifMetadata(file: File): Promise<ExifValidationResult> {
  try {
    const exifData = await exifr.parse(file, {
      pick: ['Software', 'DateTime', 'DateTimeOriginal', 'Make', 'Model', 'CreateDate'],
    });

    if (!exifData) {
      return {
        isValid: true,
        hasSoftware: false,
        hasDateTime: false,
        flagged: true,
        warningMessage: 'EXIF 메타데이터가 없습니다(스크린샷은 정상일 수 있음). 관리자 검토 대상으로 표시됩니다.',
      };
    }

    const hasSoftware = !!(exifData.Software);
    const hasDateTime = !!(exifData.DateTime || exifData.DateTimeOriginal || exifData.CreateDate);
    const hasMakeModel = !!(exifData.Make || exifData.Model);
    const flagged = !(hasSoftware || hasDateTime || hasMakeModel);

    return {
      isValid: true,
      hasSoftware,
      hasDateTime,
      flagged,
      warningMessage: flagged
        ? 'EXIF 메타데이터가 부족합니다. 관리자 검토 대상으로 표시됩니다.'
        : null,
    };
  } catch {
    return {
      isValid: true,
      hasSoftware: false,
      hasDateTime: false,
      flagged: true,
      warningMessage: '이미지 메타데이터를 읽지 못했습니다. 관리자 검토 대상으로 표시됩니다.',
    };
  }
}
