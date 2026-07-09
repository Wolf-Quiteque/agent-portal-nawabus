import { requireAgentRole } from '@/lib/server-auth';

export async function GET(request) {
  try {
    const { supabase } = await requireAgentRole();
    const { searchParams } = new URL(request.url);

    const tripId = searchParams.get('tripId');
    if (!tripId) {
      return Response.json({ error: 'tripId é obrigatório' }, { status: 400 });
    }

    // Find all sibling trip IDs (same bus, overlapping [departure_time, arrival_time])
    const { data: siblings, error: sibErr } = await supabase
      .rpc('get_overlapping_trip_ids', { p_trip_id: tripId });

    if (sibErr) {
      console.error('[trip-seats] sibErr:', sibErr);
      return Response.json({ error: 'Falha ao resolver viagens irmãs' }, { status: 500 });
    }

    const siblingIds = siblings?.map(s => s.id) ?? [tripId];
    const nowIso = new Date().toISOString();

    // Assentos ocupados por bilhetes emitidos (active/pending/used) across all siblings
    const { data: ticketSeats, error: ticketErr } = await supabase
      .from('tickets')
      .select('seat_number')
      .in('trip_id', siblingIds)
      .in('status', ['active', 'pending', 'used']);

    if (ticketErr) {
      console.error('[trip-seats] ticketErr:', ticketErr);
      return Response.json({ error: 'Falha ao ler bilhetes' }, { status: 500 });
    }

    // Assentos reservados temporariamente em online_bookings (hold não expirado) across all siblings
    const { data: holds, error: holdErr } = await supabase
      .from('online_bookings')
      .select('seat_number, expires_at')
      .in('trip_id', siblingIds)
      .gt('expires_at', nowIso);

    if (holdErr) {
      console.error('[trip-seats] holdErr:', holdErr);
      return Response.json({ error: 'Falha ao ler reservas' }, { status: 500 });
    }

    const occupiedSet = new Set();
    for (const row of ticketSeats || []) {
      occupiedSet.add(row.seat_number);
    }
    for (const row of holds || []) {
      occupiedSet.add(row.seat_number);
    }

    return Response.json(
      { occupiedSeats: Array.from(occupiedSet) },
      { status: 200 }
    );
  } catch (err) {
    console.error('[trip-seats] API Error:', err);
    return Response.json(
      { error: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
