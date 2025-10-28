import { requireAgentRole } from '@/lib/server-auth';

export async function GET(request) {
  try {
    const { supabase } = await requireAgentRole();
    const { searchParams } = new URL(request.url);

    const tripId = searchParams.get('tripId');
    if (!tripId) {
      return Response.json({ error: 'tripId é obrigatório' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // Assentos ocupados por bilhetes emitidos (status active/pending)
    const { data: ticketSeats, error: ticketErr } = await supabase
      .from('tickets')
      .select('seat_number')
      .eq('trip_id', tripId)
      .in('status', ['active', 'pending']);

    if (ticketErr) {
      console.error('[trip-seats] ticketErr:', ticketErr);
      return Response.json({ error: 'Falha ao ler bilhetes' }, { status: 500 });
    }

    // Assentos reservados temporariamente em online_bookings (hold não expirado)
    const { data: holds, error: holdErr } = await supabase
      .from('online_bookings')
      .select('seat_number, expires_at')
      .eq('trip_id', tripId)
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
