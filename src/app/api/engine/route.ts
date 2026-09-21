import { NextResponse } from 'next/server'
import {
  allModels,
  allStatuses,
  isAiFeature,
  isEngineId,
  modelFor,
  readSettings,
  writeFeatureSettings,
  type AiFeature,
  type Settings,
} from '@/lib/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:\-[\]]{0,63}$/

async function state(settings: Settings, feature: AiFeature) {
  const [statuses, models] = await Promise.all([allStatuses(), allModels()])
  const choice = settings.features[feature]
  return {
    feature,
    engine: choice.engine,
    model: modelFor(choice, choice.engine),
    models,
    statuses,
  }
}

export async function GET(req: Request) {
  const feature = new URL(req.url).searchParams.get('feature')
  if (!isAiFeature(feature)) {
    return NextResponse.json({ error: 'a valid AI feature is required' }, { status: 400 })
  }
  return NextResponse.json(await state(await readSettings(), feature))
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  if (!isAiFeature(body.feature)) {
    return NextResponse.json({ error: 'a valid AI feature is required' }, { status: 400 })
  }
  if (body.engine !== undefined && !isEngineId(body.engine)) {
    return NextResponse.json({ error: 'engine must be "claude" or "codex"' }, { status: 400 })
  }
  if (body.model !== undefined && (typeof body.model !== 'string' || (body.model !== '' && !MODEL_RE.test(body.model)))) {
    return NextResponse.json({ error: 'model must be a model id, or "" for the CLI default' }, { status: 400 })
  }

  const settings = await writeFeatureSettings(body.feature, {
    engine: isEngineId(body.engine) ? body.engine : undefined,
    model: typeof body.model === 'string' ? body.model : undefined,
  })
  return NextResponse.json(await state(settings, body.feature))
}
