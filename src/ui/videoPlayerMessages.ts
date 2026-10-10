export const videoPlayerMessages = {
  en: {
    play: "Play", pause: "Pause", mute: "Mute", unmute: "Unmute", volume: "Volume", fullscreen: "Fullscreen", timeline: "Playback time", timelineSeek: "Video timeline",
    loading: "Loading video…", buffering: "Buffering…", previous: "Previous clip", next: "Next clip", first: "First clip", latest: "Latest clip",
    previousPage: "Previous page of clips", nextPage: "Next page of clips", clip: "Clip {index}", position: "Clip {index} / {total}", page: "{first}–{last} / {total}",
    time: "Time within the current clip", retry: "Retry", refreshFailed: "Could not refresh the session. Playback is still available; try again.", jump: "Go to clip", go: "Go",
  },
  zh: {
    play: "播放", pause: "暂停", mute: "静音", unmute: "取消静音", volume: "音量", fullscreen: "全屏", timeline: "累计播放时间", timelineSeek: "视频总进度",
    loading: "正在载入视频…", buffering: "正在缓冲…", previous: "上一段", next: "下一段", first: "第一段", latest: "最新一段",
    previousPage: "上一页片段", nextPage: "下一页片段", clip: "第 {index} 段", position: "第 {index} / {total} 段", page: "{first}–{last} / {total}",
    time: "当前片段的播放进度", retry: "重试", refreshFailed: "暂时无法更新视频序列，仍可继续播放，请稍后重试。", jump: "跳转到片段", go: "跳转",
  },
  ko: {
    play: "재생", pause: "일시 정지", mute: "음소거", unmute: "음소거 해제", volume: "음량", fullscreen: "전체 화면", timeline: "재생 시간", timelineSeek: "동영상 전체 진행률",
    loading: "동영상 불러오는 중…", buffering: "버퍼링 중…", previous: "이전 클립", next: "다음 클립", first: "첫 클립", latest: "최신 클립",
    previousPage: "이전 클립 페이지", nextPage: "다음 클립 페이지", clip: "클립 {index}", position: "클립 {index} / {total}", page: "{first}–{last} / {total}",
    time: "현재 클립 재생 위치", retry: "다시 시도", refreshFailed: "세션을 업데이트하지 못했습니다. 재생은 계속할 수 있습니다. 다시 시도하세요.", jump: "클립으로 이동", go: "이동",
  },
} as const;
