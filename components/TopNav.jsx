'use client';

import { LogOut, Printer, Home, History, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export function TopNav({ agentName = '', printerConnected = false, currentPath = '' }) {
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const navItems = [
    { href: '/dashboard', label: 'Painel', icon: Home },
    { href: '/history', label: 'Histórico', icon: History },
    { href: '/new-ticket', label: 'Nova Venda', icon: Plus },
  ];

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-gray-900">NawaBus Agente</h1>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-6">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <Button
                  variant={currentPath === href ? 'default' : 'ghost'}
                  size="sm"
                  className={`flex items-center gap-2 ${
                    currentPath === href ? 'bg-brand-500 text-white hover:bg-brand-600' : ''
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              <Badge variant={printerConnected ? 'default' : 'destructive'}>
                {printerConnected ? 'Impressora ligada' : 'Sem impressora'}
              </Badge>
            </div>

            <span className="text-gray-700">Olá, {agentName || 'Agente'}</span>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
