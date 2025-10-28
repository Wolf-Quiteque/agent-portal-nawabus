'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTicketWizardStore } from '@/lib/store';
import { Armchair } from 'lucide-react';

export function SeatPickerCard() {
  const { selectedTrip, selectedSeat, setSeat, nextStep } = useTicketWizardStore();
  const [occupiedSeats, setOccupiedSeats] = useState(new Set());

  // load occupied seats once trip is selected
  useEffect(() => {
    const loadOccupiedSeats = async () => {
      if (!selectedTrip?.id) return;
      try {
        const response = await fetch(`/api/trip-seats?tripId=${selectedTrip.id}`);
        if (response.ok) {
          const data = await response.json();
          setOccupiedSeats(new Set(data.occupiedSeats || []));
        }
      } catch (error) {
        console.error('Erro ao carregar lugares ocupados:', error);
      }
    };

    loadOccupiedSeats();
  }, [selectedTrip?.id]);

  const handleSeatSelect = (seatNumber) => {
    if (occupiedSeats.has(seatNumber)) return; // lugar bloqueado
    setSeat(seatNumber);
  };

  const confirmSeatSelection = () => {
    if (selectedSeat) {
      nextStep();
    }
  };

  if (!selectedTrip) {
    return (
      <div className="text-center py-8 text-gray-500">
        Nenhuma viagem selecionada. Volte ao passo anterior.
      </div>
    );
  }

  // capacidade total do autocarro (vem do /api/search-trips como bus_capacity)
  const totalSeats = selectedTrip.bus_capacity || 50;

  // cálculo de disponibilidade real
  const lugaresDisponiveis = totalSeats - occupiedSeats.size;

  // layout:
  // - cada fila "normal" = 4 lugares: [L1, L2] corredor [R1, R2]
  // - resto (se sobrar 1,2,3 lugares) vira banco traseiro pegado
  const seatsPerRow = 4;
  const fullRows = Math.floor(totalSeats / seatsPerRow);
  const remainder = totalSeats % seatsPerRow;

  // gera estrutura dos assentos
  const rows = useMemo(() => {
    const list = [];
    let currentSeat = 1;

    for (let r = 0; r < fullRows; r++) {
      // esquerda (2 lugares)
      const left = [currentSeat, currentSeat + 1];
      // direita (2 lugares)
      const right = [currentSeat + 2, currentSeat + 3];
      currentSeat += 4;

      list.push({
        type: 'row',
        left,
        right,
      });
    }

    // se sobrarem lugares, criamos fila traseira única
    if (remainder > 0) {
      const back = [];
      for (let i = 0; i < remainder; i++) {
        back.push(currentSeat + i);
      }
      list.push({
        type: 'back',
        seats: back,
      });
    }

    return list;
  }, [fullRows, remainder, totalSeats]);

  const renderSeatButton = (seatNumber) => {
    const isOccupied = occupiedSeats.has(seatNumber);
    const isSelected = selectedSeat === seatNumber;

    return (
      <button
        key={seatNumber}
        onClick={() => handleSeatSelect(seatNumber)}
        disabled={isOccupied}
        className={`
          w-12 h-12 rounded border-2 flex items-center justify-center text-xs font-medium transition-all
          ${
            isOccupied
              ? 'bg-gray-400 border-gray-400 text-gray-600 cursor-not-allowed'
              : isSelected
              ? 'bg-brand-500 border-brand-600 text-white shadow-lg'
              : 'bg-white border-gray-300 hover:border-brand-400 hover:bg-brand-50'
          }
        `}
      >
        {isOccupied ? 'X' : seatNumber}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Info topo */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-2">Mapa de Lugares - {selectedTrip.route}</h3>
          <p className="text-sm text-gray-600">
            Capacidade total: {totalSeats} lugares | Lugares disponíveis: {lugaresDisponiveis}
          </p>
        </CardContent>
      </Card>

      {/* Desenho do autocarro */}
      <div className="flex justify-center">
        <div className="inline-block p-6 border-2 border-gray-300 rounded-lg bg-gradient-to-t from-gray-100 to-white">
          {/* Frente */}
          <div className="text-center mb-4">
            <div className="w-8 h-8 bg-blue-500 rounded mx-auto mb-2"></div>
            <span className="text-sm font-medium">Frente do Autocarro</span>
          </div>

          <div className="flex flex-col gap-3">
            {rows.map((row, idx) => {
              if (row.type === 'row') {
                return (
                  <div
                    key={`row-${idx}`}
                    className="flex items-center justify-center gap-6"
                  >
                    {/* lado esquerdo (2 lugares) */}
                    <div className="flex gap-2">
                      {row.left.map((seatNum) => renderSeatButton(seatNum))}
                    </div>

                    {/* corredor */}
                    <div className="w-4" />

                    {/* lado direito (2 lugares) */}
                    <div className="flex gap-2">
                      {row.right.map((seatNum) => renderSeatButton(seatNum))}
                    </div>
                  </div>
                );
              } else {
                // fila de trás (banco contínuo)
                return (
                  <div
                    key={`back-${idx}`}
                    className="flex items-center justify-center gap-2 mt-4"
                  >
                    {row.seats.map((seatNum) => renderSeatButton(seatNum))}
                  </div>
                );
              }
            })}
          </div>

          {/* Traseira */}
          <div className="text-center mt-4">
            <div className="w-8 h-8 bg-red-500 rounded mx-auto mb-2"></div>
            <span className="text-sm font-medium">Traseira do Autocarro</span>
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex justify-center flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-white border border-gray-300 rounded" />
          <span className="text-sm">Disponível</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-brand-500 border border-brand-600 rounded" />
          <span className="text-sm">Selecionado</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-400 border border-gray-400 rounded" />
          <span className="text-sm">Ocupado</span>
        </div>
      </div>

      {/* Assento escolhido */}
      {selectedSeat && (
        <Card className="border-brand-500 bg-brand-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Armchair className="h-5 w-5 text-brand-600" />
              <span className="font-medium">
                Lugar selecionado: {selectedSeat}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Botão Confirmar */}
      <div className="flex justify-center">
        <Button
          onClick={confirmSeatSelection}
          disabled={!selectedSeat}
          className="bg-brand-500 hover:bg-brand-600 px-8"
        >
          Confirmar Lugar {selectedSeat || ''}
        </Button>
      </div>
    </div>
  );
}
