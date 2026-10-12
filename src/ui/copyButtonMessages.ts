export const copyButtonMessages = {
  en: { copy: "Copy", copying: "Copying…", copied: "Copied", failed: "Could not copy. Select the text and copy it manually." },
  zh: { copy: "复制", copying: "正在复制…", copied: "已复制", failed: "复制失败，请选中文本后手动复制。" },
  ko: { copy: "복사", copying: "복사 중…", copied: "복사됨", failed: "복사하지 못했습니다. 텍스트를 선택하여 직접 복사해 주세요." },
} as const;

export function getCopyButtonMessages(locale: string) {
  const language = locale.toLowerCase().split(/[-_]/)[0];
  return copyButtonMessages[language === "zh" || language === "ko" ? language : "en"];
}
