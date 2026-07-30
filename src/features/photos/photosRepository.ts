import type { SupabaseClient } from '@supabase/supabase-js'
import type { FieldPhoto } from './types'

/** Ports the Flutter `FieldPhotosRepository.fetchPhotos()` — reads photos
 * previously uploaded for a plot, filtered by `source`
 * ('geotag' | 'scout' | 'followup'). Only 'geotag' is actually used here —
 * scout/followup photos come embedded in scout_reports/scout_followups'
 * own `photo_urls` column instead (see scoutRepository.ts). */
export class PhotosRepository {
  private client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async fetchPhotos(plotCode: string, source: string): Promise<FieldPhoto[]> {
    const { data, error } = await this.client
      .from('field_photos')
      .select('storage_path,taken_at')
      .eq('plot_no', plotCode)
      .eq('source', source)
      .order('taken_at', { ascending: false })
    if (error) throw error

    return (data ?? []).map((r) => {
      const path = r.storage_path as string
      const takenAtStr = r.taken_at as string | null
      return {
        url: this.client.storage.from('field-photos').getPublicUrl(path).data.publicUrl,
        storagePath: path,
        takenAt: takenAtStr ? new Date(takenAtStr) : null,
      }
    })
  }
}
