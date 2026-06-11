import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { encolar } from '@/lib/offlineQueue'

export interface ResumenCaja {
  turnoInicio: string // ISO; desde el último corte (o el inicio del día)
  esperado: number // efectivo teórico acumulado en caja
  numVentas: number // ventas en efectivo del turno
}

function inicioDeHoy(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// Calcula el efectivo esperado desde el cierre del último corte (o, si no hay,
// desde el inicio del día). Solo cuenta ventas en efectivo completadas.
export function useResumenCaja(tenantId: string | null) {
  return useQuery({
    queryKey: ['resumen-caja', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<ResumenCaja> => {
      const ultimo = await supabase
        .from('cash_cuts')
        .select('turno_fin')
        .eq('tenant_id', tenantId!)
        .order('turno_fin', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (ultimo.error) throw ultimo.error

      const turnoInicio = ultimo.data?.turno_fin ?? inicioDeHoy()

      const ventas = await supabase
        .from('sales')
        .select('total')
        .eq('tenant_id', tenantId!)
        .eq('estado_venta', 'completada')
        .eq('metodo_pago', 'efectivo')
        .gte('creado_en', turnoInicio)
      if (ventas.error) throw ventas.error

      const filas = ventas.data ?? []
      const esperado = filas.reduce((s, v) => s + Number(v.total), 0)
      return { turnoInicio, esperado, numVentas: filas.length }
    },
  })
}

export interface Corte {
  id: string
  esperado: number
  contado: number
  diferencia: number
  turno_inicio: string
  turno_fin: string
  notas: string | null
}

export function useCortes(tenantId: string | null) {
  return useQuery({
    queryKey: ['cortes', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Corte[]> => {
      const { data, error } = await supabase
        .from('cash_cuts')
        .select('id, esperado, contado, diferencia, turno_inicio, turno_fin, notas')
        .eq('tenant_id', tenantId!)
        .order('turno_fin', { ascending: false })
        .limit(20)
      if (error) throw error
      return data ?? []
    },
  })
}

export interface NuevoCorte {
  esperado: number
  contado: number
  turnoInicio: string
  notas: string | null
}

export function useRegistrarCorte(tenantId: string | null, cajeroId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: NuevoCorte) => {
      await encolar({
        id: crypto.randomUUID(),
        tipo: 'corte',
        tenantId: tenantId!,
        payload: {
          cajero_id: cajeroId,
          esperado: c.esperado,
          contado: c.contado,
          diferencia: c.contado - c.esperado,
          turno_inicio: c.turnoInicio,
          turno_fin: new Date().toISOString(),
          notas: c.notas,
        },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resumen-caja', tenantId] })
      qc.invalidateQueries({ queryKey: ['cortes', tenantId] })
    },
  })
}
