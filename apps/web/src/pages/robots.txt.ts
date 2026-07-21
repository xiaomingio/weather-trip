/**
 * 文件说明: 生成公开站 robots.txt，并声明正式 sitemap 地址。
 * 对应文档: docs/runtime.md
 */
import { getRobotsTxt } from '@/domain/seo';

export function GET(): Response {
  return new Response(getRobotsTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}
