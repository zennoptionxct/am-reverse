/**
 * Temp Mail API — Maildrop.cc GraphQL Proxy
 * Route: /api/tempmail?action=xxx
 */

const MAILDROP_API = 'https://api.maildrop.cc/graphql'
const FETCH_TIMEOUT_MS = 8000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

async function graphql(query, variables = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let res
  try {
    res = await fetch(MAILDROP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal
    })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error(`Timeout: maildrop.cc tidak merespons dalam ${FETCH_TIMEOUT_MS}ms`)
    throw new Error(`Network error: ${err.message}`)
  }
  clearTimeout(timer)

  const contentType = res.headers.get('content-type') || ''
  const raw = await res.text()

  if (!contentType.includes('application/json')) {
    throw new Error(`Response bukan JSON (status ${res.status}). Preview: ${raw.slice(0, 150)}`)
  }

  let body
  try { body = raw ? JSON.parse(raw) : {} }
  catch (err) { throw new Error(`Gagal parse JSON: ${err.message}. Raw: ${raw.slice(0, 150)}`) }

  if (body.errors && body.errors.length > 0) {
    throw new Error(`GraphQL error: ${body.errors.map(e => e.message).join('; ')}`)
  }

  return body.data
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/* ══════ GET ══════ */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  try {
    if (action === 'messages') {
      const mailbox = searchParams.get('mailbox')
      if (!mailbox) return Response.json({ success: false, error: 'Missing mailbox' }, { status: 400, headers: CORS })

      const data = await graphql(
        `query Inbox($mailbox: String!) {
          inbox(mailbox: $mailbox) {
            id
            mailfrom
            headerfrom
            subject
            date
          }
        }`,
        { mailbox }
      )

      return Response.json({
        success: true,
        messages: data.inbox || [],
        total: (data.inbox || []).length
      }, { headers: CORS })
    }

    if (action === 'message') {
      const mailbox = searchParams.get('mailbox')
      const id = searchParams.get('id')
      if (!mailbox || !id) return Response.json({ success: false, error: 'Missing mailbox or id' }, { status: 400, headers: CORS })

      const data = await graphql(
        `query Message($mailbox: String!, $id: String!) {
          message(mailbox: $mailbox, id: $id) {
            id
            mailfrom
            headerfrom
            subject
            date
            html
            text
          }
        }`,
        { mailbox, id }
      )

      return Response.json({ success: true, message: data.message }, { headers: CORS })
    }

    return Response.json({ success: false, error: 'Invalid action', available: ['messages', 'message'] }, { status: 400, headers: CORS })

  } catch (error) {
    console.error('[tempmail GET]', error)
    return Response.json({ success: false, error: error.message }, { status: 500, headers: CORS })
  }
}

/* ══════ POST ══════ */
export async function POST(request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  try {
    if (action === 'create') {
      const pingData = await graphql(
        `query Ping($msg: String!) { ping(message: $msg) }`,
        { msg: 'health-check' }
      )

      if (!pingData || pingData.ping === undefined) {
        return Response.json({ success: false, error: 'Maildrop API tidak merespons' }, { status: 502, headers: CORS })
      }

      const mailbox = 'am' + Math.random().toString(36).slice(2, 11)
      const email = `${mailbox}@maildrop.cc`

      return Response.json({ success: true, email, mailbox }, { headers: CORS })
    }

    return Response.json({ success: false, error: 'Invalid action' }, { status: 400, headers: CORS })

  } catch (error) {
    console.error('[tempmail POST]', error)
    return Response.json({ success: false, error: error.message }, { status: 500, headers: CORS })
  }
}

/* ══════ DELETE ══════ */
export async function DELETE(request) {
  const { searchParams } = new URL(request.url)
  const mailbox = searchParams.get('mailbox')
  const id = searchParams.get('id')

  try {
    if (!mailbox || !id) return Response.json({ success: false, error: 'Missing mailbox or id' }, { status: 400, headers: CORS })

    const data = await graphql(
      `mutation DeleteMessage($mailbox: String!, $id: String!) {
        deleteMessage(mailbox: $mailbox, id: $id) { id }
      }`,
      { mailbox, id }
    )

    return Response.json({ success: !!data.deleteMessage }, { headers: CORS })
  } catch (error) {
    console.error('[tempmail DELETE]', error)
    return Response.json({ success: false, error: error.message }, { status: 500, headers: CORS })
  }
}
