import { requireAgentRole } from '@/lib/server-auth';
import { TopNav } from '@/components/TopNav';
import { Toaster } from 'sonner';

export default async function HistoryLayout({ children }) {
  // This will redirect if not authenticated or not agent/admin
  const { supabase, user } = await requireAgentRole();

  let agentName = 'Agente';
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single();

    if (profile) {
      agentName = `${profile.first_name} ${profile.last_name}`;
    }
  } catch (error) {
    console.error('Error getting profile:', error);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav
        agentName={agentName}
        printerConnected={false}
        currentPath="/history"
      />
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
      <Toaster position="top-right" />
    </div>
  );
}
