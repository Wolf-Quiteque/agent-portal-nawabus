import { requireAgentRole } from '@/lib/server-auth';

// taxa de câmbio -> mostra Kz na UI
const EXCHANGE_RATE_USD_TO_KZ = Number(process.env.EXCHANGE_RATE_USD_TO_KZ || 1);

// Returns the ISO minute key for grouping sibling trips: "2026-03-12T08:00"
function minuteKey(isoString) {
  return new Date(isoString).toISOString().slice(0, 16);
}

function minuteWindow(isoString) {
  const d = new Date(isoString);
  d.setSeconds(0, 0);
  return { start: d.toISOString(), end: new Date(d.getTime() + 60000).toISOString() };
}

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

    // 2. Determine unique (bus_id, dep_minute) groups from filtered trips.
    //    For each group we need to fetch ALL sibling trip IDs — including trips
    //    going to different destinations on the same bus at the same time.
    const groupKeySet = new Set(
      tripsFiltered.map(t => `${t.bus_id}|${minuteKey(t.departure_time)}`)
    );

    // Build a map: groupKey -> Set of all sibling trip IDs across the whole DB
    const groupSiblingIds = {}; // groupKey -> string[]
    await Promise.all(
      Array.from(groupKeySet).map(async (key) => {
        const [busId, depMinute] = key.split('|');
        const { start, end } = minuteWindow(depMinute + ':00'); // re-add seconds for minuteWindow
        const { data: siblings } = await supabase
          .from('trips')
          .select('id')
          .eq('bus_id', busId)
          .gte('departure_time', start)
          .lt('departure_time', end);
        groupSiblingIds[key] = siblings?.map(s => s.id) ?? [];
      })
    );

    // Collect all sibling IDs across all groups (for bulk ticket/hold queries)
    const allSiblingIds = [...new Set(Object.values(groupSiblingIds).flat())];

    // 3. Buscar assentos ocupados por bilhetes (tickets) across ALL sibling trips
    const { data: takenTickets, error: takenErr } = await supabase
      .from('tickets')
      .select('trip_id, seat_number, status')
      .in('trip_id', allSiblingIds)
      .in('status', ['active', 'pending']);

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

    // 5. Build group-level occupied seat sets: groupKey -> Set(seat_numbers)
    //    We use a map from trip_id -> groupKey for fast lookup
    const tripIdToGroupKey = {};
    for (const [key, ids] of Object.entries(groupSiblingIds)) {
      for (const id of ids) {
        tripIdToGroupKey[id] = key;
      }
    }

    const groupOccupiedMap = {}; // groupKey -> Set(seat_number)
    for (const t of takenTickets || []) {
      const key = tripIdToGroupKey[t.trip_id];
      if (!key) continue;
      if (!groupOccupiedMap[key]) groupOccupiedMap[key] = new Set();
      groupOccupiedMap[key].add(t.seat_number);
    }
    for (const h of holds || []) {
      const key = tripIdToGroupKey[h.trip_id];
      if (!key) continue;
      if (!groupOccupiedMap[key]) groupOccupiedMap[key] = new Set();
      groupOccupiedMap[key].add(h.seat_number);
    }

    // 6. Formatar saída final para o frontend
    const formattedTrips = tripsFiltered.map(trip => {
      const busCapacity = trip.buses?.capacity ?? 0;
      const groupKey = `${trip.bus_id}|${minuteKey(trip.departure_time)}`;
      const occupiedSeatsSet = groupOccupiedMap[groupKey] || new Set();
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
