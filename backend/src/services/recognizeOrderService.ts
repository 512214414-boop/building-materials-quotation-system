/**
 * 订单 AI 识别服务
 * 文本/图片 → 原始行 { rawDescription, qty, rawUnit }
 * 有 AI_API_KEY 时走 LLM；无 Key 时文本走规则拆分兜底。
 */
import { Errors } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface RecognizedRawLine {
  rawDescription: string;
  qty: number;
  rawUnit: string;
}

export interface RecognizeOrderInput {
  text?: string;
  /** base64 data URL 或纯 base64 */
  imageBase64?: string;
  mimeType?: string;
}

const UNIT_PATTERN =
  /(吨|kg|KG|千克|公斤|m³|m³|立方|平方米|m²|米|m|根|块|袋|套|件|卷|桶|箱|只|个|包|捆|盘|瓶|升|L|支|条|张|片|盒)/;

/**
 * 规则拆分自然语言订单文本（无 AI Key 时的兜底）。
 * 支持：
 * - 每行一条：`BV2.5 电线 5 卷`
 * - 顿号/逗号分隔：`水泥10袋，沙子5吨`
 */
export function parseOrderTextRules(text: string): RecognizedRawLine[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/[，,；;、]/g, '\n')
    .trim();
  if (!normalized) return [];

  const lines: RecognizedRawLine[] = [];
  for (const raw of normalized.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    // 匹配：描述 + 数量 + 单位（数量在描述后）
    const m1 = line.match(
      new RegExp(`^(.+?)\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(${UNIT_PATTERN.source})\\s*$`),
    );
    if (m1) {
      lines.push({
        rawDescription: m1[1].trim(),
        qty: parseFloat(m1[2]),
        rawUnit: normalizeUnit(m1[3]),
      });
      continue;
    }

    // 匹配：数量 + 单位 + 描述
    const m2 = line.match(
      new RegExp(`^([0-9]+(?:\\.[0-9]+)?)\\s*(${UNIT_PATTERN.source})\\s*(.+)$`),
    );
    if (m2) {
      lines.push({
        rawDescription: m2[3].trim(),
        qty: parseFloat(m2[1]),
        rawUnit: normalizeUnit(m2[2]),
      });
      continue;
    }

    // 匹配：描述中嵌套数量单位
    const m3 = line.match(
      new RegExp(`^(.+?)([0-9]+(?:\\.[0-9]+)?)(${UNIT_PATTERN.source})(.*)$`),
    );
    if (m3) {
      const desc = `${m3[1]}${m3[4]}`.trim() || m3[1].trim();
      lines.push({
        rawDescription: desc,
        qty: parseFloat(m3[2]),
        rawUnit: normalizeUnit(m3[3]),
      });
      continue;
    }

    // 无法解析数量时保留整行，默认数量 1、单位 件
    lines.push({ rawDescription: line, qty: 1, rawUnit: '件' });
  }
  return lines;
}

function normalizeUnit(u: string): string {
  const map: Record<string, string> = {
    KG: 'kg',
    千克: 'kg',
    公斤: 'kg',
    立方: 'm³',
    平方米: 'm²',
    米: 'm',
    L: '升',
  };
  return map[u] ?? u;
}

async function callLlmRecognize(input: RecognizeOrderInput): Promise<RecognizedRawLine[] | null> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  if (!apiKey) return null;

  const system = `你是建材门店订单解析助手。把用户输入拆成物料原始行。
只输出 JSON 数组，每项字段：rawDescription(string)、qty(number)、rawUnit(string)。
不要匹配标准产品库，不要解释。单位尽量用常见中文单位（卷/袋/吨/m/件等）。`;

  type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

  const userContent: ContentPart[] = [];
  if (input.text?.trim()) {
    userContent.push({ type: 'text', text: input.text.trim() });
  }
  if (input.imageBase64) {
    const mime = input.mimeType || 'image/jpeg';
    const dataUrl = input.imageBase64.startsWith('data:')
      ? input.imageBase64
      : `data:${mime};base64,${input.imageBase64}`;
    userContent.push({ type: 'image_url', image_url: { url: dataUrl } });
  }
  if (userContent.length === 0) return [];

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      logger.warn('AI 识单调用失败', { status: res.status, errText });
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
    return parsed
      .map((row) => ({
        rawDescription: String(row.rawDescription ?? row.description ?? '').trim(),
        qty: Number(row.qty ?? 1) || 1,
        rawUnit: String(row.rawUnit ?? row.unit ?? '件').trim() || '件',
      }))
      .filter((r) => r.rawDescription);
  } catch (e) {
    logger.warn('AI 识单异常', { err: e });
    return null;
  }
}

/**
 * 识别订单：优先 LLM，失败或无 Key 时文本走规则；纯图片无 Key 时报错提示配置。
 */
export async function recognizeOrder(input: RecognizeOrderInput): Promise<{
  lines: RecognizedRawLine[];
  engine: 'llm' | 'rules';
}> {
  if (!input.text?.trim() && !input.imageBase64) {
    throw Errors.badRequest('请提供文本或图片');
  }

  const llm = await callLlmRecognize(input);
  if (llm && llm.length > 0) {
    return { lines: llm, engine: 'llm' };
  }

  if (input.text?.trim()) {
    const lines = parseOrderTextRules(input.text);
    if (lines.length === 0) throw Errors.badRequest('未能从文本中识别出物料行');
    return { lines, engine: 'rules' };
  }

  throw Errors.badRequest('图片识别需要配置 AI_API_KEY，或改为粘贴文字识别');
}
