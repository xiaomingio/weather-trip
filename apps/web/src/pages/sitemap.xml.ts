/**
 * 文件说明: 从公开路由真源生成多语言 sitemap。
 * 对应文档: docs/runtime.md
 */
import { getSitemapXml } from '@/domain/seo';

export function GET(): Response {
  return new Response(getSitemapXml(), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8'
    }
  });
}
