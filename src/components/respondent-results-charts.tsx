import React from 'react';
import {
    Bar,
    Cell,
    BarChart,
    CartesianGrid,
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    Radar,
    RadarChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import {
    buildBidirectionalBarData,
    buildSpiderData,
    buildUnidirectionalBarData,
    getDomainMax,
    type SpiderPoint,
} from '../lib/respondent-results-chart-data';
import type { Trait } from '../lib/quiz-definition';
import type { TraitStatistics } from '../lib/respondent-quiz';
import type { ResolvedThemeColors } from '../lib/theme-colors';

type ResultsChartsProps = {
    polarity: 'bidirectional' | 'unidirectional';
    scaleMin: number;
    scaleMax: number;
    themeColors: ResolvedThemeColors;
    traits: Trait[];
    traitStats: Record<string, TraitStatistics>;
};

const renderTooltip = (value: number, name: string) => {
    return [value.toFixed(2), name];
};

export const SpiderChart: React.FC<ResultsChartsProps> = ({ polarity, scaleMin, scaleMax, themeColors, traits, traitStats }) => {
    const domainMax = getDomainMax(scaleMin, scaleMax, traits, traitStats);
    const data = buildSpiderData(traits, traitStats, polarity, domainMax);

    return (
        <ResponsiveContainer width="100%" height={430}>
            <RadarChart data={data} margin={{ bottom: 18, left: 18, right: 18, top: 18 }} outerRadius="78%">
                <PolarGrid radialLines stroke={themeColors.chart_grid} strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="label" tick={{ fill: themeColors.body_text, fontSize: 17, fontWeight: 700 }} tickLine={false} />
                <PolarRadiusAxis
                    angle={90}
                    domain={[0, domainMax]}
                    tick={{ fill: themeColors.body_text, fontSize: 11, fontWeight: 600 }}
                    tickCount={4}
                />
                <Tooltip
                    contentStyle={{
                        background: themeColors.panel_background,
                        border: '1px solid rgba(45, 35, 24, 0.24)',
                        borderRadius: 12,
                        color: themeColors.body_text,
                    }}
                    formatter={(value: number | string, _name, entry) => {
                        const label = (entry?.payload as SpiderPoint | undefined)?.label ?? 'Radius';
                        return [typeof value === 'number' ? value.toFixed(2) : value, label];
                    }}
                />
                <Radar dataKey="outer" fill={themeColors.chart_negative} fillOpacity={0.56} isAnimationActive={false} stroke={themeColors.chart_negative} strokeWidth={1.5} />
                <Radar dataKey="inner" fill={themeColors.panel_background} fillOpacity={1} isAnimationActive={false} stroke={themeColors.panel_background} strokeWidth={0} />
                <Radar dataKey="estimate" fill="none" isAnimationActive={false} stroke={themeColors.chart_band} strokeWidth={3} dot={{ fill: themeColors.chart_band, r: 2.5 }} />
            </RadarChart>
        </ResponsiveContainer>
    );
};

export const BidirectionalBarChart: React.FC<ResultsChartsProps> = ({ scaleMin, scaleMax, themeColors, traits, traitStats }) => {
    const data = buildBidirectionalBarData(traits, traitStats);
    const domainMax = getDomainMax(scaleMin, scaleMax, traits, traitStats);

    return (
        <div style={{ margin: '0 auto', maxWidth: 980, width: '100%' }}>
            <ResponsiveContainer width="100%" height={Math.max(240, traits.length * 58)}>
                <BarChart data={data} layout="vertical" margin={{ bottom: 8, left: 24, right: 24, top: 12 }}>
                    <CartesianGrid stroke={themeColors.chart_grid} strokeDasharray="4 4" />
                    <ReferenceLine stroke={themeColors.body_text} strokeOpacity={0.62} strokeWidth={1.5} x={0} />
                    <XAxis
                        axisLine={{ stroke: themeColors.chart_grid }}
                        domain={[-domainMax, domainMax]}
                        tick={{ fill: themeColors.body_text, fontSize: 12, fontWeight: 600 }}
                        tickFormatter={(value) => value.toFixed(1)}
                        type="number"
                    />
                    <YAxis
                        dataKey="lowLabel"
                        interval={0}
                        tick={{ fill: themeColors.body_text, fontSize: 16, fontWeight: 700 }}
                        tickLine={false}
                        type="category"
                        width={180}
                        yAxisId="left"
                    />
                    <YAxis
                        dataKey="highLabel"
                        interval={0}
                        orientation="right"
                        tick={{ fill: themeColors.body_text, fontSize: 16, fontWeight: 700 }}
                        tickLine={false}
                        type="category"
                        width={180}
                        yAxisId="right"
                    />
                    <Tooltip
                        contentStyle={{
                            background: themeColors.panel_background,
                            border: '1px solid rgba(45, 35, 24, 0.24)',
                            borderRadius: 12,
                            color: themeColors.body_text,
                        }}
                        formatter={renderTooltip}
                    />
                    <Bar dataKey="core" stackId="result" stroke="none" yAxisId="left">
                        {data.map((entry) => (
                            <Cell key={entry.traitId} fill={entry.estimate >= 0 ? themeColors.chart_positive : themeColors.chart_negative} />
                        ))}
                    </Bar>
                    <Bar dataKey="spreadBand" fill={themeColors.chart_band} stackId="result" stroke="none" yAxisId="left" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const UnidirectionalBarChart: React.FC<ResultsChartsProps> = ({ scaleMin, scaleMax, themeColors, traits, traitStats }) => {
    const data = buildUnidirectionalBarData(traits, traitStats);
    const domainMax = getDomainMax(scaleMin, scaleMax, traits, traitStats);

    return (
        <div style={{ margin: '0 auto', maxWidth: 980, width: '100%' }}>
            <ResponsiveContainer width="100%" height={Math.max(260, traits.length * 56)}>
                <BarChart data={data} margin={{ bottom: 12, left: 40, right: 22, top: 12 }}>
                    <CartesianGrid stroke={themeColors.chart_grid} strokeDasharray="4 4" />
                    <ReferenceLine stroke={themeColors.body_text} strokeOpacity={0.45} strokeWidth={1.25} y={0} />
                    <XAxis dataKey="id" tick={{ fill: themeColors.body_text, fontSize: 16, fontWeight: 700 }} tickLine={false} axisLine={{ stroke: themeColors.chart_grid }} />
                    <YAxis
                        axisLine={{ stroke: themeColors.chart_grid }}
                        domain={[0, domainMax]}
                        tick={{ fill: themeColors.body_text, fontSize: 12, fontWeight: 600 }}
                        tickFormatter={(value) => value.toFixed(1)}
                    />
                    <Tooltip
                        contentStyle={{
                            background: themeColors.panel_background,
                            border: '1px solid rgba(45, 35, 24, 0.24)',
                            borderRadius: 12,
                            color: themeColors.body_text,
                        }}
                        formatter={renderTooltip}
                    />
                    <Bar dataKey="core" fill={themeColors.chart_positive} stackId="result" stroke="none" />
                    <Bar dataKey="spreadBand" fill={themeColors.chart_band} stackId="result" stroke="none" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};
