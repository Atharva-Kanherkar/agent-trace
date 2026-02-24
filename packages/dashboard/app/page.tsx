import { DashboardShell } from "../components/dashboard-shell";
import { fetchHomeData } from "../src/next-data";

export default async function HomePage() {
  const home = await fetchHomeData();

  return (
    <DashboardShell
      initialSessions={home.data.sessions}
      initialCostPoints={home.data.costPoints}
      {...(home.warning !== undefined ? { initialWarning: home.warning } : {})}
    />
  );
}
