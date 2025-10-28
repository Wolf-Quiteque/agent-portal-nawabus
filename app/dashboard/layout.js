import { requireAgentRole } from '@/lib/server-auth';
import { TopNav } from '@/components/TopNav';

export default async function DashboardLayout({ children }) {
  // This will redirect if not authenticated or not agent/admin
  const { supabase, user } = await requireAgentRole();

  // Get agent profile
  let profile = null;
  try {
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    profile = userProfile;
  } catch (error) {
    console.error('Error getting profile:', error);
  }

  const agentName = profile ? `${profile.first_name} ${profile.last_name}` : 'Agente';

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav agentName={agentName} printerConnected={false} />
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
