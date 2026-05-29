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

type ResultsChartsProps = {
    polarity: 'bidirectional' | 'unidirectional';
    scaleMin: number;
    scaleMax: number;
    traits: Trait[];
    traitStats: Record<string, TraitStatistics>;
};

const colors = {
    background: '#f8f7f3',
    barBand: '#7a4d2a',
    barCoreNegative: '#245a78',
    barCorePositive: '#a24a34',
    grid: 'rgba(70, 53, 28, 0.34)',
    line: '#7a4d2a',
    spiderFill: 'rgba(36, 90, 120, 0.56)',
    spiderInner: '#f8f7f3',
    text: '#2d2318',
};

const renderTooltip = (value: number, name: string) => {
    return [value.toFixed(2), name];
};

export const SpiderChart: React.FC<ResultsChartsProps> = ({ polarity, scaleMin, scaleMax, traits, traitStats }) => {
    const domainMax = getDomainMax(scaleMin, scaleMax, traits, traitStats);
    const data = buildSpiderData(traits, traitStats, polarity, domainMax);

    return (
        <ResponsiveContainer width="100%" height={430}>
            <RadarChart data={data} margin={{ bottom: 18, left: 18, right: 18, top: 18 }} outerRadius="78%">
                <PolarGrid radialLines stroke={colors.grid} strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="label" tick={{ fill: colors.text, fontSize: 17, fontWeight: 700 }} tickLine={false} />
                <PolarRadiusAxis
                    angle={90}
                    domain={[0, domainMax]}
                    tick={{ fill: colors.text, fontSize: 11, fontWeight: 600 }}
                    tickCount={4}
                />
                <Tooltip
                    contentStyle={{
                        background: colors.background,
                        border: '1px solid rgba(45, 35, 24, 0.24)',
                        borderRadius: 12,
                        color: colors.text,
                    }}
                    formatter={(value: number | string, _name, entry) => {
                        const label = (entry?.payload as SpiderPoint | undefined)?.label ?? 'Radius';
                        return [typeof value === 'number' ? value.toFixed(2) : value, label];
                    }}
                />
                <Radar dataKey="outer" fill={colors.spiderFill} fillOpacity={0.95} isAnimationActive={false} stroke={colors.spiderFill} strokeWidth={1.5} />
                <Radar dataKey="inner" fill={colors.spiderInner} fillOpacity={1} isAnimationActive={false} stroke={colors.spiderInner} strokeWidth={0} />
                <Radar dataKey="estimate" fill="none" isAnimationActive={false} stroke={colors.line} strokeWidth={3} dot={{ fill: colors.line, r: 2.5 }} />
            </RadarChart>
        </ResponsiveContainer>
    );
};

export const BidirectionalBarChart: React.FC<ResultsChartsProps> = ({ scaleMin, scaleMax, traits, traitStats }) => {
    const data = buildBidirectionalBarData(traits, traitStats);
    const domainMax = getDomainMax(scaleMin, scaleMax, traits, traitStats);

    return (
        <div style={{ margin: '0 auto', maxWidth: 980, width: '100%' }}>
            <ResponsiveContainer width="100%" height={Math.max(240, traits.length * 58)}>
                <BarChart data={data} layout="vertical" margin={{ bottom: 8, left: 24, right: 24, top: 12 }}>
                    <CartesianGrid stroke={colors.grid} strokeDasharray="4 4" />
                    <ReferenceLine stroke={colors.text} strokeOpacity={0.62} strokeWidth={1.5} x={0} />
                    <XAxis
                        axisLine={{ stroke: colors.grid }}
                        domain={[-domainMax, domainMax]}
                        tick={{ fill: colors.text, fontSize: 12, fontWeight: 600 }}
                        tickFormatter={(value) => value.toFixed(1)}
                        type="number"
                    />
                    <YAxis
                        dataKey="lowLabel"
                        interval={0}
                        tick={{ fill: colors.text, fontSize: 16, fontWeight: 700 }}
                        tickLine={false}
                        type="category"
                        width={180}
                        yAxisId="left"
                    />
                    <YAxis
                        dataKey="highLabel"
                        interval={0}
                        orientation="right"
                        tick={{ fill: colors.text, fontSize: 16, fontWeight: 700 }}
                        tickLine={false}
                        type="category"
                        width={180}
                        yAxisId="right"
                    />
                    <Tooltip
                        contentStyle={{
                            background: colors.background,
                            border: '1px solid rgba(45, 35, 24, 0.24)',
                            borderRadius: 12,
                            color: colors.text,
                        }}
                        formatter={renderTooltip}
                    />
                    <Bar dataKey="core" stackId="result" stroke="none" yAxisId="left">
                        {data.map((entry) => (
                            <Cell key={entry.traitId} fill={entry.estimate >= 0 ? colors.barCorePositive : colors.barCoreNegative} />
                        ))}
                    </Bar>
                    <Bar dataKey="spreadBand" fill={colors.barBand} stackId="result" stroke="none" yAxisId="left" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const UnidirectionalBarChart: React.FC<ResultsChartsProps> = ({ scaleMin, scaleMax, traits, traitStats }) => {
    const data = buildUnidirectionalBarData(traits, traitStats);
    const domainMax = getDomainMax(scaleMin, scaleMax, traits, traitStats);

    return (
        <div style={{ margin: '0 auto', maxWidth: 980, width: '100%' }}>
            <ResponsiveContainer width="100%" height={Math.max(260, traits.length * 56)}>
                <BarChart data={data} margin={{ bottom: 12, left: 40, right: 22, top: 12 }}>
                    <CartesianGrid stroke={colors.grid} strokeDasharray="4 4" />
                    <ReferenceLine stroke={colors.text} strokeOpacity={0.45} strokeWidth={1.25} y={0} />
                    <XAxis dataKey="id" tick={{ fill: colors.text, fontSize: 16, fontWeight: 700 }} tickLine={false} axisLine={{ stroke: colors.grid }} />
                    <YAxis
                        axisLine={{ stroke: colors.grid }}
                        domain={[0, domainMax]}
                        tick={{ fill: colors.text, fontSize: 12, fontWeight: 600 }}
                        tickFormatter={(value) => value.toFixed(1)}
                    />
                    <Tooltip
                        contentStyle={{
                            background: colors.background,
                            border: '1px solid rgba(45, 35, 24, 0.24)',
                            borderRadius: 12,
                            color: colors.text,
                        }}
                        formatter={renderTooltip}
                    />
                    <Bar dataKey="core" fill={colors.barCorePositive} stackId="result" stroke="none" />
                    <Bar dataKey="spreadBand" fill={colors.barBand} stackId="result" stroke="none" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};
