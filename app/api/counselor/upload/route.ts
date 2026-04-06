import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthUser } from '@/lib/auth-api'
import { generateEmbedding } from '@/lib/embeddings'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerClient()
    const counselorId = authUser.id

    const formData = await request.formData()
    const file = formData.get('file') as File
    const studentId = formData.get('studentId') as string

    if (!file || !studentId) {
      return NextResponse.json({ error: 'Missing file or studentId' }, { status: 400 })
    }

    // File size validation
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
    }

    // File type validation
    const allowedTypes = ['text/plain', 'text/csv', 'application/pdf', 'text/markdown']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'File type not supported' }, { status: 400 })
    }

    // Verify counselor link
    const { data: link } = await supabase
      .from('supervisor_links')
      .select('id')
      .eq('supervisor_id', counselorId)
      .eq('student_id', studentId)
      .single()

    if (!link) {
      return NextResponse.json({ error: 'No link to this student' }, { status: 403 })
    }

    // Read file content
    const buffer = await file.arrayBuffer()
    const text = new TextDecoder('utf-8').decode(buffer)

    // Simple text chunking (~2000 chars per chunk)
    const chunks: string[] = []
    const CHUNK_SIZE = 2000
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      const chunk = text.slice(i, i + CHUNK_SIZE).trim()
      if (chunk.length > 50) chunks.push(chunk)
    }

    // Store in Supabase Storage
    const filename = `${counselorId}/${studentId}/${Date.now()}-${file.name}`
    await supabase.storage.from('authority-files').upload(filename, new Uint8Array(buffer), {
      contentType: file.type,
    })

    // Insert chunks as vectors with embeddings
    const vectorInserts: Array<{
      user_id: string
      content: string
      embedding: number[] | null
      metadata: Record<string, unknown>
    }> = []
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      let embedding: number[] | null = null
      try {
        embedding = await generateEmbedding(chunk)
      } catch (e) {
        console.error(`[Upload] Embedding failed for chunk ${i}:`, e)
      }
      vectorInserts.push({
        user_id: studentId,
        content: chunk,
        embedding,
        metadata: {
          source_type: 'COUNSELOR_AUTHORITY',
          counselor_id: counselorId,
          filename: file.name,
          chunk_index: i,
        },
      })
    }

    const embeddedCount = vectorInserts.filter(v => v.embedding !== null).length

    if (vectorInserts.length > 0) {
      const { error } = await supabase.from('vectors').insert(vectorInserts)
      if (error) {
        console.error('Vector insert failed:', error.message)
        return NextResponse.json({ error: 'Failed to store file chunks' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      filename: file.name,
      chunks: chunks.length,
      embedded: embeddedCount,
      storagePath: filename,
    })
  } catch (error) {
    console.error('Counselor upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
