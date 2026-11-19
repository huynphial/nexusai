export const APP_CONFIG = {
  appName: (import.meta.env.VITE_APP_NAME as string | undefined)?.trim() || 'Local AI',
  appTitle: (import.meta.env.VITE_APP_TITLE as string | undefined)?.trim() || 'Local AI',
  appGreeting:
    (import.meta.env.VITE_APP_GREETING as string | undefined)?.trim() ||
    'Chào mừng bạn đến với Local AI',
  appDescription:
    (import.meta.env.VITE_APP_DESCRIPTION as string | undefined)?.trim() ||
    'Trợ lý trí tuệ nhân tạo hỗ trợ streaming thời gian thực, hiển thị quá trình suy luận (Thinking) và đo lường hiệu năng tốc độ xử lý token chi tiết.',
};
