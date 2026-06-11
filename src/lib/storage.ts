import { supabase } from './supabase'

export type Bucket = 'branding' | 'productos'

// Sube una imagen al bucket indicado bajo la carpeta del negocio
// (`<tenant_id>/<archivo>`, requerido por las políticas RLS de Storage) y
// devuelve su URL pública.
export async function subirImagen(
  bucket: Bucket,
  tenantId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const ruta = `${tenantId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from(bucket).upload(ruta, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || undefined,
  })
  if (error) throw error

  const { data } = supabase.storage.from(bucket).getPublicUrl(ruta)
  return data.publicUrl
}
