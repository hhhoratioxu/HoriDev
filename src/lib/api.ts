export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public requestId?: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const data = (await response.json()) as {
    code?: string;
    message?: string;
    error?: { code: string; message: string; requestId?: string };
  };
  if (!response.ok)
    throw new ApiError(
      data.error?.code ?? data.code ?? 'REQUEST_FAILED',
      data.error?.message ?? data.message ?? '请求失败，请重试。',
      response.status,
      data.error?.requestId,
    );
  return data as T;
}
export async function runStream(
  taskId: string,
  stage: string,
  onEvent: (type: string, data: Record<string, unknown>) => void,
  signal: AbortSignal,
) {
  const response = await fetch(`/api/tasks/${taskId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
    signal,
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const data = (await response.json()) as { error: { code: string; message: string } };
    throw new ApiError(data.error.code, data.error.message, response.status);
  }
  if (!response.body) throw new Error('当前浏览器不支持流式响应。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneEvent = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const lines = block.split('\n');
      const type =
        lines
          .find((l) => l.startsWith('event:'))
          ?.slice(6)
          .trim() ?? 'message';
      const text = lines
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (text) {
        const data = JSON.parse(text) as Record<string, unknown>;
        onEvent(type, data);
        if (type === 'complete' || type === 'error') doneEvent = true;
      }
    }
  }
  if (!doneEvent) throw new Error('连接在完成前中断。请刷新任务；未知用量会保留预算预留。');
}
export async function download(path: string, name: string) {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin' });
  if (!response.ok) {
    const data = (await response.json()) as { error: { message: string } };
    throw new Error(data.error.message);
  }
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const money = (micros: number) => `$${(micros / 1000000).toFixed(4)}`;
export const time = (value: number) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
