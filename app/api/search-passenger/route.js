import { NextResponse } from 'next/server';
import { requireAgentRole } from '@/lib/server-auth';

// GET /api/search-passenger?phone=923000111
export async function GET(req) {
  try {
    const { supabase } = await requireAgentRole();
    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json(
        { error: 'Parâmetro "phone" é obrigatório' },
        { status: 400 }
      );
    }

    // 1. Tenta achar perfil com esse número e role = 'passenger'
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, phone_number, role')
      .eq('phone_number', phone)
      .limit(1)
      .maybeSingle();

      console.log("profile", profile);

    // Se erro diferente de "nenhum resultado", loga
    if (profileError && profileError.code !== 'PGRST116') {
      console.error('Profile error:', profileError);
    }

    if (!profile) {
      // não existe passageiro ainda
      return NextResponse.json({
        found: false,
        passenger: null,
      });
    }

    // 2. Busca info extra do passageiro (emergency contact etc)
    const { data: extraInfo, error: extraError } = await supabase
      .from('passengers')
      .select(
        'emergency_contact_name, emergency_contact_phone, passport_number, nationality'
      )
      .eq('id', profile.id)
      .limit(1)
      .maybeSingle();

    if (extraError && extraError.code !== 'PGRST116') {
      console.error('Passenger extra error:', extraError);
    }

    const passenger = {
      id: profile.id,
      first_name: profile.first_name,
      last_name: profile.last_name,
      phone_number: profile.phone_number,
      emergency_contact_name: extraInfo?.emergency_contact_name || '',
      emergency_contact_phone: extraInfo?.emergency_contact_phone || '',
      passport_number: extraInfo?.passport_number || '',
      nationality: extraInfo?.nationality || '',
    };

    return NextResponse.json({
      found: true,
      passenger,
    });
  } catch (err) {
    console.error('Unhandled /search-passenger error:', err);
    return NextResponse.json(
      { error: 'Erro interno ao procurar passageiro' },
      { status: 500 }
    );
  }
}
