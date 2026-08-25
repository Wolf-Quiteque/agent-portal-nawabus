import { requireAgentRole } from '@/lib/server-auth';

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
        sales_capacity_limit,
        status,
        route_id,
        bus_id,
        is_campaign,
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

    // 2. Resolve overlapping ("sibling") trips per trip via the shared
    //    get_overlapping_trip_ids() DB function — same bus + overlapping
    //    [departure_time, arrival_time] window. This is resolved per-trip
    //    (not per bus+minute group) because two trips on the same bus can
    //    now have different departure times (e.g. two pickup terminals)
    //    and therefore different sibling sets.
    const siblingsByTrip = {}; // trip_id -> string[] (includes self)
    await Promise.all(
      tripsFiltered.map(async (t) => {
        const { data: siblings } = await supabase
          .rpc('get_overlapping_trip_ids', { p_trip_id: t.id });
        siblingsByTrip[t.id] = siblings?.map(s => s.id) ?? [t.id];
      })
    );

    // Collect all sibling IDs across all trips (for bulk ticket/hold queries)
    const allSiblingIds = [...new Set(Object.values(siblingsByTrip).flat())];

    // 3. Buscar assentos ocupados por bilhetes (tickets) across ALL sibling trips
    const { data: takenTickets, error: takenErr } = await supabase
      .from('tickets')
      .select('trip_id, seat_number, status')
      .in('trip_id', allSiblingIds)
      .in('status', ['active', 'pending', 'used']);

    if (takenErr) {
      console.error('[search-trips] takenErr:', takenErr);
      return Response.json({ error: 'Falha ao ler bilhetes' }, { status: 500 });
    }

    // 4. Buscar assentos reservados (online_bookings) ainda válidos across ALL sibling trips
    const { data: holds, error: holdsErr } = await supabase
      .from('online_bookings')
      .select('trip_id, seat_number, expires_at')
      .in('trip_id', allSiblingIds)
      .gt('expires_at', nowIso);

    if (holdsErr) {
      console.error('[search-trips] holdsErr:', holdsErr);
      return Response.json({ error: 'Falha ao ler reservas' }, { status: 500 });
    }

    // 5. Build occupied seat sets per source trip_id, then combine per trip
    //    using that trip's own sibling set (resolved in step 2).
    const seatsByTripId = {}; // trip_id -> Set(seat_number)
    for (const t of takenTickets || []) {
      if (!seatsByTripId[t.trip_id]) seatsByTripId[t.trip_id] = new Set();
      seatsByTripId[t.trip_id].add(t.seat_number);
    }
    for (const h of holds || []) {
      if (!seatsByTripId[h.trip_id]) seatsByTripId[h.trip_id] = new Set();
      seatsByTripId[h.trip_id].add(h.seat_number);
    }

    // 6. Formatar saída final para o frontend.
    //    NOTA: a coluna chama-se `price_usd` por razões históricas mas o valor
    //    armazenado já está em Kwanzas (AOA) — não converter.
    const formattedTrips = tripsFiltered.map(trip => {
      const busCapacity = trip.buses?.capacity ?? 0;
      const occupiedSeatsSet = new Set();
      for (const siblingId of siblingsByTrip[trip.id] || [trip.id]) {
        const set = seatsByTripId[siblingId];
        if (set) for (const seat of set) occupiedSeatsSet.add(seat);
      }
      // Seat 1 is reserved for the co-pilot and never belongs to the
      // passenger pool, even when no ticket row exists for it.
      const passengerCapacity = Math.max(busCapacity - 1, 0);
      const effectiveCapacity = trip.sales_capacity_limit == null
        ? passengerCapacity
        : Math.min(passengerCapacity, Number(trip.sales_capacity_limit));
      const realAvailable = Math.max(effectiveCapacity - occupiedSeatsSet.size, 0);

      const priceKz = Math.round(Number(trip.price_usd || 0));

      return {
        id: trip.id,
        departure_time: trip.departure_time,
        arrival_time: trip.arrival_time,
        status: trip.status,
        seat_class: trip.seat_class,
        is_campaign: !!trip.is_campaign,

        // disponibilidade "real" — calculada sobre o pool partilhado do autocarro
        available_seats: realAvailable,
        bus_capacity: busCapacity,

        // rota
        origin_city: trip.routes?.origin_city || '',
        destination_city: trip.routes?.destination_city || '',
        origin_province: trip.routes?.origin_province || '',
        destination_province: trip.routes?.destination_province || '',
        distance_km: trip.routes?.distance_km || null,

        // autocarro
        bus_license_plate: trip.buses?.license_plate || '',

        // preço (Kz)
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
