/**
 * 文件说明: 生成 AI/LLM 入口说明，列出公开页面、数据边界和 sitemap。
 * 对应文档: docs/runtime.md
 */
import { getLlmsTxt } from '@/domain/seo';

export function GET(): Response {
  return new Response(getLlmsTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}
