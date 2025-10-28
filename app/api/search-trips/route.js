import { requireAgentRole } from '@/lib/server-auth';

// taxa de câmbio -> mostra Kz na UI
const EXCHANGE_RATE_USD_TO_KZ = Number(process.env.EXCHANGE_RATE_USD_TO_KZ || 1);

export async function GET(request) {
  try {
    // supabase aqui já está autenticado como agente/admin
    const { supabase } = await requireAgentRole();

    const { searchParams } = new URL(request.url);

    const origin = searchParams.get('origin');           // ex: "Luanda"
    const destination = searchParams.get('destination'); // ex: "Cunene"
    const dateStr = searchParams.get('date');            // ex: "2025-10-24"

    if (!origin || !destination || !dateStr) {
      return Response.json(
        { error: 'Parâmetros obrigatórios em falta: origin, destination, date' },
        { status: 400 }
      );
    }

    // janela do dia selecionado
    const startIso = new Date(dateStr + 'T00:00:00Z').toISOString();
    const endIso   = new Date(dateStr + 'T23:59:59Z').toISOString();

    // 1. Buscar viagens (trips + route + bus)
    const { data: rawTrips, error: tripsErr } = await supabase
      .from('trips')
      .select(`
        id,
        seat_class,
        departure_time,
        arrival_time,
        price_usd,
        available_seats,
        status,
        route_id,
        bus_id,
        routes:route_id (
          origin_city,
          destination_city,
          origin_province,
          destination_province,
          distance_km
        ),
        buses:bus_id (
          license_plate,
          capacity
        )
      `)
      .gte('departure_time', startIso)
      .lte('departure_time', endIso)
      .in('status', ['scheduled', 'boarding'])
      .order('departure_time', { ascending: true });

    if (tripsErr) {
      console.error('[search-trips] tripsErr:', tripsErr);
      return Response.json({ error: 'Falha ao carregar viagens' }, { status: 500 });
    }

    // filtrar por origem/destino certos (porque são campos da rota)
    const tripsFiltered = (rawTrips || []).filter(t =>
      t.routes?.origin_city === origin &&
      t.routes?.destination_city === destination
    );

    if (tripsFiltered.length === 0) {
      return Response.json({ trips: [] }, { status: 200 });
    }

    const tripIds = tripsFiltered.map(t => t.id);
    const nowIso = new Date().toISOString();

    // 2. Buscar assentos ocupados por bilhetes (tickets)
    // status 'active' / 'pending' contam como ocupados, independentemente de pago ou não
    const { data: takenTickets, error: takenErr } = await supabase
      .from('tickets')
      .select('trip_id, seat_number, status')
      .in('trip_id', tripIds)
      .in('status', ['active', 'pending']);

    if (takenErr) {
      console.error('[search-trips] takenErr:', takenErr);
      return Response.json({ error: 'Falha ao ler bilhetes' }, { status: 500 });
    }

    // 3. Buscar assentos reservados (online_bookings) ainda válidos
    const { data: holds, error: holdsErr } = await supabase
      .from('online_bookings')
      .select('trip_id, seat_number, expires_at')
      .in('trip_id', tripIds)
      .gt('expires_at', nowIso);

    if (holdsErr) {
      console.error('[search-trips] holdsErr:', holdsErr);
      return Response.json({ error: 'Falha ao ler reservas' }, { status: 500 });
    }

    // 4. Construir mapa tripId -> Set(assentos ocupados)
    const occupiedMap = {};
    for (const t of takenTickets || []) {
      if (!occupiedMap[t.trip_id]) occupiedMap[t.trip_id] = new Set();
      occupiedMap[t.trip_id].add(t.seat_number);
    }
    for (const h of holds || []) {
      if (!occupiedMap[h.trip_id]) occupiedMap[h.trip_id] = new Set();
      occupiedMap[h.trip_id].add(h.seat_number);
    }

    // 5. Formatar saída final para o frontend
    const formattedTrips = tripsFiltered.map(trip => {
      const busCapacity = trip.buses?.capacity ?? 0;
      const occupiedSeatsSet = occupiedMap[trip.id] || new Set();
      const realAvailable = Math.max(
        busCapacity - occupiedSeatsSet.size,
        0
      );

      const priceUsdNum = Number(trip.price_usd || 0);
      const priceKz = Math.round(priceUsdNum * EXCHANGE_RATE_USD_TO_KZ);

      return {
        id: trip.id,
        departure_time: trip.departure_time,
        arrival_time: trip.arrival_time,
        status: trip.status,
        seat_class: trip.seat_class,

        // disponibilidade "real"
        available_seats: realAvailable, // <- AGORA é calculado, não o campo da DB
        bus_capacity: busCapacity,

        // rota
        origin_city: trip.routes?.origin_city || '',
        destination_city: trip.routes?.destination_city || '',
        origin_province: trip.routes?.origin_province || '',
        destination_province: trip.routes?.destination_province || '',
        distance_km: trip.routes?.distance_km || null,

        // autocarro
        bus_license_plate: trip.buses?.license_plate || '',

        // preços
        price_usd: priceUsdNum,
        price_kz: priceKz,

        // string pronta para UI PT
        route: `${trip.routes?.origin_city || ''} → ${trip.routes?.destination_city || ''}`,
      };
    });

    return Response.json({ trips: formattedTrips }, { status: 200 });
  } catch (err) {
    console.error('[search-trips] API Error:', err);
    return Response.json(
      { error: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
