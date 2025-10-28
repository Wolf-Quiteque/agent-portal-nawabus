import { requireAgentRole } from '@/lib/server-auth';

// helper to generate the same style of referência on server
function generateReferenceCode() {
  const ts = Date.now().toString();
  const tail = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return ts.slice(-8) + tail;
}

export async function POST(request) {
  try {
    const { supabase, user } = await requireAgentRole(); // user.id = agente que está a vender
    const body = await request.json();

    const {
      trip_id,
      passenger_id,
      seat_number,
      payment_method,      // 'cash' | 'referencia'
      payment_reference,   // may be null/undefined
    } = body;

    if (!trip_id || !passenger_id || !seat_number || !payment_method) {
      return Response.json(
        { error: 'Campos obrigatórios em falta' },
        { status: 400 }
      );
    }

    // Buscar info da viagem
    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .select('id, seat_class, price_usd')
      .eq('id', trip_id)
      .single();

    if (tripErr || !trip) {
      console.error('[create-ticket] tripErr:', tripErr);
      return Response.json(
        { error: 'Viagem não encontrada' },
        { status: 400 }
      );
    }

    // Definir estado do pagamento
    const payment_status = payment_method === 'cash' ? 'paid' : 'pending';

    // Garantir que temos uma referência final se método é referencia
    let finalReference = payment_reference || null;
    if (payment_method === 'referencia' && !finalReference) {
      finalReference = generateReferenceCode();
    }

    // Criar dado básico do bilhete
    // IMPORTANTE: ticket_number é gerado por trigger na DB
    //             SMS também é enviado pela DB
    //             lugares disponíveis são ajustados por trigger
    const qrData = crypto.randomUUID();

    const { data: newTicket, error: ticketErr } = await supabase
      .from('tickets')
      .insert({
        trip_id,
        passenger_id,
        booked_by: user.id,
        booking_source: 'agent',
        seat_class: trip.seat_class,
        seat_number,
        qr_code_data: qrData,
        price_paid_usd: trip.price_usd,
        payment_status,
        payment_method,
        payment_reference: finalReference,
      })
      .select('id, ticket_number')
      .single();

    if (ticketErr || !newTicket) {
      console.error('[create-ticket] ticketErr:', ticketErr);
      return Response.json(
        { error: 'Erro ao criar bilhete' },
        { status: 500 }
      );
    }

    // Criar transação de pagamento (auditoria)
    const transactionStatus = payment_method === 'cash' ? 'completed' : 'pending';

    const { error: payErr } = await supabase
      .from('payment_transactions')
      .insert({
        ticket_id: newTicket.id,
        amount_usd: trip.price_usd,
        currency: 'USD',
        payment_method,
        transaction_id: finalReference || null,
        status: transactionStatus,
      });

    if (payErr) {
      console.error('[create-ticket] payment_transactions error:', payErr);
      // não damos throw aqui porque o bilhete já existe,
      // mas avisamos no log
    }

    return Response.json(
      {
        ticket_id: newTicket.id,
        ticket_number: newTicket.ticket_number,
        payment_reference: finalReference,
      },
      { status: 200 }
    );

  } catch (err) {
    console.error('[create-ticket] API Error:', err);
    return Response.json(
      { error: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
