/**
 * 文件说明: 渲染天气类型对应的共享 SVG 图标，供卡片和筛选控件复用。
 */
import { createElement, type SVGProps } from 'react';
import type { WeatherType } from 'weather-core/types';
import { weatherTypeIconNodes } from './weather-icons';

type WeatherTypeIconProps = Omit<SVGProps<SVGSVGElement>, 'type'> & {
  type: WeatherType;
  size?: number;
};

export function WeatherTypeIcon({ type, size = 17, ...props }: WeatherTypeIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {weatherTypeIconNodes[type].map(([name, attributes]) => createElement(name, attributes))}
    </svg>
  );
}
