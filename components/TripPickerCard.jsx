'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useTicketWizardStore } from '@/lib/store';
import { MapPin, Clock, Users, DollarSign } from 'lucide-react';

export function TripPickerCard() {
  const { selectedTrip, setTrip, nextStep } = useTicketWizardStore();

  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    origin: '',
    destination: '',
    date: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    handleSearch();
  }, []);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleSearch = async () => {
    if (!filters.origin || !filters.destination) {
      setTrips([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        origin: filters.origin,
        destination: filters.destination,
        date: filters.date,
      });

      const response = await fetch(`/api/search-trips?${params}`);
      if (response.ok) {
        const data = await response.json();
        setTrips(data.trips || []);
      } else {
        setTrips([]);
      }
    } catch (error) {
      console.error('Error searching trips:', error);
      setTrips([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTrip = (trip) => {
    setTrip(trip);
    nextStep();
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg bg-gray-50">
        <div>
          <Label htmlFor="origin">Origem</Label>
          <Input
            id="origin"
            placeholder="Ex: Luanda"
            value={filters.origin}
            onChange={(e) => handleFilterChange('origin', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="destination">Destino</Label>
          <Input
            id="destination"
            placeholder="Ex: Benguela"
            value={filters.destination}
            onChange={(e) => handleFilterChange('destination', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="date">Data</Label>
          <Input
            id="date"
            type="date"
            value={filters.date}
            onChange={(e) => handleFilterChange('date', e.target.value)}
          />
        </div>
        <div className="md:col-span-3 flex justify-end">
          <Button onClick={handleSearch} disabled={loading}>
            {loading ? 'Procurando...' : 'Procurar Viagens'}
          </Button>
        </div>
      </div>

      {/* Selected Trip Display */}
      {selectedTrip && (
        <div className="p-4 border-2 border-brand-500 rounded-lg bg-brand-50">
          <h3 className="font-semibold text-lg mb-2 text-brand-700">Viagem Selecionada</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <MapPin className="inline h-4 w-4 mr-1" />
              {selectedTrip.route}
            </div>
            <div>
              <Clock className="inline h-4 w-4 mr-1" />
              {format(new Date(selectedTrip.departure_time), 'dd/MM/yyyy HH:mm', { locale: pt })}
            </div>
            <div>
              <Users className="inline h-4 w-4 mr-1" />
              {selectedTrip.available_seats} lugares disponíveis
            </div>
            <div>
              <DollarSign className="inline h-4 w-4 mr-1" />
              {selectedTrip.price_kz.toLocaleString()} Kz
            </div>
          </div>
        </div>
      )}

      {/* Trips List */}
      <div className="space-y-4">
        {!loading && trips.length === 0 && (filters.origin && filters.destination) && (
          <div className="text-center py-8 text-gray-500">
            Nenhuma viagem encontrada para estes critérios.
          </div>
        )}

        {trips.map(trip => (
          <Card
            key={trip.id}
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedTrip?.id === trip.id ? 'ring-2 ring-brand-500 bg-brand-50' : ''
            }`}
            onClick={() => handleSelectTrip(trip)}
          >
            <CardContent className="p-4">
              <div className="flex justify-between items-center">
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">{trip.route}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                    <div>
                      <Clock className="inline h-4 w-4 mr-1" />
                      Partida: {format(new Date(trip.departure_time), 'dd/MM/yyyy HH:mm', { locale: pt })}
                    </div>
                    <div>
                      <Users className="inline h-4 w-4 mr-1" />
                      Lugares disponíveis: {trip.available_seats}
                    </div>
                    <div>
                      <DollarSign className="inline h-4 w-4 mr-1" />
                      Preço: {trip.price_kz.toLocaleString()} Kz
                    </div>
                  </div>
                </div>
                <Button
                  className="bg-brand-500 hover:bg-brand-600"
                  disabled={trip.available_seats === 0}
                >
                  {selectedTrip?.id === trip.id ? 'Selecionada' : 'Escolher'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
