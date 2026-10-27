type Reply = { id: number; ok: boolean; value?: unknown; error?: string };
declare global { interface Window { PinwheelNative?: { post(message: string): void }; pinwheelReply?: (reply: Reply) => void; pinwheelSuspend?: () => void; pinwheelResume?: () => void; pinwheelBack?: () => void; } }
let next = 0;
const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
window.pinwheelReply = reply => {
  const request = pending.get(reply.id); if (!request) return;
  clearTimeout(request.timer); pending.delete(reply.id);
  if (reply.ok) request.resolve(reply.value); else request.reject(new Error(reply.error || '操作失败，请重试。'));
};
export function native<T = any>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!window.PinwheelNative) return Promise.reject(new Error('请在鸿蒙版风车笔记中打开。浏览器预览不连接真实笔记。'));
  return new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(new Error('操作超时，未确认保存，请保留当前页面并重试。')); }, 120_000);
    pending.set(id, { resolve, reject, timer });
    try { window.PinwheelNative!.post(JSON.stringify({ id, command, ...args })); } catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
}
