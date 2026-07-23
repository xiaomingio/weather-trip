/**
 * 文件说明: 读取人工确认后的国家分层 input，生成最终 country-profiles 和结果报告。
 * 对应文档: docs/specs/30-weather-coverage-design.md, docs/specs/31-data-flow.md
 */
import { generateCountryProfiles } from './static-data/country-profile-generation.js';

const report = await generateCountryProfiles();
console.log(`Generated ${report.profileCount} country profiles: C1=${report.countryTierCounts.C1}, C2=${report.countryTierCounts.C2}, C3=${report.countryTierCounts.C3} (${report.version}).`);
