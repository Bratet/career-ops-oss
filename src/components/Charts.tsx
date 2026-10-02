'use client'

import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Fragment, useState, type ReactNode } from 'react'

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

/** Weekday + date for tooltips and captions: "Tue 23 Sept". */
function dayName(iso: string, withWeekday = true): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: withWeekday ? 'short' : undefined, day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

function plural(n: number) {
  return `${n} application${n === 1 ? '' : 's'}`
}

interface Day {
  date: string
  applied: number
  future: boolean
  today: boolean
}

/**
 * Sent applications per day across the whole week or month. Every day gets
 * its own labelled slot, zeros included, so a gap reads as a gap. Days still
 * ahead have no bar and a faint label.
 */
export function DailyChart({ days, period, goal = null }: { days: Day[]; period: 'week' | 'month'; goal?: number | null }) {
  const data = days.map((day) => ({
    ...day,
    count: day.future ? null : day.applied,
    label: period === 'week'
      ? new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
      : String(Number(day.date.slice(8))),
  }))

  // Whole-number ticks in even steps, tall enough for the goal line.
  const top = Math.max(1, goal ?? 0, ...days.map((day) => day.applied))
  const step = Math.ceil(top / 5)
  const ticks = Array.from({ length: Math.ceil(top / step) + 1 }, (_, i) => i * step)

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={period === 'week' ? '30%' : 2}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          {...axis}
          interval={0}
          tick={({ x, y, payload, index }) => {
            const day = data[index]
            return (
              <text
                x={x}
                y={Number(y) + 10}
                textAnchor="middle"
                fontSize={period === 'week' ? 11 : 9}
                fontWeight={day?.today ? 600 : 400}
                fill={day?.today ? 'var(--color-text)' : MUTED}
                opacity={day?.future ? 0.4 : 1}
              >
                {payload.value}
              </text>
            )
          }}
        />
        <YAxis {...axis} allowDecimals={false} width={28} domain={[0, ticks[ticks.length - 1]]} ticks={ticks} />
        {goal ? (
          // The per-day goal, so a short day is visible against it.
          <ReferenceLine
            y={goal}
            stroke={MUTED}
            strokeDasharray="4 4"
            label={{ value: `goal ${goal}/day`, position: 'insideTopRight', fill: MUTED, fontSize: 10 }}
          />
        ) : null}
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TipShell>
                <div className="font-medium">{dayName(payload[0].payload.date)}{payload[0].payload.today ? ' · today' : ''}</div>
                <div className="text-[var(--color-muted)]">
                  {payload[0].payload.future ? 'Still ahead' : plural(payload[0].payload.applied)}
                </div>
              </TipShell>
            ) : null
          }
        />
        <Bar dataKey="count" fill="#3987e5" radius={[4, 4, 0, 0]} maxBarSize={34} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** One hue, light to dark: 0, 1, 2, 3+ applications in a day. */
const LEVELS = [
  'var(--color-surface-2)',
  'color-mix(in oklch, var(--color-accent) 35%, var(--color-surface-2))',
  'color-mix(in oklch, var(--color-accent) 65%, var(--color-surface-2))',
  'var(--color-accent)',
]
const LEVEL_LABELS = ['0', '1', '2', '3+']
const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']

/**
 * Every day of the last few weeks as a cell, Monday at the top. Consecutive
 * days sit next to each other, so streaks and empty stretches are visible at
 * a glance in a way a weekly total hides.
 */
export function ActivityGrid({ weeks }: { weeks: Day[][] }) {
  const [hovered, setHovered] = useState<Day | null>(null)
  const today = weeks.flat().find((day) => day.today)

  return (
    <div>
      <div className="overflow-x-auto">
        {/* Cells stretch to the card's width, from 10px up to 20px. */}
        <div
          className="grid gap-[3px]"
          style={{
            gridTemplateColumns: `24px repeat(${weeks.length}, minmax(0, 1fr))`,
            minWidth: 24 + weeks.length * 13,
            maxWidth: 24 + weeks.length * 23,
          }}
        >
          <span />
          {weeks.map((week, i) => {
            // Month name above the first column that starts a new month.
            const month = week[0].date.slice(0, 7)
            const starts = i === 0 || weeks[i - 1][0].date.slice(0, 7) !== month
            return (
              <span key={week[0].date} className="h-4 overflow-visible whitespace-nowrap text-[10px] leading-4 text-[var(--color-faint)]">
                {starts ? new Date(`${week[0].date}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) : ''}
              </span>
            )
          })}
          {WEEKDAYS.map((name, row) => (
            <Fragment key={row}>
              <span className="flex items-center justify-end pr-1 text-[10px] text-[var(--color-faint)]">{name}</span>
              {weeks.map((week) => {
                const day = week[row]
                if (day.future) return <span key={day.date} className="aspect-square w-full" aria-hidden />
                const level = Math.min(day.applied, 3)
                return (
                  <button
                    key={day.date}
                    type="button"
                    aria-label={`${dayName(day.date)}: ${plural(day.applied)}`}
                    onMouseEnter={() => setHovered(day)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(day)}
                    onBlur={() => setHovered(null)}
                    className="aspect-square w-full rounded-[4px] border border-[var(--color-border)] outline-offset-1 hover:border-[var(--color-text)]"
                    style={{ background: LEVELS[level], borderColor: day.today ? 'var(--color-text)' : undefined }}
                  />
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[var(--color-faint)]">
        <p aria-live="polite" className="tnum">
          {hovered
            ? `${dayName(hovered.date)} · ${plural(hovered.applied)}`
            : today ? `Today · ${plural(today.applied)}` : 'Hover a day for its count'}
        </p>
        <div className="flex items-center gap-1.5">
          {LEVELS.map((color, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="size-[10px] rounded-[2px] border border-[var(--color-border)]" style={{ background: color }} />
              {LEVEL_LABELS[i]}
            </span>
          ))}
          <span className="ml-1">per day</span>
        </div>
      </div>
    </div>
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
