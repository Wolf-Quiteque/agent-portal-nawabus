import { requireAgentRole } from '@/lib/server-auth';

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
        is_campaign,
        routes!inner(
          origin_city,
          destination_city
        ),
        buses!inner(
          capacity
        )
      `)
      .eq('id', tripId)
      .single();

    if (error || !trip) {
      return Response.json({ error: 'Trip not found' }, { status: 404 });
    }

    // NOTA: `price_usd` é apenas o nome da coluna — o valor já está em Kz.
    const priceKz = Math.round(Number(trip.price_usd || 0));

    const formattedTrip = {
      id: trip.id,
      departure_time: trip.departure_time,
      arrival_time: trip.arrival_time,
      price_kz: priceKz,
      available_seats: trip.available_seats,
      is_campaign: !!trip.is_campaign,
      origin: trip.routes.origin_city,
      destination: trip.routes.destination_city,
      seat_capacity: trip.buses.capacity,
      route: `${trip.routes.origin_city} → ${trip.routes.destination_city}`,
    };

    return Response.json({ trip: formattedTrip });

  } catch (err) {
    console.error('API Error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
