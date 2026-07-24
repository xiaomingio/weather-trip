/**
 * 文件说明: 生成 C2/C3 国家层级候选报告，供人工复核后维护 country-tier-countries.yml。
 * 对应文档: docs/specs/30-weather-coverage-design.md, docs/specs/31-data-flow.md
 */
import { generateCountryTierCandidateReport } from './lib/static-data/country-profile-generation.js';

const report = await generateCountryTierCandidateReport();
console.log(`Generated ${report.candidateCount} country tier candidates (${report.version}).`);
