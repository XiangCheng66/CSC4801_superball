// datetime-local has no timezone. Interpret it explicitly as Asia/Shanghai,
// irrespective of the browser's location, then send UTC to the API.
export function slotTimes(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('请选择完整的开始时间。');
  const start = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(start.getTime()) || beijingInput(start) !== value) throw new Error('请选择有效的日期和时间。');
  return { start_at: start.toISOString(), end_at: new Date(start.getTime() + 30 * 60_000).toISOString() };
}

export function beijingInput(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 16);
}

export function formatTime(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value));
}
