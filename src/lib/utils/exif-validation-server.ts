import exifr from 'exifr';

export interface ExifValidationResult {
  isValid: boolean;
  hasSoftware: boolean;
  hasDateTime: boolean;
  warningMessage: string | null;
}

/**
 * 서버 사이드 EXIF 메타데이터 검증 (Buffer 입력)
 * AI 생성 이미지는 EXIF 메타데이터가 없으므로 차단됩니다.
 */
export async function validateExifMetadataServer(buffer: Buffer): Promise<ExifValidationResult> {
  try {
    const exifData = await exifr.parse(buffer, {
      pick: ['Software', 'DateTime', 'DateTimeOriginal', 'Make', 'Model', 'CreateDate'],
    });

    if (!exifData) {
      return {
        isValid: false,
        hasSoftware: false,
        hasDateTime: false,
        warningMessage: 'EXIF 메타데이터가 없습니다. 실제 스크린샷을 업로드해주세요. (AI 생성 이미지 불가)',
      };
    }

    const hasSoftware = !!(exifData.Software);
    const hasDateTime = !!(exifData.DateTime || exifData.DateTimeOriginal || exifData.CreateDate);
    const hasMakeModel = !!(exifData.Make || exifData.Model);

    const isValid = hasSoftware || hasDateTime || hasMakeModel;

    return {
      isValid,
      hasSoftware,
      hasDateTime,
      warningMessage: isValid
        ? null
        : 'EXIF 메타데이터가 부족합니다. 실제 스크린샷을 업로드해주세요.',
    };
  } catch {
    return {
      isValid: false,
      hasSoftware: false,
      hasDateTime: false,
      warningMessage: '이미지 메타데이터를 읽을 수 없습니다. 다른 파일을 시도해주세요.',
    };
  }
}
