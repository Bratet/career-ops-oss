'use client'

import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { ReactNode } from 'react'

/*
 * Every chart here is single-series or ordinal, so identity is never carried by
 * color alone and no legend is needed — each chart's title names its one series.
 * Colors come from the validated tokens in globals.css.
 */

const ORDINAL = ['#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95']
const GRID = '#2c2c2a'
const MUTED = '#898781'

const axis = { stroke: MUTED, fontSize: 11, tickLine: false, axisLine: false } as const

function TipShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-xs shadow-xl">
      {children}
    </div>
  )
}

/** Applications per week. Weekly, not daily: 42 rows over ~11 weeks makes a daily
 *  axis almost all zeros, and the question being asked is "how does this week
 *  compare to last". */
export function WeeklyChart({ data }: { data: { week: string; label: string; count: number; partial: boolean }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
        <YAxis {...axis} allowDecimals={false} width={28} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TipShell>
                <div className="font-medium">{payload[0].payload.label}</div>
                <div className="text-[var(--color-muted)]">
                  {payload[0].value} application{payload[0].value === 1 ? '' : 's'}
                  {payload[0].payload.partial ? ' · week in progress' : ''}
                </div>
              </TipShell>
            ) : null
          }
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={34}>
          {data.map((d, i) => (
            // The in-progress week is lighter so a partial count never reads as a drop.
            <Cell key={i} fill={d.partial ? ORDINAL[0] : '#3987e5'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Pipeline stages, ordered. An ordinal ramp, light to dark down the funnel. */
export function FunnelChart({ data }: { data: { status: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" {...axis} allowDecimals={false} hide />
        <YAxis type="category" dataKey="status" {...axis} width={82} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TipShell>
                <span className="font-medium">{payload[0].payload.status}</span>
                <span className="ml-2 text-[var(--color-muted)]">{payload[0].value}</span>
              </TipShell>
            ) : null
          }
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20} label={{ position: 'right', fill: MUTED, fontSize: 11 }}>
          {data.map((_, i) => (
            <Cell key={i} fill={ORDINAL[Math.min(i, ORDINAL.length - 1)]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Score distribution. One series, one hue — magnitude only. */
export function ScoreChart({ data }: { data: { bucket: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="bucket" {...axis} />
        <YAxis {...axis} allowDecimals={false} width={28} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TipShell>
                <span className="font-medium">{payload[0].payload.bucket}</span>
                <span className="ml-2 text-[var(--color-muted)]">{payload[0].value} scored</span>
              </TipShell>
            ) : null
          }
        />
        <Bar dataKey="count" fill="#3987e5" radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  )
}
