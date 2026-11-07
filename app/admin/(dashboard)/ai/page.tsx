import { Chat } from './_chat'

export const dynamic = 'force-dynamic'

export default async function AiPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  return <Chat initialQuestion={q?.slice(0, 2000)} />
}
