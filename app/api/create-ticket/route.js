import { requireAgentRole } from '@/lib/server-auth';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const pricingAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function generateReferenceCode() {
  const ts = Date.now().toString();
  const tail = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return ts.slice(-8) + tail;
}

export async function POST(request) {
  try {
    const { supabase, user } = await requireAgentRole();
    const body = await request.json();
    const {
      trip_id,
      passenger_id,
      seat_number,
      payment_method,
      payment_reference,
      promotion_code,
    } = body;

    if (!trip_id || !passenger_id || !seat_number || !payment_method) {
      return Response.json({ error: 'Campos obrigatorios em falta' }, { status: 400 });
    }

    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .select('id, seat_class, price_usd')
      .eq('id', trip_id)
      .single();
    if (tripErr || !trip) {
      return Response.json({ error: 'Viagem nao encontrada' }, { status: 400 });
    }

    let promotion = null;
    if (String(promotion_code || '').trim()) {
      const { data, error } = await pricingAdmin.rpc('resolve_promotion_for_ticket', {
        p_code: String(promotion_code).trim().toUpperCase(),
        p_base_fare_kz: Number(trip.price_usd),
        p_passenger_id: passenger_id,
      });
      if (error) return Response.json({ error: error.message }, { status: 400 });
      promotion = Array.isArray(data) ? data[0] : data;
    }
    const amountDue = Number(promotion?.amount_due_kz ?? trip.price_usd);
    const payment_status = payment_method === 'cash' ? 'paid' : 'pending';
    let finalReference = payment_reference || null;
    if (payment_method === 'referencia' && !finalReference) {
      finalReference = generateReferenceCode();
    }

    const { data: newTicket, error: ticketErr } = await supabase
      .from('tickets')
      .insert({
        trip_id,
        passenger_id,
        booked_by: user.id,
        booking_source: 'agent',
        seat_class: trip.seat_class,
        seat_number,
        qr_code_data: crypto.randomUUID(),
        price_paid_usd: amountDue,
        promotion_code_id: promotion?.promotion_code_id || null,
        promotion_code_snapshot: promotion?.normalized_code || null,
        base_fare_kz: Number(trip.price_usd),
        passenger_discount_kz: Number(promotion?.passenger_discount_kz || 0),
        affiliate_commission_kz: Number(promotion?.commission_amount_kz || 0),
        attribution_source: promotion ? 'agent_web' : null,
        payment_status,
        payment_method,
        payment_reference: finalReference,
      })
      .select('id, ticket_number')
      .single();
    if (ticketErr || !newTicket) {
      console.error('[create-ticket] ticketErr:', ticketErr);
      const limitReached = ticketErr?.code === 'P0001' && /sales limit/i.test(ticketErr.message || '');
      return Response.json(
        { error: limitReached ? 'A viagem atingiu o limite de vendas definido.' : 'Erro ao criar bilhete' },
        { status: limitReached ? 409 : 500 }
      );
    }

    const { error: payErr } = await supabase.from('payment_transactions').insert({
      ticket_id: newTicket.id,
      amount_usd: amountDue,
      currency: 'AOA',
      payment_method,
      transaction_id: finalReference || null,
      status: payment_method === 'cash' ? 'completed' : 'pending',
      promotion_code_id: promotion?.promotion_code_id || null,
      base_amount_kz: Number(trip.price_usd),
      discount_amount_kz: Number(promotion?.passenger_discount_kz || 0),
      affiliate_commission_kz: Number(promotion?.commission_amount_kz || 0),
      attribution_source: promotion ? 'agent_web' : null,
    });
    if (payErr) console.error('[create-ticket] payment transaction:', payErr);

    return Response.json({
      ticket_id: newTicket.id,
      ticket_number: newTicket.ticket_number,
      payment_reference: finalReference,
      amount_kz: amountDue,
      discount_kz: Number(promotion?.passenger_discount_kz || 0),
    });
  } catch (err) {
    console.error('[create-ticket] API Error:', err);
    return Response.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
