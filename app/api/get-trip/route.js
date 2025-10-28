import { requireAgentRole } from '@/lib/server-auth';

const EXCHANGE_RATE_USD_TO_KZ = 1;

export async function GET(request) {
  try {
    const { supabase } = await requireAgentRole();
    const { searchParams } = new URL(request.url);

    const tripId = searchParams.get('tripId');

    if (!tripId) {
      return Response.json({ error: 'Trip ID is required' }, { status: 400 });
    }

    const { data: trip, error } = await supabase
      .from('trips')
      .select(`
        id,
        departure_time,
        arrival_time,
        price_usd,
        available_seats,
        routes!inner(
          origin,
          destination
        ),
        buses!inner(
          seat_capacity
        )
      `)
      .eq('id', tripId)
      .single();

    if (error || !trip) {
      return Response.json({ error: 'Trip not found' }, { status: 404 });
    }

    const formattedTrip = {
      id: trip.id,
      departure_time: trip.departure_time,
      arrival_time: trip.arrival_time,
      price_kz: Math.round(trip.price_usd * EXCHANGE_RATE_USD_TO_KZ),
      available_seats: trip.available_seats,
      origin: trip.routes.origin,
      destination: trip.routes.destination,
      seat_capacity: trip.buses.seat_capacity,
      route: `${trip.routes.origin} → ${trip.routes.destination}`,
    };

    return Response.json({ trip: formattedTrip });

  } catch (err) {
    console.error('API Error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
